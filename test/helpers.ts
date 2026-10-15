// The fixture (Kinetra's generated contract) and small helpers for the tests.
import { readFileSync } from 'node:fs'
import type { Diff, Snapshot, State, Welcome } from '../src/kinetra/protocol.js'

export interface Fixture {
	protocol: number
	subprotocol: string
	features: string[]
	actions: string[]
	closeCodes: Record<string, number>
	refusals: Record<string, number>
	limits: Record<string, number>
	messages: {
		hello: Record<string, unknown>
		welcome: Welcome
		snapshot: Snapshot
		diff: Diff
		commands: { t: 'command'; corr: string; action: string; args: Record<string, unknown> }[]
		resultOk: Record<string, unknown>
		resultRefused: Record<string, unknown>
		resync: Record<string, unknown>
	}
}

export const fixtureText = readFileSync(new URL('./fixture/control-api.fixture.json', import.meta.url), 'utf8')
export const fixture = JSON.parse(fixtureText) as Fixture

/** A fresh copy of the fixture's snapshot state. */
export const sampleState = (): State => structuredClone(fixture.messages.snapshot.state)
