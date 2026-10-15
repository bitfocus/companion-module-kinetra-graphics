import type { CompanionVariableDefinitions, CompanionVariableValue } from '@companion-module/base'
import { layerChoices, splitLayerKey, TEXT_TYPES, varId } from './kinetra/model.js'
import { mediaRemainingText, parseTimer, timerRuns, timerText } from './kinetra/display.js'
import type { State } from './kinetra/protocol.js'

// Ids are built from Kinetra's ids, so they stay the same when things are renamed; each
// definition's name is readable ("Main › Lower third: on air").
//   connected, project, studio_mode, automation_off, cue_current, cue_next
//   layer_<screen>_<layer>_name / _onair
//   field_<screen>_<layer>_<key>      text-like field values
//   timer_<screen>_<layer>_<key>      a timer as Kinetra shows it (ticks while running)
//   media_<screen>_<layer>_remaining  time left (ticks while playing)
//   source_<id>_label / _index (1-based) / _count

export type VariablesSchema = Record<string, CompanionVariableValue>

const layerParts = (key: string): string[] => splitLayerKey(key) ?? [key]

/** Every variable Kinetra's state gives, with its readable name. */
export function variableDefinitions(s: State | null): CompanionVariableDefinitions<VariablesSchema> {
	const defs: Record<string, { name: string }> = {
		connected: { name: 'Connected to Kinetra' },
		project: { name: "Kinetra's open project" },
		studio_mode: { name: 'Studio mode on' },
		automation_off: { name: 'Automation off' },
		cue_current: { name: 'The last cue run' },
		cue_next: { name: 'The next cue (GO runs it)' },
	}
	if (!s) return defs
	for (const c of layerChoices(s)) {
		const [sid, lid] = layerParts(c.id)
		const layer = s.layers[c.id]
		defs[varId('layer', sid, lid, 'name')] = { name: `${c.label}: name` }
		defs[varId('layer', sid, lid, 'onair')] = { name: `${c.label}: on air` }
		if (layer.kind === 'template') {
			for (const f of s.templates[layer.template]?.fields ?? []) {
				if (TEXT_TYPES.includes(f.type)) defs[varId('field', sid, lid, f.key)] = { name: `${c.label}: ${f.label}` }
				if (f.type === 'timer') defs[varId('timer', sid, lid, f.key)] = { name: `${c.label}: ${f.label} (timer)` }
			}
		} else if (layer.media.type !== 'image') {
			defs[varId('media', sid, lid, 'remaining')] = { name: `${c.label}: time left` }
		}
	}
	for (const id of s.source_order) {
		const src = s.sources[id]
		if (!src) continue
		defs[varId('source', id, 'label')] = { name: `${src.name}: current row` }
		defs[varId('source', id, 'index')] = { name: `${src.name}: row number` }
		defs[varId('source', id, 'count')] = { name: `${src.name}: rows` }
	}
	return defs
}

/** The values that only change with time: running timers and playing media. */
export function tickingValues(s: State, now: number): Record<string, string> {
	const out: Record<string, string> = {}
	for (const [key, layer] of Object.entries(s.layers)) {
		const [sid, lid] = layerParts(key)
		if (layer.kind === 'template') {
			for (const f of s.templates[layer.template]?.fields ?? []) {
				if (f.type !== 'timer') continue
				const t = parseTimer(layer.values[f.key])
				out[varId('timer', sid, lid, f.key)] = t ? timerText(t, now) : ''
			}
		} else if (layer.media.type !== 'image' && layer.media.playback) {
			out[varId('media', sid, lid, 'remaining')] = mediaRemainingText(layer.media.playback, now)
		}
	}
	return out
}

/** Whether anything shown changes with time (then the module ticks once a second). */
export function anythingTicks(s: State | null, now: number): boolean {
	if (!s) return false
	return Object.values(s.layers).some((l) => {
		if (l.kind === 'media') return l.media.type !== 'image' && l.media.playback?.state === 'playing'
		const t = l
		return (s.templates[t.template]?.fields ?? []).some((f) => {
			if (f.type !== 'timer') return false
			const st = parseTimer(t.values[f.key])
			return st !== null && timerRuns(st, now)
		})
	})
}

/** Every variable's value. */
export function variableValues(
	s: State | null,
	connected: boolean,
	project: string,
	now: number,
): Record<string, CompanionVariableValue> {
	const out: Record<string, CompanionVariableValue> = {
		connected,
		project,
		studio_mode: s?.studio_mode ?? false,
		automation_off: s?.automation_off ?? false,
		cue_current: '',
		cue_next: '',
	}
	if (!s) return out
	const list = s.cue_lists.cues
	if (list) {
		out.cue_current = list.current ? (list.cues[list.current]?.name ?? '') : ''
		out.cue_next = list.next ? (list.cues[list.next]?.name ?? '') : ''
	}
	for (const [key, layer] of Object.entries(s.layers)) {
		const [sid, lid] = layerParts(key)
		out[varId('layer', sid, lid, 'name')] = layer.name
		out[varId('layer', sid, lid, 'onair')] = layer.on_air
		if (layer.kind === 'template') {
			for (const f of s.templates[layer.template]?.fields ?? []) {
				if (TEXT_TYPES.includes(f.type)) out[varId('field', sid, lid, f.key)] = layer.values[f.key] ?? ''
			}
		}
	}
	Object.assign(out, tickingValues(s, now))
	for (const id of s.source_order) {
		const src = s.sources[id]
		if (!src) continue
		out[varId('source', id, 'label')] = src.label
		out[varId('source', id, 'index')] = src.count > 0 ? src.index + 1 : 0
		out[varId('source', id, 'count')] = src.count
	}
	return out
}

/** The entries of `next` that differ from `prev` (what to send to Companion). */
export function changedValues(
	prev: Record<string, CompanionVariableValue>,
	next: Record<string, CompanionVariableValue>,
): Record<string, CompanionVariableValue> {
	const out: Record<string, CompanionVariableValue> = {}
	for (const [k, v] of Object.entries(next)) if (prev[k] !== v) out[k] = v
	return out
}
