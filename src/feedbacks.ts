import type { CompanionFeedbackDefinitions } from '@companion-module/base'
import { itemDropdown } from './actions.js'
import type { Host } from './host.js'
import { cueChoices, layerChoices, mediaLayerChoices } from './kinetra/model.js'
import { EMPTY_STATE, type State } from './kinetra/protocol.js'
import type { Area } from './kinetra/state.js'

/** Kinetra's tally colors and the rest of the module's palette. */
export const Colors = {
	program: 0xcc0000,
	preview: 0x009933,
	amber: 0xcc8800,
	white: 0xffffff,
	black: 0x000000,
	dim: 0x333333,
} as const

type Layer = { layer: string }
type None = Record<string, never>

export type FeedbacksSchema = {
	layer_on_air: { type: 'boolean'; options: Layer }
	layer_in_preview: { type: 'boolean'; options: Layer }
	layer_pending: { type: 'boolean'; options: Layer }
	layer_not_ready: { type: 'boolean'; options: Layer }
	cue_running: { type: 'boolean'; options: { cue: string } }
	cue_next: { type: 'boolean'; options: { cue: string } }
	media_playing: { type: 'boolean'; options: Layer }
	studio_mode: { type: 'boolean'; options: None }
	automation_off: { type: 'boolean'; options: None }
	connected: { type: 'boolean'; options: None }
}

export type FeedbackId = keyof FeedbacksSchema

/** Which feedbacks to re-check when a diff touched an area. */
export const FEEDBACKS_BY_AREA: Record<Area, FeedbackId[]> = {
	layers: ['layer_on_air', 'layer_pending', 'layer_not_ready', 'media_playing'],
	preview: ['layer_in_preview'],
	cues: ['cue_running', 'cue_next'],
	show: ['studio_mode', 'automation_off', 'layer_in_preview'],
	sources: [],
	flows: [],
	structure: [],
	other: [],
}

/** Whether a layer is cued in its screen's Preview (Studio mode). */
export function inPreview(s: State, key: string): boolean {
	const l = s.layers[key]
	return !!l && s.studio_mode && (s.preview[l.screen] ?? []).includes(key)
}

/** Boolean feedbacks reading Kinetra's state (all false while not connected). */
export function feedbackDefinitions(host: Host, s: State | null): CompanionFeedbackDefinitions<FeedbacksSchema> {
	const st = s ?? EMPTY_STATE
	const layer = itemDropdown('layer', 'Graphic', layerChoices(st))
	const now = (): State | null => host.kinetraState
	const lay = (key: string) => now()?.layers[key]
	const cues = () => now()?.cue_lists.cues
	return {
		layer_on_air: {
			type: 'boolean',
			name: 'Graphic on air (Program)',
			defaultStyle: { bgcolor: Colors.program, color: Colors.white },
			options: [layer],
			callback: (f) => lay(f.options.layer)?.on_air === true,
		},
		layer_in_preview: {
			type: 'boolean',
			name: 'Graphic in Preview (Studio mode)',
			defaultStyle: { bgcolor: Colors.preview, color: Colors.white },
			options: [layer],
			callback: (f) => {
				const s = now()
				return s !== null && inPreview(s, f.options.layer)
			},
		},
		layer_pending: {
			type: 'boolean',
			name: 'Graphic has changes for the next take',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [layer],
			callback: (f) => {
				const l = lay(f.options.layer)
				return l?.kind === 'template' && l.pending
			},
		},
		layer_not_ready: {
			type: 'boolean',
			name: 'Graphic not loaded on every output',
			description: 'Its video or images are still loading somewhere',
			defaultStyle: { color: Colors.amber },
			options: [layer],
			callback: (f) => {
				const r = lay(f.options.layer)?.ready
				return !!r && r.loaded < r.total
			},
		},
		cue_running: {
			type: 'boolean',
			name: 'Cue running',
			defaultStyle: { bgcolor: Colors.program, color: Colors.white },
			options: [itemDropdown('cue', 'Cue', cueChoices(st))],
			callback: (f) => cues()?.cues[f.options.cue]?.running === true,
		},
		cue_next: {
			type: 'boolean',
			name: 'Cue is next',
			defaultStyle: { bgcolor: Colors.preview, color: Colors.white },
			options: [itemDropdown('cue', 'Cue', cueChoices(st))],
			callback: (f) => cues()?.next === f.options.cue,
		},
		media_playing: {
			type: 'boolean',
			name: 'Media playing',
			defaultStyle: { bgcolor: Colors.preview, color: Colors.white },
			options: [itemDropdown('layer', 'Media', mediaLayerChoices(st))],
			callback: (f) => {
				const l = lay(f.options.layer)
				return l?.kind === 'media' && l.media.playback?.state === 'playing'
			},
		},
		studio_mode: {
			type: 'boolean',
			name: 'Studio mode on',
			defaultStyle: { bgcolor: Colors.preview, color: Colors.white },
			options: [],
			callback: () => now()?.studio_mode === true,
		},
		automation_off: {
			type: 'boolean',
			name: 'Automation off',
			defaultStyle: { bgcolor: Colors.amber, color: Colors.black },
			options: [],
			callback: () => now()?.automation_off === true,
		},
		connected: {
			type: 'boolean',
			name: 'Connected to Kinetra',
			description: 'Invert it to dim buttons while Kinetra is away',
			defaultStyle: { bgcolor: Colors.dim },
			showInvert: true,
			options: [],
			callback: () => host.connected,
		},
	}
}
