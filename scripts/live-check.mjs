// Checks the module's client against a running Kinetra without changing anything on air: it
// connects, reads the state and sends one command Kinetra refuses (an unknown layer).
//
//   KINETRA_TOKEN=kt_… [KINETRA_HOST=127.0.0.1] [KINETRA_PORT=7770] yarn live-check
//
// Needs `yarn build` first (it uses dist/).
import { KinetraClient } from '../dist/kinetra/client.js'

const host = process.env.KINETRA_HOST || '127.0.0.1'
const port = Number(process.env.KINETRA_PORT || 7770)
const token = process.env.KINETRA_TOKEN || ''
if (!token) {
	console.error('Set KINETRA_TOKEN (Kinetra › Preferences › Network & API › Control API › Copy token)')
	process.exitCode = 2
} else {
	const client = new KinetraClient(
		{ host, port, token, clientName: 'companion-module-kinetra-graphics/live-check' },
		{
			status: (s) => console.log(`status: ${s.kind}${'detail' in s ? ` (${s.detail})` : ''}`),
			snapshot: () => {},
			diff: () => {},
			log: () => {},
		},
	)
	client.start()
	const deadline = Date.now() + 10_000
	while (client.status.kind !== 'connected' && Date.now() < deadline) await new Promise((r) => setTimeout(r, 50))
	if (client.status.kind !== 'connected') {
		console.error(`not connected: ${client.status.kind}`)
		process.exitCode = 1
	} else {
		const s = client.state
		console.log(
			`connected: ${s.screen_order.length} screens, ${Object.keys(s.layers).length} layers, ` +
				`${s.cue_lists.cues?.order.length ?? 0} cues, ${s.source_order.length} sources`,
		)
		const r = await client.command('take', { layer: 'live-check.none' })
		console.log(`refused as expected: ${r.ok === false && r.code === 'not_found' ? 'yes' : JSON.stringify(r)}`)
		if (r.ok !== false || r.code !== 'not_found') process.exitCode = 1
	}
	client.stop()
}
