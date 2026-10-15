import type {
	CompanionButtonStyleProps,
	CompanionPresetDefinitions,
	CompanionPresetSection,
	CompanionSimplePresetDefinition,
} from '@companion-module/base'
import { Colors } from './feedbacks.js'
import type { Host } from './host.js'
import type { ModuleSchema } from './main.js'
import { cueChoices, flowChoices, layerChoices, screenChoices, splitLayerKey, varId } from './kinetra/model.js'
import type { State } from './kinetra/protocol.js'

type Preset = CompanionSimplePresetDefinition<ModuleSchema>
type Steps = Preset['steps']
type Feedbacks = Preset['feedbacks']

const style = (text: string, over: Partial<CompanionButtonStyleProps> = {}): CompanionButtonStyleProps => ({
	text,
	size: 'auto',
	color: Colors.white,
	bgcolor: Colors.black,
	...over,
})

const press = (actionId: keyof ModuleSchema['actions'], options: Record<string, unknown>): Steps =>
	[{ down: [{ actionId, options }], up: [] }] as unknown as Steps

/** The presets, generated from Kinetra's state (none while not connected). */
export function presetDefinitions(
	host: Host,
	s: State | null,
): { structure: CompanionPresetSection<ModuleSchema>[]; presets: CompanionPresetDefinitions<ModuleSchema> } {
	const presets: Record<string, Preset> = {}
	const structure: CompanionPresetSection<ModuleSchema>[] = []
	if (!s) return { structure, presets }
	const v = (id: string) => `$(${host.label}:${id})`
	const add = (id: string, p: Omit<Preset, 'type'>): string => {
		presets[id] = { type: 'simple', ...p }
		return id
	}

	// Graphics: one Take / clear button per graphic, by screen, with Program and Preview tally.
	const groups = screenChoices(s)
		.map((screen) => {
			const ids = layerChoices(s)
				.filter((c) => s.layers[c.id]?.screen === screen.id)
				.map((c) => {
					const layer = s.layers[c.id]
					const options = { layer: c.id }
					return add(`toggle_${varId(...(splitLayerKey(c.id) ?? [c.id]))}`, {
						name: layer.name,
						style: style(layer.name),
						steps: press('toggle', options),
						feedbacks: [
							{ feedbackId: 'layer_in_preview', options, style: { bgcolor: Colors.preview, color: Colors.white } },
							{ feedbackId: 'layer_on_air', options, style: { bgcolor: Colors.program, color: Colors.white } },
							{ feedbackId: 'layer_not_ready', options, style: { color: Colors.amber } },
						] as Feedbacks,
					})
				})
			return { id: `screen_${screen.id}`, type: 'simple' as const, name: screen.label, presets: ids }
		})
		.filter((g) => g.presets.length > 0)
	if (groups.length) structure.push({ id: 'graphics', name: 'Graphics', definitions: groups })

	// Cues: one per cue (next green, running red), and GO with the next cue's name.
	const cues = cueChoices(s).map((c) =>
		add(`cue_${c.id}`, {
			name: c.label,
			style: style(c.label),
			steps: press('run_cue', { cue: c.id }),
			feedbacks: [
				{ feedbackId: 'cue_next', options: { cue: c.id }, style: { bgcolor: Colors.preview, color: Colors.white } },
				{ feedbackId: 'cue_running', options: { cue: c.id }, style: { bgcolor: Colors.program, color: Colors.white } },
			] as Feedbacks,
		}),
	)
	if (cues.length) {
		const go = add('go_next', {
			name: 'GO',
			style: style(`GO\n${v('cue_next')}`),
			steps: press('go_next', {}),
			feedbacks: [],
		})
		structure.push({ id: 'cues', name: 'Cues', definitions: [go, ...cues] })
	}

	// Sources: previous / next row, showing the current one.
	const sources = s.source_order
		.filter((id) => s.sources[id])
		.map((id) => {
			const src = s.sources[id]
			const label = v(varId('source', id, 'label'))
			return {
				id: `source_${id}`,
				type: 'simple' as const,
				name: src.name,
				presets: [
					add(`source_prev_${id}`, {
						name: `${src.name}: previous`,
						style: style(`◀ ${src.name}\n${label}`),
						steps: press('source_step', { source: id, dir: 'prev' }),
						feedbacks: [],
					}),
					add(`source_next_${id}`, {
						name: `${src.name}: next`,
						style: style(`${src.name} ▶\n${label}`),
						steps: press('source_step', { source: id, dir: 'next' }),
						feedbacks: [],
					}),
				],
			}
		})
	if (sources.length) structure.push({ id: 'sources', name: 'Sources', definitions: sources })

	// The show: Clear all, PANIC, Automation off, Studio take per screen.
	const show = [
		add('clear_all', { name: 'Clear all', style: style('Clear all'), steps: press('clear_all', {}), feedbacks: [] }),
		add('panic', {
			name: 'PANIC',
			style: style('PANIC', { color: Colors.program }),
			steps: press('panic', {}),
			feedbacks: [],
		}),
		add('automation', {
			name: 'Automation off',
			style: style('Automation'),
			steps: press('automation', { off: 'toggle' }),
			feedbacks: [
				{ feedbackId: 'automation_off', options: {}, style: { bgcolor: Colors.amber, color: Colors.black } },
			] as Feedbacks,
		}),
		...screenChoices(s).map((screen) =>
			add(`studio_take_${screen.id}`, {
				name: `Studio take: ${screen.label}`,
				style: style(`TAKE\n${screen.label}`),
				steps: press('studio_take', { screen: screen.id, transition: 'auto' }),
				feedbacks: [
					{ feedbackId: 'studio_mode', options: {}, style: { bgcolor: Colors.preview, color: Colors.white } },
				] as Feedbacks,
			}),
		),
	]
	structure.push({ id: 'show', name: 'Show', definitions: show })

	// Flows with an API call trigger.
	const flows = flowChoices(s).map((f) =>
		add(`flow_${f.id}`, {
			name: f.label,
			style: style(f.label),
			steps: press('run_flow', { flow: f.id, value: '' }),
			feedbacks: [],
		}),
	)
	if (flows.length) structure.push({ id: 'flows', name: 'Flows', definitions: flows })

	// Timers: Start, Pause and Reset, each showing the time.
	const timers: { id: string; type: 'simple'; name: string; presets: string[] }[] = []
	for (const c of layerChoices(s, (l) => l.kind === 'template')) {
		const layer = s.layers[c.id]
		if (layer.kind !== 'template') continue
		const [sid, lid] = splitLayerKey(c.id) ?? [c.id, '']
		for (const f of s.templates[layer.template]?.fields ?? []) {
			if (f.type !== 'timer') continue
			const time = v(varId('timer', sid, lid, f.key))
			const base = `timer_${varId(sid, lid, f.key)}`
			const button = (op: string, label: string) =>
				add(`${base}_${op}`, {
					name: `${c.label}: ${f.label}: ${label}`,
					style: style(`${label}\n${time}`),
					steps: press('timer', { layer: c.id, field: f.key, op }),
					feedbacks: [],
				})
			timers.push({
				id: base,
				type: 'simple',
				name: `${c.label}: ${f.label}`,
				presets: [button('start', 'Start'), button('pause', 'Pause'), button('reset', 'Reset')],
			})
		}
	}
	if (timers.length) structure.push({ id: 'timers', name: 'Timers', definitions: timers })

	return { structure, presets }
}
