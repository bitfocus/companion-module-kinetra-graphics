// Every client status shows in Companion with the right level and words, and the module's version
// constant follows package.json.
import { readFileSync } from 'node:fs'
import { InstanceStatus } from '@companion-module/base'
import { describe, expect, it } from 'vitest'
import type { ClientStatus } from '../src/kinetra/client.js'
import { companionStatus } from '../src/status.js'
import { VERSION } from '../src/version.js'
import { fixture } from './helpers.js'

describe('status', () => {
	it('maps every case', () => {
		const cases: [ClientStatus, InstanceStatus, string | null][] = [
			[{ kind: 'noToken' }, InstanceStatus.BadConfig, 'Paste the API token from Kinetra › Preferences › Network & API'],
			[{ kind: 'connecting' }, InstanceStatus.Connecting, null],
			[{ kind: 'waiting', detail: 'x' }, InstanceStatus.ConnectionFailure, 'Waiting for Kinetra (is a project open?)'],
			[{ kind: 'wrongToken' }, InstanceStatus.AuthenticationFailure, 'Wrong API token'],
			[
				{ kind: 'tokenChanged' },
				InstanceStatus.AuthenticationFailure,
				'The token was changed in Kinetra: paste the new one',
			],
			[
				{ kind: 'apiOff' },
				InstanceStatus.ConnectionFailure,
				'Turn on Control API in Kinetra › Preferences › Network & API',
			],
			[{ kind: 'tooManyClients' }, InstanceStatus.ConnectionFailure, 'Too many controllers are connected to Kinetra'],
			[{ kind: 'tooManyAttempts' }, InstanceStatus.ConnectionFailure, 'Too many wrong tokens: wait a minute'],
			[{ kind: 'disconnectedInKinetra' }, InstanceStatus.Disconnected, 'Disconnected in Kinetra'],
			[
				{ kind: 'tooNew', protocol: 2 },
				InstanceStatus.UnknownWarning,
				'Update the Kinetra module: this Kinetra is newer',
			],
			[{ kind: 'connected', welcome: fixture.messages.welcome }, InstanceStatus.Ok, null],
			[{ kind: 'error', message: 'Boom' }, InstanceStatus.UnknownError, 'Boom'],
		]
		for (const [s, level, text] of cases) expect(companionStatus(s)).toEqual([level, text])
	})

	it('reports the package version to Kinetra', () => {
		const pkg = JSON.parse(readFileSync(new URL('../package.json', import.meta.url), 'utf8')) as { version: string }
		expect(VERSION).toBe(pkg.version)
	})
})
