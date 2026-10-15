import type { State } from './kinetra/protocol.js'

/** What the definitions need from the module instance (tests provide their own). */
export interface Host {
	/** The connection's label in Companion (variables in preset text: `$(<label>:id)`). */
	readonly label: string
	/** Kinetra's state, `null` while not connected. */
	readonly kinetraState: State | null
	/** Whether Kinetra is connected. */
	readonly connected: boolean
	/** Kinetra's clock now (epoch ms). */
	serverNow(): number
	/** Sends a command; logs Kinetra's refusal as a warning prefixed with `what`. */
	run(action: string, args: Record<string, unknown>, what: string): Promise<void>
	log(level: 'debug' | 'info' | 'warn' | 'error', message: string): void
}
