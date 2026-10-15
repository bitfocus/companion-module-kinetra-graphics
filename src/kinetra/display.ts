// What timers and media show, computed from Kinetra's state and its clock (the same arithmetic
// as Kinetra's renderer, so a button and the output agree to the second).

import type { Playback, TimerState } from './protocol.js'

const p2 = (n: number) => String(n).padStart(2, '0')

/** `m:ss` below an hour, `h:mm:ss` from an hour. */
export function clockText(sec: number): string {
	const h = Math.floor(sec / 3600)
	const m = Math.floor(sec / 60) % 60
	return h ? `${h}:${p2(m)}:${p2(sec % 60)}` : `${m}:${p2(sec % 60)}`
}

/** A timer field's value; `null` if it isn't one. */
export function parseTimer(value: string | undefined): TimerState | null {
	if (!value) return null
	try {
		const v = JSON.parse(value) as Partial<TimerState>
		return typeof v === 'object' && v !== null && typeof v.base === 'number'
			? {
					run: v.run === true,
					at: typeof v.at === 'number' ? v.at : 0,
					base: v.base,
					dir: v.dir === 'down' ? 'down' : 'up',
					end: v.end === 'hide' ? 'hide' : 'stop',
				}
			: null
	} catch {
		return null
	}
}

/** Milliseconds a timer shows at server time `now`: up counts from base, down to zero. */
export function timerMs(s: TimerState, now: number): number {
	const base = Math.max(0, s.base)
	if (!s.run) return base
	const e = Math.max(0, now - s.at)
	return s.dir === 'down' ? Math.max(0, base - e) : base + e
}

/** The timer as Kinetra shows it: up floors, down ceils (0:00 only at zero). */
export function timerText(s: TimerState, now: number): string {
	const ms = timerMs(s, now)
	return clockText(s.dir === 'down' ? Math.ceil(ms / 1000) : Math.floor(ms / 1000))
}

/** Whether the timer's text changes over time. */
export const timerRuns = (s: TimerState, now: number): boolean => s.run && (s.dir === 'up' || timerMs(s, now) > 0)

/** Where the media is at server time `now` (ms), and where it ends (`null`: unknown). */
export function mediaPosition(p: Playback, now: number): { pos: number; end: number | null } {
	const end = p.out_ms ?? p.duration_ms
	const raw = p.state === 'stopped' ? p.in_ms : p.pos_ms + (p.state === 'playing' ? Math.max(0, now - p.at) : 0)
	return { pos: end === null ? raw : Math.min(raw, end), end }
}

/** Time left, `m:ss` (rounded up); empty when the end is unknown. */
export function mediaRemainingText(p: Playback, now: number): string {
	const { pos, end } = mediaPosition(p, now)
	return end === null ? '' : clockText(Math.ceil(Math.max(0, end - pos) / 1000))
}
