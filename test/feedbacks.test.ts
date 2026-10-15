import { describe, expect, it } from 'vitest'
import { FEEDBACKS_BY_AREA, feedbackDefinitions, inPreview, type FeedbackId } from '../src/feedbacks.js'
import { sampleState } from './helpers.js'
import { call, fakeHost } from './host.js'

const L1 = 's1main01ab.l1'
const M1 = 's1main01ab.m1'

describe('feedbacks', () => {
	it('follow the state: Program, Preview, staged, loading, cues, media, show, connection', async () => {
		const host = fakeHost(sampleState())
		const defs = feedbackDefinitions(host, host.state) as Record<FeedbackId, unknown>
		const is = async (id: FeedbackId, options: Record<string, unknown> = {}) => call(defs[id], options)
		const s = host.state!

		expect(await is('layer_on_air', { layer: L1 })).toBe(false)
		s.layers[L1].on_air = true
		expect(await is('layer_on_air', { layer: L1 })).toBe(true)
		expect(await is('layer_on_air', { layer: 'gone.x' })).toBe(false)

		// Preview counts only in Studio mode.
		s.preview.s1main01ab = [L1]
		expect(await is('layer_in_preview', { layer: L1 })).toBe(false)
		s.studio_mode = true
		expect(await is('layer_in_preview', { layer: L1 })).toBe(true)
		expect(inPreview(s, 's1main01ab.l2')).toBe(false)
		expect(await is('studio_mode')).toBe(true)

		const l1 = s.layers[L1]
		if (l1.kind === 'template') l1.pending = true
		expect(await is('layer_pending', { layer: L1 })).toBe(true)
		expect(await is('layer_not_ready', { layer: M1 })).toBe(false)
		s.layers[M1].ready = { loaded: 1, total: 2 }
		expect(await is('layer_not_ready', { layer: M1 })).toBe(true)

		const cues = s.cue_lists.cues
		cues.next = 'cue0000001'
		cues.cues.cue0000002.running = true
		expect(await is('cue_next', { cue: 'cue0000001' })).toBe(true)
		expect(await is('cue_next', { cue: 'cue0000002' })).toBe(false)
		expect(await is('cue_running', { cue: 'cue0000002' })).toBe(true)

		const m1 = s.layers[M1]
		expect(await is('media_playing', { layer: M1 })).toBe(false)
		if (m1.kind === 'media' && m1.media.playback) m1.media.playback.state = 'playing'
		expect(await is('media_playing', { layer: M1 })).toBe(true)

		expect(await is('automation_off')).toBe(false)
		s.automation_off = true
		expect(await is('automation_off')).toBe(true)

		expect(await is('connected')).toBe(true)
		host.isConnected = false
		host.state = null
		expect(await is('connected')).toBe(false)
		expect(await is('layer_on_air', { layer: L1 })).toBe(false)
	})

	it('every feedback but the connection is re-checked by some area of a diff', () => {
		const defs = feedbackDefinitions(fakeHost(null), null)
		const covered = new Set(Object.values(FEEDBACKS_BY_AREA).flat())
		const ids = Object.keys(defs) as FeedbackId[]
		expect(ids.filter((id) => !covered.has(id))).toEqual(['connected'])
		for (const id of covered) expect(ids).toContain(id)
	})
})
