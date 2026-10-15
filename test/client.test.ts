// The client against the mock Kinetra: connecting, state, commands and every status case with its
// retry rule. Timings are shortened; the rules are the same as live.
import { afterEach, describe, expect, it } from 'vitest'
import { KinetraClient, type ClientStatus, type Timing } from '../src/kinetra/client.js'
import { CloseCode, SUBPROTOCOL, type State } from '../src/kinetra/protocol.js'
import type { Area } from '../src/kinetra/state.js'
import { fixture } from './helpers.js'
import { MockKinetra } from './mock-kinetra.js'

const FAST: Partial<Timing> = {
	backoffMs: [20, 20, 20],
	steadyMs: 20,
	jitter: 0,
	resetAfterMs: 1000,
	helloTimeoutMs: 300,
	silenceMs: 3000,
	commandTimeoutMs: 200,
	apiOffRetryMs: 30,
	tooManyAttemptsRetryMs: 30,
	disconnectedRetryMs: 30,
}

interface Seen {
	statuses: ClientStatus['kind'][]
	snapshots: State[]
	diffs: Set<Area>[]
	logs: string[]
}

let clients: KinetraClient[] = []
let mocks: MockKinetra[] = []

afterEach(async () => {
	for (const c of clients) c.stop()
	for (const m of mocks) await m.stop()
	clients = []
	mocks = []
})

async function mock(): Promise<MockKinetra> {
	const m = await MockKinetra.start()
	mocks.push(m)
	return m
}

function client(port: number, token = 'kt_test', timing: Partial<Timing> = {}): [KinetraClient, Seen] {
	const seen: Seen = { statuses: [], snapshots: [], diffs: [], logs: [] }
	const c = new KinetraClient(
		{ host: '127.0.0.1', port, token, clientName: 'test-module/1.0.0', timing: { ...FAST, ...timing } },
		{
			status: (s) => seen.statuses.push(s.kind),
			snapshot: (s) => seen.snapshots.push(s),
			diff: (_s, t) => seen.diffs.push(t),
			log: (_l, m) => seen.logs.push(m),
		},
	)
	clients.push(c)
	c.start()
	return [c, seen]
}

async function until(what: string, f: () => boolean, ms = 3000): Promise<void> {
	const end = Date.now() + ms
	while (!f()) {
		if (Date.now() > end) throw new Error(`timed out waiting for ${what}`)
		await new Promise((r) => setTimeout(r, 5))
	}
}

const sleep = async (ms: number) => new Promise((r) => setTimeout(r, ms))

describe('client', () => {
	it('connects with the token and subprotocol, says hello, and holds the snapshot', async () => {
		const m = await mock()
		const [c, seen] = client(m.port)
		await until('connected', () => c.status.kind === 'connected')
		expect(m.upgrades[0].authorization).toBe('Bearer kt_test')
		expect(m.upgrades[0]['sec-websocket-protocol']).toBe(SUBPROTOCOL)
		// Kinetra refuses any Origin: the module must not send one.
		expect(m.upgrades[0].origin).toBeUndefined()
		expect(m.sent('hello')).toEqual([{ t: 'hello', protocol: 1, client: 'test-module/1.0.0' }])
		expect(seen.statuses).toEqual(['connecting', 'connected'])
		expect(seen.snapshots).toHaveLength(1)
		expect(c.state?.screens.s1main01ab.name).toBe('Main')
		// Kinetra's clock from welcome.now.
		expect(Math.abs(c.serverNow() - Date.now() - (fixture.messages.welcome.now - Date.now()))).toBeLessThan(1000)
	})

	it('applies diffs and asks for a resync once when one does not fit', async () => {
		const m = await mock()
		const [c, seen] = client(m.port)
		await until('connected', () => c.status.kind === 'connected')
		m.broadcast(fixture.messages.diff)
		await until('diff', () => seen.diffs.length === 1)
		expect(seen.diffs[0]).toEqual(new Set(['layers']))
		expect(c.state?.layers['s1main01ab.l1'].on_air).toBe(true)
		// seq 5 after 1: a gap. Two of them: one resync.
		m.broadcast({ t: 'diff', seq: 5, ops: [] })
		m.broadcast({ t: 'diff', seq: 6, ops: [] })
		await until('resync answered', () => seen.snapshots.length === 2)
		expect(m.sent('resync')).toHaveLength(1)
		expect(c.state?.layers['s1main01ab.l1'].on_air).toBe(false)
	})

	it('matches command results; refusals come back as results, never thrown', async () => {
		const m = await mock()
		const [c] = client(m.port)
		expect(await c.command('take', { layer: 'x.y' })).toMatchObject({ ok: false, code: 'not_connected' })
		await until('connected', () => c.status.kind === 'connected')
		expect(await c.command('take', { layer: 's1main01ab.l1' })).toMatchObject({ ok: true })
		expect(m.sent('command')[0]).toMatchObject({ action: 'take', args: { layer: 's1main01ab.l1' } })
		m.onCommand = (cmd) => ({
			t: 'result',
			corr: cmd.corr,
			ok: false,
			code: 'not_found',
			message: "That graphic doesn't exist.",
		})
		expect(await c.command('take', { layer: 'x.y' })).toMatchObject({ ok: false, code: 'not_found' })
		m.onCommand = null
		expect(await c.command('panic')).toMatchObject({ ok: false, code: 'timeout' })
	})

	it('a wrong token stops until the config changes', async () => {
		const m = await mock()
		const [c, seen] = client(m.port, 'kt_wrong')
		await until('refused', () => c.status.kind === 'wrongToken')
		await sleep(150)
		expect(m.upgrades).toHaveLength(1)
		expect(seen.statuses).toEqual(['connecting', 'wrongToken'])
	})

	it('Control API off, too many clients and too many wrong tokens retry', async () => {
		const m = await mock()
		m.refuse = { status: 503, code: 'disabled' }
		const [c] = client(m.port)
		await until('api off', () => c.status.kind === 'apiOff')
		await until('retried', () => m.upgrades.length >= 3)
		m.refuse = { status: 503, code: 'busy' }
		await until('busy', () => c.status.kind === 'tooManyClients')
		m.refuse = { status: 429, code: 'rate_limited' }
		await until('locked out', () => c.status.kind === 'tooManyAttempts')
		m.refuse = null
		await until('connected', () => c.status.kind === 'connected')
	})

	it('close codes: token changed stops, the others retry', async () => {
		const m = await mock()
		const [c, seen] = client(m.port)
		const reconnects = async (code: number, kind: ClientStatus['kind']) => {
			await until('connected', () => c.status.kind === 'connected')
			const n = m.upgrades.length
			const from = seen.statuses.length
			m.closeAll(code)
			await until('back', () => c.status.kind === 'connected' && m.upgrades.length > n)
			// The status it showed in between, then connecting again.
			expect(seen.statuses.slice(from)).toEqual([kind, 'connecting', 'connected'])
		}
		await reconnects(CloseCode.TurnedOff, 'apiOff')
		await reconnects(CloseCode.ClientLimit, 'tooManyClients')
		await reconnects(CloseCode.Disconnected, 'disconnectedInKinetra')
		await reconnects(CloseCode.GoingAway, 'waiting')
		await reconnects(CloseCode.BadMessage, 'error')
		const n = m.upgrades.length
		m.closeAll(CloseCode.TokenChanged)
		await until('token changed', () => c.status.kind === 'tokenChanged')
		await sleep(150)
		expect(m.upgrades).toHaveLength(n)
		expect(c.state).toBeNull()
	})

	it('waits for Kinetra when nothing listens, then connects', async () => {
		const m = await mock()
		const port = m.port
		await m.stop()
		mocks = []
		const [c, seen] = client(port)
		await until('waiting', () => c.status.kind === 'waiting')
		await until('a few tries', () => seen.statuses.filter((s) => s === 'connecting').length >= 3)
		const back = await MockKinetra.start(port)
		mocks.push(back)
		await until('connected', () => c.status.kind === 'connected', 5000)
	})

	it('refuses a newer protocol and stops', async () => {
		const m = await mock()
		m.protocol = 2
		const [c] = client(m.port)
		await until('too new', () => c.status.kind === 'tooNew')
		await sleep(150)
		expect(m.upgrades).toHaveLength(1)
		expect(c.state).toBeNull()
	})

	it('reconnects when the hello goes unanswered or the link goes silent', async () => {
		const m = await mock()
		m.answerHello = false
		const [c] = client(m.port, 'kt_test', { silenceMs: 200 })
		await until('hello retried', () => m.upgrades.length >= 2)
		m.answerHello = true
		await until('connected', () => c.status.kind === 'connected')
		// The mock never pings: after silenceMs the link counts as dead.
		const n = m.upgrades.length
		await until('silence reconnect', () => m.upgrades.length > n, 3000)
	})

	it('no token: no connection; stop: nothing more', async () => {
		const m = await mock()
		const [c, seen] = client(m.port, '  ')
		expect(seen.statuses).toEqual(['noToken'])
		await sleep(50)
		expect(m.upgrades).toHaveLength(0)
		c.stop()
		const [c2] = client(m.port)
		await until('connected', () => c2.status.kind === 'connected')
		c2.stop()
		await until('closed', () => m.sockets.size === 0)
		const n = m.upgrades.length
		await sleep(150)
		expect(m.upgrades).toHaveLength(n)
		expect(await c2.command('panic')).toMatchObject({ ok: false, code: 'not_connected' })
	})
})
