import { Regex, type SomeCompanionConfigField } from '@companion-module/base'

export type ModuleConfig = {
	host: string
	port: number
}

/** Kept in Companion's secrets store, not the config. */
export type ModuleSecrets = {
	token: string
}

/** Kinetra's output server port (Kinetra Canary uses 7771). */
export const DEFAULT_PORT = 7770

export function GetConfigFields(): SomeCompanionConfigField[] {
	return [
		{
			type: 'static-text',
			id: 'info',
			label: 'In Kinetra',
			value: 'Preferences › Network & API › Control API: turn it on and click Copy token. A project must be open.',
			width: 12,
		},
		{
			type: 'textinput',
			id: 'host',
			label: 'Host',
			description: '127.0.0.1 when Kinetra runs on this computer',
			width: 8,
			default: '127.0.0.1',
			regex: Regex.HOSTNAME,
		},
		{
			type: 'number',
			id: 'port',
			label: 'Port',
			description: 'Kinetra Canary uses 7771',
			width: 4,
			min: 1,
			max: 65535,
			default: DEFAULT_PORT,
		},
		{
			type: 'secret-text',
			id: 'token',
			label: 'API token',
			width: 12,
		},
	]
}
