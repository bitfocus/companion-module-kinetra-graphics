// The connection to Kinetra's Control API (`/api/control`): connect with the token, hello, keep
// the state from the snapshot and diffs, send commands and match their results, and reconnect
// by the rules below. No Companion types here: `main.ts` maps the status to Companion's.
//
// Retry rules (docs/CONTROL_API.md "Close codes"):
// - no server / refused / dropped: back off 0.5, 1, 2, 4, 8 s (±30 %), then every 8 s; the backoff
//   resets after a minute connected; Kinetra stopping or switching project (1001) retries at once
// - wrong token (401) or token changed (4401): stop until the config changes
// - Control API off (503 disabled, 4409) or too many clients (503 busy, 4408): every 8 s
// - too many wrong tokens (429): after a minute
// - disconnected in Kinetra (4403): after 30 s
// - a protocol newer than this module's: stop ("update the module")
// Nothing is queued while disconnected; commands fail at once.

import WebSocket from 'ws'
import type { IncomingMessage } from 'node:http'
import { CloseCode, parseMessage, PROTOCOL, SUBPROTOCOL, type Result, type State, type Welcome } from './protocol.js'
import { KinetraState, type Area } from './state.js'

export type ClientStatus =
	| { kind: 'noToken' }
	| { kind: 'connecting' }
	/** No server answered (Kinetra closed, no project open, wrong host or port). */
	| { kind: 'waiting'; detail: string }
	| { kind: 'wrongToken' }
	| { kind: 'tokenChanged' }
	| { kind: 'apiOff' }
	| { kind: 'tooManyClients' }
	| { kind: 'tooManyAttempts' }
	| { kind: 'disconnectedInKinetra' }
	| { kind: 'tooNew'; protocol: number }
	| { kind: 'connected'; welcome: Welcome }
	| { kind: 'error'; message: string }

export interface ClientEvents {
	status(status: ClientStatus): void
	/** A whole new state (connect, resync). */
	snapshot(state: State): void
	/** A diff was applied; `touched` says which parts changed. */
	diff(state: State, touched: Set<Area>): void
	log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void
}

export interface Timing {
	backoffMs: number[]
	steadyMs: number
	/** ± this fraction. */
	jitter: number
	resetAfterMs: number
	helloTimeoutMs: number
	/** No message or ping from Kinetra for this long: the link is dead. */
	silenceMs: number
	commandTimeoutMs: number
	apiOffRetryMs: number
	tooManyAttemptsRetryMs: number
	disconnectedRetryMs: number
}

export const LIVE_TIMING: Timing = {
	backoffMs: [500, 1000, 2000, 4000, 8000],
	steadyMs: 8000,
	jitter: 0.3,
	resetAfterMs: 60_000,
	helloTimeoutMs: 10_000,
	silenceMs: 60_000,
	commandTimeoutMs: 5000,
	apiOffRetryMs: 8000,
	tooManyAttemptsRetryMs: 60_000,
	disconnectedRetryMs: 30_000,
}

export interface ClientOptions {
	host: string
	port: number
	token: string
	/** Shown in Kinetra's Preferences, e.g. "companion-module-kinetra-graphics/1.0.0". */
	clientName: string
	timing?: Partial<Timing>
}

/** A command's outcome: Kinetra's result, or a refusal made here (not connected, timed out). */
export type CommandResult = Result

interface Pending {
	resolve(r: CommandResult): void
	timer: NodeJS.Timeout
}

/** A WebSocket message as text. */
function rawText(data: WebSocket.RawData): string {
	if (Buffer.isBuffer(data)) return data.toString('utf8')
	if (Array.isArray(data)) return Buffer.concat(data).toString('utf8')
	return Buffer.from(data).toString('utf8')
}

export class KinetraClient {
	readonly #opts: ClientOptions
	readonly #events: ClientEvents
	readonly #timing: Timing
	readonly #state = new KinetraState()
	#ws: WebSocket | null = null
	#stopped = true
	#attempt = 0
	#retryTimer: NodeJS.Timeout | null = null
	#helloTimer: NodeJS.Timeout | null = null
	#silenceTimer: NodeJS.Timeout | null = null
	#resetTimer: NodeJS.Timeout | null = null
	#pending = new Map<string, Pending>()
	#nextCorr = 1
	#welcome: Welcome | null = null
	/** Kinetra's clock minus ours (ms), from `welcome.now`. */
	#offsetMs = 0
	#resyncAsked = false
	#status: ClientStatus = { kind: 'connecting' }

	constructor(opts: ClientOptions, events: ClientEvents) {
		this.#opts = opts
		this.#events = events
		this.#timing = { ...LIVE_TIMING, ...opts.timing }
	}

	get status(): ClientStatus {
		return this.#status
	}

	/** The current state; `null` while not connected. */
	get state(): State | null {
		return this.#welcome ? this.#state.tree : null
	}

	/** Kinetra's clock now (epoch ms), corrected by the offset from `welcome`. */
	serverNow(): number {
		return Date.now() + this.#offsetMs
	}

	start(): void {
		if (!this.#stopped) return
		this.#stopped = false
		if (!this.#opts.token.trim()) {
			this.#setStatus({ kind: 'noToken' })
			return
		}
		this.#connect()
	}

	/** Closes the connection and cancels every timer; pending commands fail. */
	stop(): void {
		this.#stopped = true
		this.#clearTimers()
		if (this.#retryTimer) clearTimeout(this.#retryTimer)
		this.#retryTimer = null
		this.#teardown('Stopped')
	}

	/** Sends a command; resolves with Kinetra's result (refusals included, never rejects). */
	async command(action: string, args: Record<string, unknown> = {}): Promise<CommandResult> {
		const corr = `c${this.#nextCorr++}`
		const ws = this.#ws
		if (!ws || ws.readyState !== WebSocket.OPEN || !this.#welcome) {
			return { t: 'result', corr, ok: false, code: 'not_connected', message: "Kinetra isn't connected." }
		}
		return new Promise((resolve) => {
			const timer = setTimeout(() => {
				this.#pending.delete(corr)
				resolve({ t: 'result', corr, ok: false, code: 'timeout', message: "Kinetra didn't answer in time." })
			}, this.#timing.commandTimeoutMs)
			this.#pending.set(corr, { resolve, timer })
			ws.send(JSON.stringify({ t: 'command', corr, action, args }))
		})
	}

	// ---- Connection ------------------------------------------------------------------------------

	#setStatus(s: ClientStatus): void {
		this.#status = s
		this.#events.status(s)
	}

	#connect(): void {
		if (this.#stopped) return
		this.#setStatus({ kind: 'connecting' })
		const url = `ws://${this.#opts.host}:${this.#opts.port}/api/control`
		const ws = new WebSocket(url, SUBPROTOCOL, {
			headers: { Authorization: `Bearer ${this.#opts.token}` },
			handshakeTimeout: this.#timing.helloTimeoutMs,
			// Node's WebSocket would send an Origin only if asked; Kinetra refuses any.
		})
		this.#ws = ws
		let handled = false
		const fail = (status: ClientStatus | null, retryMs: number | null) => {
			if (handled) return
			handled = true
			this.#teardown('Connection lost')
			if (status) this.#setStatus(status)
			if (retryMs !== null) this.#scheduleRetry(retryMs)
		}

		ws.on('unexpected-response', (_req, res: IncomingMessage) => {
			let body = ''
			res.setEncoding('utf8')
			res.on('data', (c: string) => (body += c.length < 4096 ? c : ''))
			res.on('end', () => {
				let code = ''
				try {
					const c = (JSON.parse(body) as { code?: unknown }).code
					code = typeof c === 'string' ? c : ''
				} catch {
					// not JSON
				}
				const status = res.statusCode ?? 0
				this.#events.log('debug', `Kinetra refused the connection: HTTP ${status} ${code}`)
				if (status === 401) fail({ kind: 'wrongToken' }, null)
				else if (status === 503 && code === 'busy') fail({ kind: 'tooManyClients' }, this.#timing.apiOffRetryMs)
				else if (status === 503) fail({ kind: 'apiOff' }, this.#timing.apiOffRetryMs)
				else if (status === 429) fail({ kind: 'tooManyAttempts' }, this.#timing.tooManyAttemptsRetryMs)
				else if (status === 404)
					fail({ kind: 'error', message: 'This Kinetra has no Control API: update Kinetra' }, null)
				else fail({ kind: 'error', message: `Kinetra refused the connection (HTTP ${status})` }, this.#backoff())
			})
		})

		ws.on('open', () => {
			ws.send(JSON.stringify({ t: 'hello', protocol: PROTOCOL, client: this.#opts.clientName }))
			this.#helloTimer = setTimeout(() => {
				this.#events.log('warn', "Kinetra didn't answer the hello")
				fail({ kind: 'waiting', detail: 'No answer' }, this.#backoff())
			}, this.#timing.helloTimeoutMs)
			this.#touchSilence(fail)
		})

		ws.on('ping', () => this.#touchSilence(fail))

		ws.on('message', (data) => {
			this.#touchSilence(fail)
			const msg = parseMessage(rawText(data))
			if (!msg) {
				this.#events.log('debug', 'Ignored a message this module does not know')
				return
			}
			switch (msg.t) {
				case 'welcome':
					if (this.#helloTimer) clearTimeout(this.#helloTimer)
					this.#helloTimer = null
					if (msg.protocol > PROTOCOL) {
						fail({ kind: 'tooNew', protocol: msg.protocol }, null)
						return
					}
					this.#welcome = msg
					this.#offsetMs = msg.now - Date.now()
					return
				case 'snapshot':
					this.#state.snapshot(msg)
					this.#resyncAsked = false
					if (this.#welcome) {
						if (this.#status.kind !== 'connected') {
							this.#setStatus({ kind: 'connected', welcome: this.#welcome })
							this.#resetTimer = setTimeout(() => (this.#attempt = 0), this.#timing.resetAfterMs)
						}
						this.#events.snapshot(msg.state)
					}
					return
				case 'diff': {
					const touched = this.#state.diff(msg)
					if (touched === null) {
						if (!this.#resyncAsked) {
							this.#resyncAsked = true
							this.#events.log('debug', `Asking for a resync (diff ${msg.seq} after ${this.#state.seq})`)
							ws.send(JSON.stringify({ t: 'resync' }))
						}
						return
					}
					if (touched.size > 0 && this.#state.tree) this.#events.diff(this.#state.tree, touched)
					return
				}
				case 'result': {
					const p = this.#pending.get(msg.corr)
					if (!p) return
					this.#pending.delete(msg.corr)
					clearTimeout(p.timer)
					p.resolve(msg)
					return
				}
			}
		})

		ws.on('close', (code: number, reason: Buffer) => {
			const why = reason.toString()
			this.#events.log('debug', `Connection closed: ${code}${why ? ` ${why}` : ''}`)
			switch (code) {
				case CloseCode.TokenChanged:
					return fail({ kind: 'tokenChanged' }, null)
				case CloseCode.TurnedOff:
					return fail({ kind: 'apiOff' }, this.#timing.apiOffRetryMs)
				case CloseCode.ClientLimit:
					return fail({ kind: 'tooManyClients' }, this.#timing.apiOffRetryMs)
				case CloseCode.Disconnected:
					return fail({ kind: 'disconnectedInKinetra' }, this.#timing.disconnectedRetryMs)
				case CloseCode.BadMessage:
					return fail({ kind: 'error', message: 'Kinetra closed the connection (bad message)' }, this.#backoff())
				case CloseCode.GoingAway:
					this.#attempt = 0
					return fail({ kind: 'waiting', detail: 'Kinetra stopped or opened another project' }, this.#backoff())
				default:
					return fail({ kind: 'waiting', detail: 'Connection lost' }, this.#backoff())
			}
		})

		ws.on('error', (err: Error & { code?: string }) => {
			// A refused upgrade is handled by 'unexpected-response'; this is the rest (refused, reset).
			this.#events.log('debug', `Connection error: ${err.code ?? err.message}`)
			fail(
				{ kind: 'waiting', detail: err.code === 'ECONNREFUSED' ? 'Nothing listening' : err.message },
				this.#backoff(),
			)
		})
	}

	#touchSilence(fail: (s: ClientStatus | null, retry: number | null) => void): void {
		if (this.#silenceTimer) clearTimeout(this.#silenceTimer)
		this.#silenceTimer = setTimeout(() => {
			this.#events.log('warn', 'Nothing from Kinetra for too long: reconnecting')
			fail({ kind: 'waiting', detail: 'Connection lost' }, this.#backoff())
		}, this.#timing.silenceMs)
	}

	/** The next backoff delay (with jitter), advancing the attempt counter. */
	#backoff(): number {
		const t = this.#timing
		const base = t.backoffMs[this.#attempt] ?? t.steadyMs
		this.#attempt++
		const spread = base * t.jitter
		return Math.round(base - spread + Math.random() * 2 * spread)
	}

	#scheduleRetry(ms: number): void {
		if (this.#stopped) return
		if (this.#retryTimer) clearTimeout(this.#retryTimer)
		this.#retryTimer = setTimeout(() => {
			this.#retryTimer = null
			this.#connect()
		}, ms)
	}

	#clearTimers(): void {
		for (const t of [this.#helloTimer, this.#silenceTimer, this.#resetTimer]) if (t) clearTimeout(t)
		this.#helloTimer = this.#silenceTimer = this.#resetTimer = null
	}

	/** Closes the socket, forgets the state, fails pending commands. */
	#teardown(message: string): void {
		this.#clearTimers()
		const ws = this.#ws
		this.#ws = null
		if (ws) {
			ws.removeAllListeners()
			// Swallow late errors from a socket being torn down.
			ws.on('error', () => {})
			if (ws.readyState === WebSocket.OPEN || ws.readyState === WebSocket.CONNECTING) ws.terminate()
		}
		const wasConnected = this.#welcome !== null
		this.#welcome = null
		this.#state.clear()
		for (const [corr, p] of this.#pending) {
			clearTimeout(p.timer)
			p.resolve({ t: 'result', corr, ok: false, code: 'not_connected', message: message })
		}
		this.#pending.clear()
		if (wasConnected) this.#events.log('info', 'Disconnected from Kinetra')
	}
}
