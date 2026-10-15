import { InstanceBase, type SomeCompanionConfigField } from '@companion-module/base'
import { DEFAULT_PORT, GetConfigFields, type ModuleConfig, type ModuleSecrets } from './config.js'
import { UpdateVariableDefinitions, type VariablesSchema } from './variables.js'
import { UpgradeScripts } from './upgrades.js'
import { UpdateActions, type ActionsSchema } from './actions.js'
import { UpdateFeedbacks, type FeedbacksSchema } from './feedbacks.js'
import { UpdatePresets } from './presets.js'
import { KinetraClient } from './kinetra/client.js'
import { companionStatus } from './status.js'
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

export default class ModuleInstance extends InstanceBase<ModuleSchema> {
	config!: ModuleConfig
	secrets!: ModuleSecrets
	client: KinetraClient | null = null

	constructor(internal: unknown) {
		super(internal)
	}

	async init(config: ModuleConfig, _isFirstInit: boolean, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets
		UpdateActions(this)
		UpdateFeedbacks(this)
		UpdatePresets(this)
		UpdateVariableDefinitions(this)
		this.connect()
	}

	async destroy(): Promise<void> {
		this.client?.stop()
		this.client = null
	}

	async configUpdated(config: ModuleConfig, secrets: ModuleSecrets): Promise<void> {
		this.config = config
		this.secrets = secrets
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
				status: (s) => this.updateStatus(...companionStatus(s)),
				snapshot: () => {},
				diff: () => {},
				log: (level, message) => this.log(level, message),
			},
		)
		this.client.start()
	}
}
