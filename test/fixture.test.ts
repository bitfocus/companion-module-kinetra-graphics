// The module's protocol constants and message parsing against Kinetra's generated fixture.
import { createHash } from 'node:crypto'
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'
import { CloseCode, parseMessage, PROTOCOL, SUBPROTOCOL } from '../src/kinetra/protocol.js'
import { fixture, fixtureText } from './helpers.js'

describe('fixture', () => {
	it("is the recorded copy of Kinetra's (scripts/sync-fixture.mjs --check compares it online)", () => {
		const source = JSON.parse(readFileSync(new URL('./fixture/source.json', import.meta.url), 'utf8'))
		expect(source.repo).toBe('KinetraLive/kinetra-app')
		expect(createHash('sha256').update(fixtureText.replace(/\r\n/g, '\n')).digest('hex')).toBe(source.sha256)
	})

	it('has the protocol, subprotocol and close codes this module speaks', () => {
		expect(fixture.protocol).toBe(PROTOCOL)
		expect(fixture.subprotocol).toBe(SUBPROTOCOL)
		expect(fixture.closeCodes).toEqual({
			goingAway: CloseCode.GoingAway,
			badMessage: CloseCode.BadMessage,
			tokenChanged: CloseCode.TokenChanged,
			disconnected: CloseCode.Disconnected,
			clientLimit: CloseCode.ClientLimit,
			turnedOff: CloseCode.TurnedOff,
		})
	})

	it('parses every server message and nothing else', () => {
		const m = fixture.messages
		for (const msg of [m.welcome, m.snapshot, m.diff, m.resultOk, m.resultRefused]) {
			expect(parseMessage(JSON.stringify(msg))).toEqual(msg)
		}
		expect(parseMessage(JSON.stringify(m.hello))).toBeNull()
		expect(parseMessage('not json')).toBeNull()
		expect(parseMessage('[1]')).toBeNull()
	})
})
