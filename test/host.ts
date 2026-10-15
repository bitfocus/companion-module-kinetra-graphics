// A fake module instance for the definition tests: records commands and logs.
import type { Host } from '../src/host.js'
import type { State } from '../src/kinetra/protocol.js'

export interface FakeHost extends Host {
	state: State | null
	isConnected: boolean
	now: number
	commands: { action: string; args: Record<string, unknown> }[]
	logs: { level: string; message: string }[]
}

export function fakeHost(state: State | null, label = 'kinetra'): FakeHost {
	const h: FakeHost = {
		label,
		state,
		isConnected: state !== null,
		now: 1_792_000_000_000,
		commands: [],
		logs: [],
		get kinetraState() {
			return h.state
		},
		get connected() {
			return h.isConnected
		},
		serverNow: () => h.now,
		run: async (action, args) => {
			h.commands.push({ action, args })
		},
		log: (level, message) => {
			h.logs.push({ level, message })
		},
	}
	return h
}

/** Calls a definition's callback with just the options (what the module reads). */
export async function call(def: unknown, options: Record<string, unknown>): Promise<unknown> {
	const d = def as { callback: (e: unknown, ctx: unknown) => unknown }
	return d.callback({ id: 'x', controlId: 'c', actionId: 'a', feedbackId: 'f', options, surfaceId: undefined }, {})
}
