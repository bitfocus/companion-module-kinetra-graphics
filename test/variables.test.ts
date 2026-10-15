import { describe, expect, it } from 'vitest'
import { clockText, mediaRemainingText, parseTimer, timerRuns, timerText } from '../src/kinetra/display.js'
import type { Playback, TimerState } from '../src/kinetra/protocol.js'
import { anythingTicks, changedValues, tickingValues, variableDefinitions, variableValues } from '../src/variables.js'
import { sampleState } from './helpers.js'

const NOW = 1_792_000_000_000

describe('variables', () => {
	it('define every value, with readable names', () => {
		const s = sampleState()
		const defs = variableDefinitions(s) as Record<string, { name: string }>
		const values = variableValues(s, true, 'Nordlys Live', NOW)
		for (const id of Object.keys(values)) expect(defs[id], id).toBeDefined()
		expect(defs.layer_s1main01ab_l1_onair.name).toBe('Main › Layer l1: on air')
		expect(defs.field_s1main01ab_l1_name.name).toBe('Main › Layer l1: Name')
		expect(defs.timer_s1main01ab_l2_clock.name).toBe('Main › Layer l2: Game clock (timer)')
		expect(defs.media_s1main01ab_m1_remaining.name).toBe('Main › Bed: time left')
		expect(defs.source_guests0001_label.name).toBe('Guests: current row')
		// Images and timers aren't field variables; the layer's own name doesn't collide with a "name" field.
		expect(defs.field_s1main01ab_l1_photo).toBeUndefined()
		expect(defs.field_s1main01ab_l2_clock).toBeUndefined()
		expect(defs.layer_s1main01ab_l1_name.name).toBe('Main › Layer l1: name')
	})

	it("hold Kinetra's values", () => {
		const v = variableValues(sampleState(), true, 'Nordlys Live', NOW)
		expect(v).toMatchObject({
			connected: true,
			project: 'Nordlys Live',
			studio_mode: false,
			automation_off: false,
			cue_current: 'Close',
			cue_next: '',
			layer_s1main01ab_l1_name: 'Layer l1',
			layer_s1main01ab_l1_onair: false,
			field_s1main01ab_l1_name: 'Ingrid Vale',
			timer_s1main01ab_l2_clock: '20:00',
			// Paused 25 ms into a 26 ms clip: up to the next second.
			media_s1main01ab_m1_remaining: '0:01',
			source_guests0001_label: 'Kari Nordmann',
			source_guests0001_index: 2,
			source_guests0001_count: 2,
		})
		// Away: only the basics, connected false.
		expect(variableValues(null, false, '', NOW)).toEqual({
			connected: false,
			project: '',
			studio_mode: false,
			automation_off: false,
			cue_current: '',
			cue_next: '',
		})
	})

	it('tick only while a timer runs or media plays', () => {
		const s = sampleState()
		expect(anythingTicks(s, NOW)).toBe(false)
		const l2 = s.layers['s1main01ab.l2']
		if (l2.kind !== 'template') throw new Error('l2')
		l2.values.clock = JSON.stringify({ run: true, at: NOW, base: 90_000, dir: 'down', end: 'stop' })
		expect(anythingTicks(s, NOW)).toBe(true)
		expect(tickingValues(s, NOW + 30_500).timer_s1main01ab_l2_clock).toBe('1:00')
		// At zero a countdown stops ticking.
		expect(anythingTicks(s, NOW + 90_000)).toBe(false)
		const m1 = s.layers['s1main01ab.m1']
		if (m1.kind === 'media' && m1.media.playback) m1.media.playback.state = 'playing'
		expect(anythingTicks(s, NOW + 90_000)).toBe(true)
	})

	it('send only what changed', () => {
		expect(changedValues({ a: 1, b: 'x' }, { a: 1, b: 'y', c: true })).toEqual({ b: 'y', c: true })
		expect(changedValues({ a: 1 }, { a: 1 })).toEqual({})
	})
})

describe('display', () => {
	const t = (o: Partial<TimerState>): TimerState => ({ run: false, at: 0, base: 0, dir: 'up', end: 'stop', ...o })

	it("shows timers as Kinetra's renderer does", () => {
		expect(clockText(0)).toBe('0:00')
		expect(clockText(65)).toBe('1:05')
		expect(clockText(3725)).toBe('1:02:05')
		// Up floors, down ceils: a countdown shows 0:00 only at zero.
		expect(timerText(t({ run: true, at: NOW, base: 0, dir: 'up' }), NOW + 1999)).toBe('0:01')
		expect(timerText(t({ run: true, at: NOW, base: 10_000, dir: 'down' }), NOW + 9001)).toBe('0:01')
		expect(timerText(t({ run: true, at: NOW, base: 10_000, dir: 'down' }), NOW + 20_000)).toBe('0:00')
		expect(timerText(t({ base: 61_000 }), NOW)).toBe('1:01')
		expect(timerRuns(t({ run: true, dir: 'up' }), NOW)).toBe(true)
		expect(timerRuns(t({ run: false }), NOW)).toBe(false)
		expect(parseTimer('{"run":true,"at":5,"base":10,"dir":"down","end":"hide"}')).toEqual(
			t({ run: true, at: 5, base: 10, dir: 'down', end: 'hide' }),
		)
		expect(parseTimer('nope')).toBeNull()
		expect(parseTimer('{}')).toBeNull()
		expect(parseTimer(undefined)).toBeNull()
	})

	it('counts media down to its out point or end', () => {
		const p = (o: Partial<Playback>): Playback => ({
			state: 'playing',
			pos_ms: 0,
			at: NOW,
			in_ms: 0,
			out_ms: null,
			duration_ms: 60_000,
			...o,
		})
		expect(mediaRemainingText(p({}), NOW + 15_000)).toBe('0:45')
		expect(mediaRemainingText(p({ out_ms: 30_000 }), NOW + 15_000)).toBe('0:15')
		expect(mediaRemainingText(p({ state: 'paused', pos_ms: 50_000 }), NOW + 99_000)).toBe('0:10')
		expect(mediaRemainingText(p({ state: 'stopped', in_ms: 5000 }), NOW)).toBe('0:55')
		expect(mediaRemainingText(p({}), NOW + 99_000)).toBe('0:00')
		expect(mediaRemainingText(p({ duration_ms: null }), NOW)).toBe('')
	})
})
