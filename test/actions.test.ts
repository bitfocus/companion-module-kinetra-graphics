// Every command in Kinetra's fixture can be sent by a module action, with exactly the fixture's
// arguments: the module and the app agree on the contract.
import { describe, expect, it } from 'vitest'
import { actionDefinitions } from '../src/actions.js'
import { fixture, sampleState } from './helpers.js'
import { call, fakeHost } from './host.js'

/** Fixture action → the module action and the options an operator would pick. */
const PICKS: Record<string, [string, Record<string, unknown>]> = {
	take: ['take', { layer: 's1main01ab.l1' }],
	clear: ['clear', { layer: 's1main01ab.l1' }],
	toggle: ['toggle', { layer: 's1main01ab.l1' }],
	update: ['update', { layer: 's1main01ab.l1' }],
	set_fields: ['set_text', { layer: 's1main01ab.l1', field: 'name', value: 'Ingrid Vale', take: true }],
	run_cue: ['run_cue', { cue: 'cue0000001' }],
	go_next: ['go_next', {}],
	clear_screen: ['clear_screen', { screen: 's1main01ab' }],
	clear_all: ['clear_all', {}],
	panic: ['panic', {}],
	source_step: ['source_step', { source: 'guests0001', dir: 'next' }],
	media: ['media', { layer: 's1main01ab.m1', op: 'seek', sec: 0 }],
	set_level: ['set_level', { layer: 's1main01ab.l1', target: 'opacity', percent: 50 }],
	studio_take: ['studio_take', { screen: 's1main01ab', transition: 'cut' }],
	timer: ['timer', { layer: 's1main01ab.l2', field: 'clock', op: 'start' }],
	automation: ['automation', { off: 'toggle' }],
	run_flow: ['run_flow', { flow: 'goal000001', value: 'Home 2–1' }],
}

describe('actions', () => {
	it("send exactly the fixture's command for every action Kinetra has", async () => {
		expect(Object.keys(PICKS).sort()).toEqual([...fixture.actions].sort())
		const host = fakeHost(sampleState())
		const defs = actionDefinitions(host, host.state) as Record<string, unknown>
		for (const example of fixture.messages.commands) {
			const [id, options] = PICKS[example.action]
			host.commands.length = 0
			await call(defs[id], options)
			expect(host.commands, `${example.action} via ${id}`).toEqual([{ action: example.action, args: example.args }])
		}
	})

	it('offer the state as dropdowns, defaulting to the first item', () => {
		const host = fakeHost(sampleState())
		const defs = actionDefinitions(host, host.state)
		const opt = (id: keyof typeof defs, key: string) =>
			(defs[id] as { options: { id: string; choices?: { id: string }[]; default?: unknown }[] }).options.find(
				(o) => o.id === key,
			)
		expect(opt('take', 'layer')?.choices?.map((c) => c.id)).toEqual(['s1main01ab.m1', 's1main01ab.l2', 's1main01ab.l1'])
		expect(opt('take', 'layer')?.default).toBe('s1main01ab.m1')
		// Only template graphics have text; only media plays.
		expect(opt('set_text', 'layer')?.choices?.map((c) => c.id)).toEqual(['s1main01ab.l2', 's1main01ab.l1'])
		expect(opt('media', 'layer')?.choices?.map((c) => c.id)).toEqual(['s1main01ab.m1'])
		expect(opt('run_flow', 'flow')?.choices).toEqual([{ id: 'goal000001', label: 'Goal' }])
		expect(opt('set_level', 'target')?.choices?.[0]).toEqual({ id: 'opacity', label: 'Opacity' })
	})

	it('still exist, with empty dropdowns, while Kinetra is away', () => {
		const host = fakeHost(null)
		const defs = actionDefinitions(host, null)
		expect(Object.keys(defs)).toHaveLength(18)
		const layer = (defs.take as { options: { default: unknown; choices: unknown[] }[] }).options[0]
		expect(layer.choices).toEqual([])
		expect(layer.default).toBe('')
	})

	it('Set fields (JSON) sends several fields, and refuses what is not an object', async () => {
		const host = fakeHost(sampleState())
		const defs = actionDefinitions(host, host.state)
		await call(defs.set_fields_json, { layer: 's1main01ab.l1', values: '{"name":"Ada","title":"Host"}', take: false })
		expect(host.commands).toEqual([
			{ action: 'set_fields', args: { layer: 's1main01ab.l1', values: { name: 'Ada', title: 'Host' }, take: false } },
		])
		for (const bad of ['[1]', 'nope', '"text"']) {
			await call(defs.set_fields_json, { layer: 's1main01ab.l1', values: bad, take: false })
		}
		expect(host.commands).toHaveLength(1)
		expect(host.logs.filter((l) => l.level === 'warn')).toHaveLength(3)
	})

	it('Automation on / off, levels clamped, an empty flow value left out', async () => {
		const host = fakeHost(sampleState())
		const defs = actionDefinitions(host, host.state)
		await call(defs.automation, { off: 'off' })
		await call(defs.automation, { off: 'on' })
		await call(defs.set_level, { layer: 's1main01ab.l1', target: 'var:radius', percent: 150 })
		await call(defs.run_flow, { flow: 'goal000001', value: '' })
		await call(defs.media, { layer: 's1main01ab.m1', op: 'play', sec: 12 })
		expect(host.commands.map((c) => c.args)).toEqual([
			{ off: true },
			{ off: false },
			{ layer: 's1main01ab.l1', target: 'var:radius', value: 1 },
			{ flow: 'goal000001' },
			{ layer: 's1main01ab.m1', op: 'play' },
		])
	})
})
