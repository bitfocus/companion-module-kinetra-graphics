import type { CompanionActionDefinitions, CompanionInputFieldDropdown } from '@companion-module/base'
import type { Host } from './host.js'
import {
	cueChoices,
	fieldChoices,
	flowChoices,
	layerChoices,
	levelTargetChoices,
	mediaLayerChoices,
	screenChoices,
	sourceChoices,
	TEXT_TYPES,
	timerLayerChoices,
	type Choice,
} from './kinetra/model.js'
import { EMPTY_STATE, type State } from './kinetra/protocol.js'

type Layer = { layer: string }
type None = Record<string, never>

export type ActionsSchema = {
	take: { options: Layer }
	clear: { options: Layer }
	toggle: { options: Layer }
	update: { options: Layer }
	set_text: { options: Layer & { field: string; value: string; take: boolean } }
	set_fields_json: { options: Layer & { values: string; take: boolean } }
	run_cue: { options: { cue: string } }
	go_next: { options: None }
	clear_screen: { options: { screen: string } }
	clear_all: { options: None }
	panic: { options: None }
	source_step: { options: { source: string; dir: string } }
	media: { options: Layer & { op: string; sec: number } }
	set_level: { options: Layer & { target: string; percent: number } }
	studio_take: { options: { screen: string; transition: string } }
	timer: { options: Layer & { field: string; op: string } }
	automation: { options: { off: string } }
	run_flow: { options: { flow: string; value: string } }
}

/** A dropdown of Kinetra items (ids stored, names shown; a custom value can be a variable). */
export function itemDropdown<K extends string>(
	id: K,
	label: string,
	choices: Choice[],
): CompanionInputFieldDropdown<K, string> {
	return {
		type: 'dropdown' as const,
		id,
		label,
		choices,
		default: choices[0]?.id ?? '',
		allowCustom: true,
	}
}

const text = (v: unknown): string =>
	typeof v === 'string' ? v : typeof v === 'number' || typeof v === 'boolean' ? String(v) : ''

/** The actions, with dropdowns from Kinetra's state (empty while not connected). */
export function actionDefinitions(host: Host, s: State | null): CompanionActionDefinitions<ActionsSchema> {
	const st = s ?? EMPTY_STATE
	const layers = layerChoices(st)
	const layer = itemDropdown('layer', 'Graphic', layers)
	const templateLayer = itemDropdown(
		'layer',
		'Graphic',
		layerChoices(st, (l) => l.kind === 'template'),
	)
	const run = async (action: string, args: Record<string, unknown>, what: string) => host.run(action, args, what)
	const name = (key: string) => layers.find((c) => c.id === key)?.label ?? key

	return {
		take: {
			name: 'Take',
			description: 'On air (in Studio mode: cue into Preview)',
			options: [layer],
			callback: async (e) => run('take', { layer: e.options.layer }, `Take ${name(e.options.layer)}`),
		},
		clear: {
			name: 'Clear',
			description: 'Off air (in Studio mode: cue out of Preview)',
			options: [layer],
			callback: async (e) => run('clear', { layer: e.options.layer }, `Clear ${name(e.options.layer)}`),
		},
		toggle: {
			name: 'Take / clear',
			options: [layer],
			callback: async (e) => run('toggle', { layer: e.options.layer }, `Take / clear ${name(e.options.layer)}`),
		},
		update: {
			name: 'Update (apply staged changes)',
			options: [layer],
			callback: async (e) => run('update', { layer: e.options.layer }, `Update ${name(e.options.layer)}`),
		},
		set_text: {
			name: 'Set text',
			description: 'Sets one text field of a graphic',
			options: [
				templateLayer,
				itemDropdown('field', 'Field', fieldChoices(st, TEXT_TYPES)),
				{ type: 'textinput', id: 'value', label: 'Text', default: '' },
				{ type: 'checkbox', id: 'take', label: 'Take it too', default: false },
			],
			callback: async (e) =>
				run(
					'set_fields',
					{ layer: e.options.layer, values: { [e.options.field]: text(e.options.value) }, take: e.options.take },
					`Set text on ${name(e.options.layer)}`,
				),
		},
		set_fields_json: {
			name: 'Set fields (JSON)',
			description: 'Several fields at once, e.g. {"name": "Ingrid Vale", "title": "Host"}',
			options: [
				templateLayer,
				{ type: 'textinput', id: 'values', label: 'Fields (JSON object)', default: '{}' },
				{ type: 'checkbox', id: 'take', label: 'Take it too', default: false },
			],
			callback: async (e) => {
				let values: unknown
				try {
					values = JSON.parse(text(e.options.values))
				} catch {
					values = null
				}
				if (typeof values !== 'object' || values === null || Array.isArray(values)) {
					host.log('warn', `Set fields on ${name(e.options.layer)}: the fields must be a JSON object`)
					return
				}
				await run(
					'set_fields',
					{ layer: e.options.layer, values, take: e.options.take },
					`Set fields on ${name(e.options.layer)}`,
				)
			},
		},
		run_cue: {
			name: 'Run cue',
			options: [itemDropdown('cue', 'Cue', cueChoices(st))],
			callback: async (e) => run('run_cue', { cue: e.options.cue }, 'Run cue'),
		},
		go_next: {
			name: 'GO (next cue)',
			options: [],
			callback: async () => run('go_next', {}, 'GO'),
		},
		clear_screen: {
			name: 'Clear screen',
			options: [itemDropdown('screen', 'Screen', screenChoices(st))],
			callback: async (e) => run('clear_screen', { screen: e.options.screen }, 'Clear screen'),
		},
		clear_all: {
			name: 'Clear all',
			description: 'Every graphic on every screen off air',
			options: [],
			callback: async () => run('clear_all', {}, 'Clear all'),
		},
		panic: {
			name: 'PANIC',
			description: 'Everything off air at once, no animation',
			options: [],
			callback: async () => run('panic', {}, 'PANIC'),
		},
		source_step: {
			name: 'Source: next / previous row',
			options: [
				itemDropdown('source', 'Source', sourceChoices(st)),
				{
					type: 'dropdown',
					id: 'dir',
					label: 'Direction',
					choices: [
						{ id: 'next', label: 'Next' },
						{ id: 'prev', label: 'Previous' },
					],
					default: 'next',
				},
			],
			callback: async (e) => run('source_step', { source: e.options.source, dir: e.options.dir }, 'Source step'),
		},
		media: {
			name: 'Media',
			description: 'Play, pause, stop, restart or go to a time in a video or audio layer',
			options: [
				itemDropdown('layer', 'Media', mediaLayerChoices(st)),
				{
					type: 'dropdown',
					id: 'op',
					label: 'Do',
					choices: [
						{ id: 'play', label: 'Play' },
						{ id: 'pause', label: 'Pause' },
						{ id: 'stop', label: 'Stop' },
						{ id: 'restart', label: 'Restart' },
						{ id: 'seek', label: 'Go to' },
					],
					default: 'play',
					disableAutoExpression: true,
				},
				{
					type: 'number',
					id: 'sec',
					label: 'Seconds',
					default: 0,
					min: 0,
					max: 86400,
					isVisibleExpression: `$(options:op) == 'seek'`,
				},
			],
			callback: async (e) =>
				run(
					'media',
					{ layer: e.options.layer, op: e.options.op, ...(e.options.op === 'seek' ? { sec: e.options.sec } : {}) },
					`Media ${name(e.options.layer)}`,
				),
		},
		set_level: {
			name: 'Opacity / slider',
			description: "Opacity, or one of the graphic's sliders, from 0 to 100 %",
			options: [
				layer,
				itemDropdown('target', 'What', levelTargetChoices(st)),
				{ type: 'number', id: 'percent', label: 'Level (%)', default: 100, min: 0, max: 100 },
			],
			callback: async (e) =>
				run(
					'set_level',
					{
						layer: e.options.layer,
						target: e.options.target,
						value: Math.min(100, Math.max(0, Number(e.options.percent) || 0)) / 100,
					},
					`Level on ${name(e.options.layer)}`,
				),
		},
		studio_take: {
			name: 'Studio take',
			description: "Takes a screen's Preview to Program (Studio mode)",
			options: [
				itemDropdown('screen', 'Screen', screenChoices(st)),
				{
					type: 'dropdown',
					id: 'transition',
					label: 'Transition',
					choices: [
						{ id: 'auto', label: "The project's" },
						{ id: 'cut', label: 'Cut' },
					],
					default: 'auto',
				},
			],
			callback: async (e) =>
				run('studio_take', { screen: e.options.screen, transition: e.options.transition }, 'Studio take'),
		},
		timer: {
			name: 'Timer',
			options: [
				itemDropdown('layer', 'Graphic', timerLayerChoices(st)),
				itemDropdown('field', 'Timer', fieldChoices(st, ['timer'])),
				{
					type: 'dropdown',
					id: 'op',
					label: 'Do',
					choices: [
						{ id: 'start', label: 'Start' },
						{ id: 'pause', label: 'Pause' },
						{ id: 'reset', label: 'Reset' },
					],
					default: 'start',
				},
			],
			callback: async (e) =>
				run(
					'timer',
					{ layer: e.options.layer, field: e.options.field, op: e.options.op },
					`Timer on ${name(e.options.layer)}`,
				),
		},
		automation: {
			name: 'Automation off',
			description: 'While Automation is off, nothing goes on air by itself',
			options: [
				{
					type: 'dropdown',
					id: 'off',
					label: 'Automation',
					choices: [
						{ id: 'toggle', label: 'Toggle' },
						{ id: 'off', label: 'Off' },
						{ id: 'on', label: 'On' },
					],
					default: 'toggle',
				},
			],
			callback: async (e) =>
				run('automation', { off: e.options.off === 'toggle' ? 'toggle' : e.options.off === 'off' }, 'Automation'),
		},
		run_flow: {
			name: 'Run flow (API call)',
			description: 'Runs a flow whose trigger is API call',
			options: [
				itemDropdown('flow', 'Flow', flowChoices(st)),
				{ type: 'textinput', id: 'value', label: 'Value (optional)', default: '' },
			],
			callback: async (e) => {
				const value = text(e.options.value)
				await run('run_flow', { flow: e.options.flow, ...(value ? { value } : {}) }, 'Run flow')
			},
		},
	}
}
