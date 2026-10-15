import { describe, expect, it } from 'vitest'
import type { Diff } from '../src/kinetra/protocol.js'
import { areaOf, KinetraState, pointerTokens } from '../src/kinetra/state.js'
import { fixture } from './helpers.js'

const started = () => {
	const s = new KinetraState()
	s.snapshot(structuredClone(fixture.messages.snapshot))
	return s
}

describe('state', () => {
	it("applies the fixture's diff: the take puts the layer on air", () => {
		const s = started()
		const key = 's1main01ab.l1'
		expect(s.tree?.layers[key].on_air).toBe(false)
		const touched = s.diff(fixture.messages.diff)
		expect(touched).toEqual(new Set(['layers']))
		expect(s.tree?.layers[key].on_air).toBe(true)
		expect(s.seq).toBe(1)
	})

	it('puts and deletes by JSON Pointer, escapes included', () => {
		const s = started()
		const d: Diff = {
			t: 'diff',
			seq: 1,
			ops: [
				{ op: 'put', path: '/sources/a~1b', value: { name: 'Odd/name', kind: 'text', index: 0, count: 1, label: '' } },
				{ op: 'del', path: '/layers/s1main01ab.m1' },
				{ op: 'put', path: '/screens/s1main01ab/layers', value: ['s1main01ab.l2', 's1main01ab.l1'] },
				{ op: 'put', path: '/automation_off', value: true },
			],
		}
		expect(s.diff(d)).toEqual(new Set(['sources', 'layers', 'structure', 'show']))
		expect(s.tree?.sources['a/b'].name).toBe('Odd/name')
		expect(s.tree?.layers['s1main01ab.m1']).toBeUndefined()
		expect(s.tree?.automation_off).toBe(true)
		expect(pointerTokens('/a~0b/c~1d')).toEqual(['a~b', 'c/d'])
		expect(pointerTokens('nope')).toBeNull()
	})

	it("rejects a diff it can't place, whole, and ignores one it already has", () => {
		const s = started()
		const before = structuredClone(s.tree)
		// A gap in seq.
		expect(s.diff({ ...fixture.messages.diff, seq: 2 })).toBeNull()
		// A path whose parent is missing, after a valid op: nothing of it may stick.
		const bad: Diff = {
			t: 'diff',
			seq: 1,
			ops: [
				{ op: 'put', path: '/automation_off', value: true },
				{ op: 'put', path: '/layers/nope.x/on_air', value: true },
			],
		}
		expect(s.diff(bad)).toBeNull()
		// Deleting what isn't there.
		expect(s.diff({ t: 'diff', seq: 1, ops: [{ op: 'del', path: '/sources/missing' }] })).toBeNull()
		expect(s.tree).toEqual(before)
		expect(s.seq).toBe(0)
		// An older diff after a newer snapshot: nothing to do.
		s.snapshot({ ...structuredClone(fixture.messages.snapshot), seq: 5 })
		expect(s.diff({ ...fixture.messages.diff, seq: 4 })).toEqual(new Set())
		expect(s.tree?.layers['s1main01ab.l1'].on_air).toBe(false)
	})

	it('needs a snapshot first, and forgets everything on clear', () => {
		const s = new KinetraState()
		expect(s.diff(fixture.messages.diff)).toBeNull()
		s.snapshot(structuredClone(fixture.messages.snapshot))
		s.clear()
		expect(s.tree).toBeNull()
		expect(s.seq).toBeNull()
	})

	it('sorts paths into areas', () => {
		expect(areaOf(['preview', 's1'])).toBe('preview')
		expect(areaOf(['cue_lists', 'cues', 'next'])).toBe('cues')
		expect(areaOf(['studio_mode'])).toBe('show')
		expect(areaOf(['templates', 't'])).toBe('structure')
		expect(areaOf(['assets'])).toBe('other')
	})
})
