// Kinetra's state tree as the module last received it: a snapshot, then diffs in `seq` order
// (JSON Pointer `put` / `del` ops, RFC 6901). A diff that doesn't fit (no snapshot yet, a gap in
// `seq`, a path whose parent is missing) is rejected whole; the caller asks for a `resync`.

import type { Diff, Snapshot, State } from './protocol.js'

/** What a diff changed, so only the affected feedbacks and variables are re-checked. */
export type Area = 'layers' | 'preview' | 'cues' | 'sources' | 'flows' | 'show' | 'structure' | 'other'

/** RFC 6901 tokens of a JSON Pointer (`/a/b~1c` → `a`, `b/c`); `null` if it isn't one. */
export function pointerTokens(path: string): string[] | null {
	if (!path.startsWith('/')) return null
	return path
		.slice(1)
		.split('/')
		.map((t) => t.replace(/~1/g, '/').replace(/~0/g, '~'))
}

/** The area a changed path belongs to. */
export function areaOf(tokens: string[]): Area {
	switch (tokens[0]) {
		case 'layers':
			return 'layers'
		case 'preview':
			return 'preview'
		case 'cue_lists':
			return 'cues'
		case 'sources':
			return 'sources'
		case 'api_flows':
			return 'flows'
		case 'studio_mode':
		case 'automation_off':
			return 'show'
		case 'screens':
		case 'screen_order':
		case 'templates':
		case 'cue_list_order':
		case 'source_order':
			return 'structure'
		default:
			return 'other'
	}
}

type Json = Record<string, unknown>

const isObject = (v: unknown): v is Json => typeof v === 'object' && v !== null && !Array.isArray(v)

/** Applies one op to `root` in place; `false` when its parent doesn't exist or isn't an object. */
function applyOp(root: Json, tokens: string[], put: boolean, value: unknown): boolean {
	if (tokens.length === 0) return false
	let parent: unknown = root
	for (const t of tokens.slice(0, -1)) {
		if (!isObject(parent) || !(t in parent)) return false
		parent = parent[t]
	}
	if (!isObject(parent)) return false
	const key = tokens[tokens.length - 1]
	if (put) {
		parent[key] = structuredClone(value)
		return true
	}
	if (!(key in parent)) return false
	delete parent[key]
	return true
}

export class KinetraState {
	#tree: State | null = null
	#seq: number | null = null

	/** The current tree; `null` before the first snapshot. */
	get tree(): State | null {
		return this.#tree
	}

	get seq(): number | null {
		return this.#seq
	}

	snapshot(msg: Snapshot): void {
		this.#tree = msg.state
		this.#seq = msg.seq
	}

	/**
	 * Applies a diff. Returns the areas it touched, or `null` when it can't be applied (no
	 * snapshot, not the next `seq`, a path that doesn't fit): nothing changed then, ask for a resync.
	 * A diff the module already has (an older `seq`) is ignored: an empty set.
	 */
	diff(msg: Diff): Set<Area> | null {
		if (this.#tree === null || this.#seq === null) return null
		if (msg.seq <= this.#seq) return new Set()
		if (msg.seq !== this.#seq + 1) return null
		const next = structuredClone(this.#tree) as unknown as Json
		const touched = new Set<Area>()
		for (const op of msg.ops) {
			const tokens = pointerTokens(op.path)
			if (tokens === null) return null
			if (!applyOp(next, tokens, op.op === 'put', op.op === 'put' ? op.value : undefined)) return null
			touched.add(areaOf(tokens))
		}
		this.#tree = next as unknown as State
		this.#seq = msg.seq
		return touched
	}

	/** Forgets everything (disconnected). */
	clear(): void {
		this.#tree = null
		this.#seq = null
	}
}
