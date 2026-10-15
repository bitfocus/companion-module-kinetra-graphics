import { describe, expect, it } from 'vitest'
import {
	cueChoices,
	fieldChoices,
	flowChoices,
	layerChoices,
	levelTargetChoices,
	mediaLayerChoices,
	screenChoices,
	sourceChoices,
	splitLayerKey,
	structureKey,
	TEXT_TYPES,
	timerLayerChoices,
	varId,
} from '../src/kinetra/model.js'
import { KinetraState } from '../src/kinetra/state.js'
import { fixture, sampleState } from './helpers.js'

describe('model', () => {
	it('lists layers as Screen › Layer, top first, with their keys', () => {
		const s = sampleState()
		expect(screenChoices(s)).toEqual([{ id: 's1main01ab', label: 'Main' }])
		expect(layerChoices(s)).toEqual([
			{ id: 's1main01ab.m1', label: 'Main › Bed' },
			{ id: 's1main01ab.l2', label: 'Main › Layer l2' },
			{ id: 's1main01ab.l1', label: 'Main › Layer l1' },
		])
		expect(mediaLayerChoices(s).map((c) => c.id)).toEqual(['s1main01ab.m1'])
		expect(timerLayerChoices(s).map((c) => c.id)).toEqual(['s1main01ab.l2'])
	})

	it('lists cues in order, sources and API call flows', () => {
		const s = sampleState()
		expect(cueChoices(s)).toEqual([
			{ id: 'cue0000001', label: 'Open' },
			{ id: 'cue0000002', label: 'Close' },
		])
		expect(sourceChoices(s)).toEqual([{ id: 'guests0001', label: 'Guests' }])
		expect(flowChoices(s)).toEqual([{ id: 'goal000001', label: 'Goal' }])
	})

	it('offers text fields and level targets across templates', () => {
		const s = sampleState()
		const fields = fieldChoices(s, TEXT_TYPES)
		expect(fields.map((f) => f.id).sort()).toEqual([
			'away',
			'away_score',
			'home',
			'home_score',
			'label',
			'name',
			'period',
			'title',
		])
		expect(fields.find((f) => f.id === 'home')?.label).toBe('Home team')
		// Images, timers and clocks aren't text.
		expect(fields.some((f) => ['photo', 'logo', 'clock'].includes(f.id))).toBe(false)
		expect(fieldChoices(s, ['timer'])).toEqual([{ id: 'clock', label: 'Game clock' }])
		const levels = levelTargetChoices(s)
		expect(levels[0]).toEqual({ id: 'opacity', label: 'Opacity' })
		// A key two templates share is one choice.
		expect(levels.filter((l) => l.id === 'var:radius')).toEqual([{ id: 'var:radius', label: 'Corner radius' }])
	})

	it('keeps its structure key through value changes, not through renames', () => {
		const st = new KinetraState()
		st.snapshot(structuredClone(fixture.messages.snapshot))
		const key = structureKey(st.tree!)
		st.diff(fixture.messages.diff)
		expect(structureKey(st.tree!)).toBe(key)
		st.diff({ t: 'diff', seq: 2, ops: [{ op: 'put', path: '/sources/guests0001/index', value: 0 }] })
		expect(structureKey(st.tree!)).toBe(key)
		st.diff({ t: 'diff', seq: 3, ops: [{ op: 'put', path: '/layers/s1main01ab.l1/name', value: 'Guest' }] })
		expect(structureKey(st.tree!)).not.toBe(key)
	})

	it('makes variable ids and splits layer keys', () => {
		expect(varId('layer', 's1main01ab', 'l1', 'onair')).toBe('layer_s1main01ab_l1_onair')
		expect(varId('a.b', 'c d')).toBe('a_b_c_d')
		expect(splitLayerKey('s1.l1')).toEqual(['s1', 'l1'])
		expect(splitLayerKey('nodot')).toBeNull()
		expect(splitLayerKey('.l1')).toBeNull()
	})
})
