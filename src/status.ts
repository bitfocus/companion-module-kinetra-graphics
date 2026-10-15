import { InstanceStatus } from '@companion-module/base'
import type { ClientStatus } from './kinetra/client.js'

/** Companion's connection status and message for the client's status. */
export function companionStatus(s: ClientStatus): [InstanceStatus, string | null] {
	switch (s.kind) {
		case 'noToken':
			return [InstanceStatus.BadConfig, 'Paste the API token from Kinetra › Preferences › Network & API']
		case 'connecting':
			return [InstanceStatus.Connecting, null]
		case 'waiting':
			return [InstanceStatus.ConnectionFailure, 'Waiting for Kinetra (is a project open?)']
		case 'wrongToken':
			return [InstanceStatus.AuthenticationFailure, 'Wrong API token']
		case 'tokenChanged':
			return [InstanceStatus.AuthenticationFailure, 'The token was changed in Kinetra: paste the new one']
		case 'apiOff':
			return [InstanceStatus.ConnectionFailure, 'Turn on Control API in Kinetra › Preferences › Network & API']
		case 'tooManyClients':
			return [InstanceStatus.ConnectionFailure, 'Too many controllers are connected to Kinetra']
		case 'tooManyAttempts':
			return [InstanceStatus.ConnectionFailure, 'Too many wrong tokens: wait a minute']
		case 'disconnectedInKinetra':
			return [InstanceStatus.Disconnected, 'Disconnected in Kinetra']
		case 'tooNew':
			return [InstanceStatus.UnknownWarning, 'Update the Kinetra module: this Kinetra is newer']
		case 'connected':
			return [InstanceStatus.Ok, null]
		case 'error':
			return [InstanceStatus.UnknownError, s.message]
	}
}
