import { describe, expect, it } from 'vitest'
import { actionDefinitions } from '../src/actions.js'
import { feedbackDefinitions } from '../src/feedbacks.js'
import { presetDefinitions } from '../src/presets.js'
import { variableDefinitions } from '../src/variables.js'
import { sampleState } from './helpers.js'
import { fakeHost } from './host.js'

interface P {
	name: string
	style: { text: string }
	steps: { down: { actionId: string; options: Record<string, unknown> }[] }[]
	feedbacks: { feedbackId: string; options: Record<string, unknown>; style: Record<string, unknown> }[]
}

const build = (label = 'kinetra') => {
	const host = fakeHost(sampleState(), label)
	const { structure, presets } = presetDefinitions(host, host.state)
	return { host, structure, presets: presets as unknown as Record<string, P> }
}

describe('presets', () => {
	it('come in sections: graphics by screen, cues, sources, show, flows, timers', () => {
		const { structure } = build()
		expect(structure.map((s) => s.id)).toEqual(['graphics', 'cues', 'sources', 'show', 'flows', 'timers'])
		const graphics = structure[0].definitions as { name: string; presets: string[] }[]
		expect(graphics.map((g) => g.name)).toEqual(['Main'])
		expect(graphics[0].presets).toEqual(['toggle_s1main01ab_m1', 'toggle_s1main01ab_l2', 'toggle_s1main01ab_l1'])
	})

	it('a graphic button takes / clears it, green in Preview, red on air (red wins)', () => {
		const { presets } = build()
		const p = presets.toggle_s1main01ab_l1
		expect(p.style.text).toBe('Layer l1')
		expect(p.steps[0].down).toEqual([{ actionId: 'toggle', options: { layer: 's1main01ab.l1' } }])
		expect(p.feedbacks.map((f) => f.feedbackId)).toEqual(['layer_in_preview', 'layer_on_air', 'layer_not_ready'])
		expect(p.feedbacks[1].style.bgcolor).toBe(0xcc0000)
	})

	it('show live values through the connection label', () => {
		const { presets } = build('kin-2')
		expect(presets.go_next.style.text).toBe('GO\n$(kin-2:cue_next)')
		expect(presets.source_next_guests0001.style.text).toBe('Guests ▶\n$(kin-2:source_guests0001_label)')
		expect(presets.timer_s1main01ab_l2_clock_start.style.text).toBe('Start\n$(kin-2:timer_s1main01ab_l2_clock)')
	})

	it('only use actions, options, feedbacks and variables the module defines', () => {
		const { host, structure, presets } = build()
		const actions = actionDefinitions(host, host.state) as Record<string, { options: { id: string }[] }>
		const feedbacks = feedbackDefinitions(host, host.state) as Record<string, { options: { id: string }[] }>
		const variables = variableDefinitions(host.state)
		for (const [id, p] of Object.entries(presets)) {
			for (const a of p.steps.flatMap((s) => s.down)) {
				expect(actions[a.actionId], `${id}: ${a.actionId}`).toBeDefined()
				const known = actions[a.actionId].options.map((o) => o.id)
				for (const k of Object.keys(a.options)) expect(known, `${id}: ${a.actionId}.${k}`).toContain(k)
			}
			for (const f of p.feedbacks) {
				expect(feedbacks[f.feedbackId], `${id}: ${f.feedbackId}`).toBeDefined()
				const known = feedbacks[f.feedbackId].options.map((o) => o.id)
				for (const k of Object.keys(f.options)) expect(known).toContain(k)
			}
			for (const m of p.style.text.matchAll(/\$\(kinetra:([^)]+)\)/g)) {
				expect(variables, `${id}: ${m[1]}`).toHaveProperty(m[1])
			}
		}
		// Every preset a section lists exists.
		const listed = structure.flatMap((s) =>
			(s.definitions as (string | { presets: string[] })[]).flatMap((d) => (typeof d === 'string' ? [d] : d.presets)),
		)
		for (const id of listed) expect(presets[id], id).toBeDefined()
		expect(new Set(listed).size).toBe(listed.length)
	})

	it('none while Kinetra is away', () => {
		expect(presetDefinitions(fakeHost(null), null)).toEqual({ structure: [], presets: {} })
	})
})
