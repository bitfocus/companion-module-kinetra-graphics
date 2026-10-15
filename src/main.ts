import { InstanceBase, type CompanionVariableValue, type SomeCompanionConfigField } from '@companion-module/base'
import { actionDefinitions, type ActionsSchema } from './actions.js'
import { DEFAULT_PORT, GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { FEEDBACKS_BY_AREA, feedbackDefinitions, type FeedbackId, type FeedbacksSchema } from './feedbacks.js'
import type { Host } from './host.js'
import { KinetraClient } from './kinetra/client.js'
import { structureKey } from './kinetra/model.js'
import type { State } from './kinetra/protocol.js'
import type { Area } from './kinetra/state.js'
import { presetDefinitions } from './presets.js'
import { companionStatus } from './status.js'
import { UpgradeScripts } from './upgrades.js'
import {
	anythingTicks,
	changedValues,
	tickingValues,
	variableDefinitions,
	variableValues,
	type VariablesSchema,
} from './variables.js'
import { VERSION } from './version.js'

export type ModuleSchema = {
	config: ModuleConfig
	secrets: ModuleSecrets
	actions: ActionsSchema
	feedbacks: FeedbacksSchema
	variables: VariablesSchema
}

export { UpgradeScripts }

/** How Kinetra's Preferences lists this connection. */
export const CLIENT_NAME = `companion-module-kinetra-graphics/${VERSION}`

/** Time-based variables (timers, media) refresh this often, only while something runs. */
const TICK_MS = 1000

export default class ModuleInstance extends InstanceBase<ModuleSchema> implements Host {
	config!: ModuleConfig
	secrets!: ModuleSecrets
	client: KinetraClient | null = null
	/** The structure the definitions were last built from (`null`: built with no state). */
	#structure: string | null = null
	#values: Record<string, CompanionVariableValue> = {}
	#tick: NodeJS.Timeout | null = null
	/** Kinetra's last state, kept while it is away (definitions are built from it). */
	#lastState: State | null = null
	#wasConnected = false

	constructor(internal: unknown) {
		super(internal)
	}

	// ---- Host ------------------------------------------------------------------------------------

	get kinetraState(): State | null {
		return this.client?.state ?? null
	}

	get connected(): boolean {
		return this.client?.status.kind === 'connected'
	}

	serverNow(): number {
		return this.client?.serverNow() ?? Date.now()
	}

	async run(action: string, args: Record<string, unknown>, what: string): Promise<void> {
		if (!this.client) return
		const r = await this.client.command(action, args)
		if (!r.ok) this.log('warn', `${what}: ${r.message}`)
	}

	// ---- Companion -------------------------------------------------------------------------------

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets
		this.#rebuild()
		this.connect()
	}

	async destroy(): Promise<void> {
		this.#stopTick()
		this.client?.stop()
		this.client = null
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets
		// The label may have changed: presets name it in their variables.
		this.#rebuild()
		this.connect()
	}

	getConfigFields(): SomeCompanionConfigField[] {
		return GetConfigFields()
	}

	/** (Re)connects with the current config: a new client, the old one stopped. */
	connect(): void {
		this.client?.stop()
		this.client = new KinetraClient(
			{
				host: this.config.host?.trim() || '127.0.0.1',
				port: this.config.port || DEFAULT_PORT,
				token: this.secrets?.token ?? '',
				clientName: CLIENT_NAME,
			},
			{
				status: (s) => {
					this.updateStatus(...companionStatus(s))
					const connected = s.kind === 'connected'
					// Losing Kinetra: `connected` false, feedbacks off. (Connecting arrives with a snapshot.)
					if (this.#wasConnected && !connected) this.#changed(null)
					this.#wasConnected = connected
				},
				snapshot: () => this.#changed(null),
				diff: (_state, touched) => this.#changed(touched),
				log: (level, message) => this.log(level, message),
			},
		)
		this.client.start()
	}

	// ---- Keeping Companion in step with Kinetra ----------------------------------------------------

	/** Kinetra's state changed (`touched`: the areas of a diff; `null`: everything). */
	#changed(touched: Set<Area> | null): void {
		const s = this.kinetraState
		if (s) this.#lastState = s
		// Definitions follow Kinetra's structure; while Kinetra is away they keep the last one,
		// so buttons can still be edited with real choices.
		const rebuilt = s !== null && structureKey(s) !== this.#structure
		if (rebuilt) this.#rebuild()
		this.#updateValues()
		if (touched === null || rebuilt) {
			this.checkAllFeedbacks()
		} else {
			const ids = new Set<FeedbackId>()
			for (const a of touched) for (const f of FEEDBACKS_BY_AREA[a]) ids.add(f)
			const [first, ...rest] = [...ids]
			if (first) this.checkFeedbacks(first, ...rest)
		}
		this.#updateTick()
	}

	/** Rebuilds actions, feedbacks, variables and presets from Kinetra's (last known) state. */
	#rebuild(): void {
		const s = this.kinetraState ?? this.#lastState
		this.#structure = s ? structureKey(s) : null
		this.setActionDefinitions(actionDefinitions(this, s))
		this.setFeedbackDefinitions(feedbackDefinitions(this, s))
		this.setVariableDefinitions(variableDefinitions(s))
		const { structure: sections, presets } = presetDefinitions(this, s)
		this.setPresetDefinitions(sections, presets)
		// New definitions: send every value again.
		this.#values = {}
	}

	#updateValues(): void {
		const s = this.kinetraState
		const project = this.client?.status.kind === 'connected' ? this.client.status.welcome.project.name : ''
		const next = variableValues(s, this.connected, project, this.serverNow())
		const changed = changedValues(this.#values, next)
		this.#values = next
		if (Object.keys(changed).length) this.setVariableValues(changed)
	}

	/** One timer while a Kinetra timer runs or media plays; none otherwise. */
	#updateTick(): void {
		if (anythingTicks(this.kinetraState, this.serverNow())) {
			this.#tick ??= setInterval(() => this.#onTick(), TICK_MS)
		} else {
			this.#stopTick()
		}
	}

	#onTick(): void {
		const s = this.kinetraState
		if (!s) return this.#stopTick()
		const changed = changedValues(this.#values, tickingValues(s, this.serverNow()))
		if (Object.keys(changed).length) {
			Object.assign(this.#values, changed)
			this.setVariableValues(changed)
		}
		this.#updateTick()
	}

	#stopTick(): void {
		if (this.#tick) clearInterval(this.#tick)
		this.#tick = null
	}
}
