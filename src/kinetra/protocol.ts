// Kinetra's Control API, protocol 1: the messages and the state tree, as documented in Kinetra's
// docs/CONTROL_API.md and generated into docs/control-api.fixture.json (test/fixture/ has a copy;
// the tests check these types against it).

export const PROTOCOL = 1
export const SUBPROTOCOL = 'kinetra-control-local.v1'

/** WebSocket close codes Kinetra sends. */
export const CloseCode = {
	GoingAway: 1001,
	BadMessage: 4400,
	TokenChanged: 4401,
	Disconnected: 4403,
	ClientLimit: 4408,
	TurnedOff: 4409,
} as const

export type FieldType =
	'text' | 'multiline' | 'image' | 'video' | 'color' | 'number' | 'html' | 'list' | 'clock' | 'timer'

export interface FieldDef {
	key: string
	label: string
	type: FieldType
	/** list fields */
	columns?: { key: string; label: string }[]
	/** clock fields */
	format?: string
}

export interface Template {
	name: string
	fields: FieldDef[]
	variants: { id: string; name: string }[]
	/** range variables: what `set_level` can drive besides opacity */
	ranges: { key: string; label: string; min: number; max: number; step: number }[]
}

/** Media preloaded on Kinetra's outputs (`null`: the layer has nothing to preload). */
export interface Ready {
	loaded: number
	total: number
}

export interface TemplateLayer {
	kind: 'template'
	screen: string
	name: string
	template: string
	/** From take until clear. */
	on_air: boolean
	/** Every field but clocks, as text (lists and timers as JSON text). */
	values: Record<string, string>
	/** Fields fed by a data source: set_fields refuses them. */
	bound: string[]
	/** Changes staged for the next take. */
	pending: boolean
	variant: string
	/** 0–100 */
	opacity: number
	ready: Ready | null
}

export type PlaybackState = 'playing' | 'paused' | 'stopped'

export interface Playback {
	state: PlaybackState
	/** Position at server time `at` (epoch ms); while playing it advances with the clock. */
	pos_ms: number
	at: number
	in_ms: number
	out_ms: number | null
	duration_ms: number | null
}

export interface MediaLayer {
	kind: 'media'
	screen: string
	name: string
	on_air: boolean
	opacity: number
	media: { type: 'image' | 'video' | 'audio'; name: string; playback?: Playback }
	ready: Ready | null
}

export type Layer = TemplateLayer | MediaLayer

/** A timer field's value (`values[key]` parsed). */
export interface TimerState {
	/** Running. */
	run: boolean
	/** Server time (epoch ms) it started running from `base`. */
	at: number
	/** ms: elapsed (up) or remaining (down) at `at`. */
	base: number
	dir: 'up' | 'down'
	end: 'stop' | 'hide'
}

export interface CueList {
	name: string
	cues: Record<string, { name: string; note: string; running: boolean }>
	order: string[]
	current: string | null
	next: string | null
}

export interface Source {
	name: string
	kind: 'text' | 'schedule' | 'api' | 'poll'
	/** 0-based */
	index: number
	count: number
	/** The first column of the current row. */
	label: string
}

export interface State {
	screens: Record<string, { name: string; layers: string[] }>
	screen_order: string[]
	templates: Record<string, Template>
	layers: Record<string, Layer>
	cue_lists: Record<string, CueList>
	cue_list_order: string[]
	api_flows: Record<string, { name: string; armed: boolean }>
	sources: Record<string, Source>
	source_order: string[]
	automation_off: boolean
	studio_mode: boolean
	preview: Record<string, string[]>
	assets: { path: string; name: string; kind: 'image' | 'video' }[]
}

export type Op = { op: 'put'; path: string; value: unknown } | { op: 'del'; path: string }

export interface Welcome {
	t: 'welcome'
	protocol: number
	app: string
	version: string
	channel: 'stable' | 'canary'
	/** Kinetra's clock (epoch ms) when it sent this. */
	now: number
	project: { name: string }
	features: string[]
}

export interface Snapshot {
	t: 'snapshot'
	seq: number
	state: State
}

export interface Diff {
	t: 'diff'
	seq: number
	cause?: string
	ops: Op[]
}

export type Result =
	{ t: 'result'; corr: string; ok: true } | { t: 'result'; corr: string; ok: false; code: string; message: string }

export type ServerMessage = Welcome | Snapshot | Diff | Result

/** Parses a message from Kinetra; `null` for anything this protocol doesn't know. */
export function parseMessage(text: string): ServerMessage | null {
	let v: unknown
	try {
		v = JSON.parse(text)
	} catch {
		return null
	}
	if (typeof v !== 'object' || v === null) return null
	const m = v as { t?: unknown }
	switch (m.t) {
		case 'welcome':
		case 'snapshot':
		case 'diff':
		case 'result':
			return v as ServerMessage
		default:
			return null
	}
}
