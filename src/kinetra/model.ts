// Pure lookups over Kinetra's state for the definitions: dropdown choices (ids as values, names
// as labels, in Kinetra's order), the structure key that decides when definitions are rebuilt,
// and variable ids.

import type { FieldType, Layer, State, TemplateLayer } from './protocol.js'

export interface Choice {
	id: string
	label: string
}

/** Field types `set_text` writes and variables show: plain text values. */
export const TEXT_TYPES: readonly FieldType[] = ['text', 'multiline', 'number', 'color']

const SEP = ' › '

const isTemplate = (l: Layer | undefined): l is TemplateLayer => l?.kind === 'template'

/** Screens in Kinetra's order. */
export function screenChoices(s: State): Choice[] {
	return s.screen_order.filter((id) => s.screens[id]).map((id) => ({ id, label: s.screens[id].name }))
}

/** Layers as "Screen › Layer": screens in order, layers top first. `keep` narrows them. */
export function layerChoices(s: State, keep: (l: Layer) => boolean = () => true): Choice[] {
	const out: Choice[] = []
	for (const sid of s.screen_order) {
		const screen = s.screens[sid]
		if (!screen) continue
		for (const key of screen.layers) {
			const layer = s.layers[key]
			if (layer && keep(layer)) out.push({ id: key, label: `${screen.name}${SEP}${layer.name}` })
		}
	}
	return out
}

export const mediaLayerChoices = (s: State): Choice[] => layerChoices(s, (l) => l.kind === 'media')

/** Layers with at least one timer field. */
export const timerLayerChoices = (s: State): Choice[] =>
	layerChoices(s, (l) => isTemplate(l) && (s.templates[l.template]?.fields ?? []).some((f) => f.type === 'timer'))

/** The cue list's cues, in order. */
export function cueChoices(s: State): Choice[] {
	const list = s.cue_lists.cues
	if (!list) return []
	return list.order.filter((id) => list.cues[id]).map((id) => ({ id, label: list.cues[id].name }))
}

/** Sources by name (Kinetra's order). */
export function sourceChoices(s: State): Choice[] {
	return s.source_order.filter((id) => s.sources[id]).map((id) => ({ id, label: s.sources[id].name }))
}

/** Flows with an API call trigger, by name. */
export function flowChoices(s: State): Choice[] {
	return Object.entries(s.api_flows)
		.map(([id, f]) => ({ id, label: f.name }))
		.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

/**
 * Field keys of the given types across every template, labelled by their label (several
 * templates' labels for one key are joined: "Name / Guest"). The action picks a key; Kinetra
 * refuses it for a layer whose template doesn't have it.
 */
export function fieldChoices(s: State, types: readonly FieldType[]): Choice[] {
	const labels = new Map<string, string[]>()
	for (const id of Object.keys(s.templates).sort()) {
		for (const f of s.templates[id].fields) {
			if (!types.includes(f.type)) continue
			const l = labels.get(f.key) ?? []
			if (!l.includes(f.label)) l.push(f.label)
			labels.set(f.key, l)
		}
	}
	return [...labels.entries()]
		.map(([key, l]) => ({ id: key, label: l.join(' / ') }))
		.sort((a, b) => a.label.localeCompare(b.label) || a.id.localeCompare(b.id))
}

/** What `set_level` can drive: opacity, then each range variable (`var:<key>`). */
export function levelTargetChoices(s: State): Choice[] {
	const ranges = new Map<string, string[]>()
	for (const id of Object.keys(s.templates).sort()) {
		for (const r of s.templates[id].ranges) {
			const l = ranges.get(r.key) ?? []
			if (!l.includes(r.label)) l.push(r.label)
			ranges.set(r.key, l)
		}
	}
	const vars = [...ranges.entries()]
		.map(([key, l]) => ({ id: `var:${key}`, label: l.join(' / ') }))
		.sort((a, b) => a.label.localeCompare(b.label))
	return [{ id: 'opacity', label: 'Opacity' }, ...vars]
}

/**
 * Everything definitions are built from (ids, names, order, field keys and types): when this
 * string changes, actions, feedbacks, variables and presets are rebuilt. Values (on air, field
 * text, cue positions, rows) never change it.
 */
export function structureKey(s: State): string {
	const layers = Object.keys(s.layers)
		.sort()
		.map((k) => {
			const l = s.layers[k]
			return l.kind === 'template' ? [k, l.kind, l.name, l.template] : [k, l.kind, l.name, l.media.type]
		})
	const templates = Object.keys(s.templates)
		.sort()
		.map((id) => {
			const t = s.templates[id]
			return [id, t.name, t.fields.map((f) => [f.key, f.label, f.type]), t.ranges.map((r) => [r.key, r.label])]
		})
	const list = s.cue_lists.cues
	return JSON.stringify({
		screens: s.screen_order.map((id) => [id, s.screens[id]?.name, s.screens[id]?.layers]),
		layers,
		templates,
		cues: list ? list.order.map((id) => [id, list.cues[id]?.name]) : [],
		sources: s.source_order.map((id) => [id, s.sources[id]?.name]),
		flows: flowChoices(s).map((c) => [c.id, c.label]),
	})
}

/** A Companion variable id from parts: joined with `_`, anything but `[A-Za-z0-9_-]` replaced. */
export function varId(...parts: string[]): string {
	return parts.map((p) => p.replace(/[^A-Za-z0-9_-]/g, '_')).join('_')
}

/** `<screen>.<layer>` → its two ids. */
export function splitLayerKey(key: string): [string, string] | null {
	const i = key.indexOf('.')
	return i > 0 && i < key.length - 1 ? [key.slice(0, i), key.slice(i + 1)] : null
}
