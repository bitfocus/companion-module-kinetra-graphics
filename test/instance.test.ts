// The module instance against the mock Kinetra, with Companion's InstanceBase stubbed: definitions
// are rebuilt only when the structure changes, only changed variables are sent, only the affected
// feedbacks are checked, the tick runs only while something counts, and destroy leaves nothing.
import { afterEach, describe, expect, it, vi } from 'vitest'
import { fixture } from './helpers.js'
import { MockKinetra } from './mock-kinetra.js'

const calls = vi.hoisted(() => ({ log: [] as { name: string; args: unknown[] }[] }))

vi.mock('@companion-module/base', async (importOriginal) => {
	const real = await importOriginal<typeof import('@companion-module/base')>()
	const record =
		(name: string) =>
		(...args: unknown[]) =>
			calls.log.push({ name, args })
	class InstanceBase {
		label = 'kinetra'
		setActionDefinitions = record('setActionDefinitions')
		setFeedbackDefinitions = record('setFeedbackDefinitions')
		setVariableDefinitions = record('setVariableDefinitions')
		setPresetDefinitions = record('setPresetDefinitions')
		setVariableValues = record('setVariableValues')
		checkFeedbacks = record('checkFeedbacks')
		checkAllFeedbacks = record('checkAllFeedbacks')
		updateStatus = record('updateStatus')
		log = record('log')
	}
	return { ...real, InstanceBase }
})

const { default: ModuleInstance } = await import('../src/main.js')

let mock: MockKinetra | null = null
let instance: InstanceType<typeof ModuleInstance> | null = null

afterEach(async () => {
	await instance?.destroy()
	await mock?.stop()
	instance = null
	mock = null
	calls.log.length = 0
})

const named = (name: string) => calls.log.filter((c) => c.name === name)

async function until(what: string, f: () => boolean, ms = 3000): Promise<void> {
	const end = Date.now() + ms
	while (!f()) {
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
		await new Promise((r) => setTimeout(r, 5))
	}
}

async function started() {
	mock = await MockKinetra.start()
	instance = new ModuleInstance({})
	await instance.init({ host: '127.0.0.1', port: mock.port }, true, { token: 'kt_test' })
	await until('connected', () => instance!.connected && named('setVariableValues').length > 0)
	return instance
}

describe('instance', () => {
	it('builds the definitions with no state, then once more when connected', async () => {
		await started()
		// init (empty), then the snapshot (Kinetra's structure).
		expect(named('setActionDefinitions')).toHaveLength(2)
		expect(named('setPresetDefinitions')).toHaveLength(2)
		const values = named('setVariableValues').at(-1)!.args[0] as Record<string, unknown>
		expect(values).toMatchObject({ connected: true, field_s1main01ab_l1_name: 'Ingrid Vale' })
		expect(named('updateStatus').at(-1)!.args[0]).toBe('ok')
		expect(named('checkAllFeedbacks').length).toBeGreaterThan(0)
	})

	it('a value change sends just that value and checks just those feedbacks; a rename rebuilds', async () => {
		const inst = await started()
		const before = calls.log.length
		mock!.broadcast(fixture.messages.diff)
		await until('diff applied', () => inst.kinetraState?.layers['s1main01ab.l1'].on_air === true)
		await until('values sent', () => calls.log.slice(before).some((c) => c.name === 'setVariableValues'))
		const after = calls.log.slice(before)
		expect(after.filter((c) => c.name === 'setActionDefinitions')).toHaveLength(0)
		expect(after.find((c) => c.name === 'setVariableValues')!.args[0]).toEqual({ layer_s1main01ab_l1_onair: true })
		expect(after.find((c) => c.name === 'checkFeedbacks')!.args).toEqual([
			'layer_on_air',
			'layer_pending',
			'layer_not_ready',
			'media_playing',
		])
		expect(after.filter((c) => c.name === 'checkAllFeedbacks')).toHaveLength(0)

		const mark = calls.log.length
		mock!.broadcast({ t: 'diff', seq: 2, ops: [{ op: 'put', path: '/layers/s1main01ab.l1/name', value: 'Guest' }] })
		await until('rebuilt', () => calls.log.slice(mark).some((c) => c.name === 'setPresetDefinitions'))
		expect(calls.log.slice(mark).filter((c) => c.name === 'setActionDefinitions')).toHaveLength(1)
	})

	it('ticks only while a timer runs, and stops on destroy', async () => {
		const inst = await started()
		const now = inst.serverNow()
		const clock = JSON.stringify({ run: true, at: now, base: 600_000, dir: 'down', end: 'stop' })
		mock!.broadcast({
			t: 'diff',
			seq: 1,
			ops: [{ op: 'put', path: '/layers/s1main01ab.l2/values/clock', value: clock }],
		})
		const mark = calls.log.length
		await until(
			'a tick',
			() =>
				calls.log
					.slice(mark)
					.filter((c) => c.name === 'setVariableValues')
					.some((c) => (c.args[0] as Record<string, unknown>).timer_s1main01ab_l2_clock === '9:59'),
			3000,
		)
		await inst.destroy()
		const stopped = calls.log.length
		await new Promise((r) => setTimeout(r, 1300))
		expect(calls.log.length).toBe(stopped)
		instance = null
	})

	it('going away shows the status and connected false, but keeps the definitions', async () => {
		const inst = await started()
		const built = named('setActionDefinitions').length
		mock!.closeAll(4409)
		await until('api off', () => !inst.connected && named('setVariableValues').length > 1)
		const values = named('setVariableValues').at(-1)!.args[0] as Record<string, unknown>
		expect(values.connected).toBe(false)
		expect(named('updateStatus').some((c) => c.args[0] === 'connection_failure')).toBe(true)
		// No rebuild to empty dropdowns while Kinetra is away; the config can still be edited.
		expect(named('setActionDefinitions')).toHaveLength(built)
		await inst.configUpdated({ host: '127.0.0.1', port: mock!.port }, { token: 'kt_test' })
		const defs = named('setActionDefinitions').at(-1)!.args[0] as Record<string, { options: { choices?: unknown[] }[] }>
		expect(defs.take.options[0].choices).toHaveLength(3)
		// Back with the same structure: no rebuild, just values.
		const rebuilt = named('setActionDefinitions').length
		await until('back', () => inst.connected)
		await new Promise((r) => setTimeout(r, 50))
		expect(named('setActionDefinitions')).toHaveLength(rebuilt)
	})
})
