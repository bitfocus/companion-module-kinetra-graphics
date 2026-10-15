// Keeps test/fixture/control-api.fixture.json equal to Kinetra's docs/control-api.fixture.json (the
// Control API's contract, generated from the app's code) at a recorded commit of the public repo.
//
//   node scripts/sync-fixture.mjs <commit|tag>        download it at that ref and record it
//   node scripts/sync-fixture.mjs --from <checkout>   copy it from a local Kinetra checkout (its HEAD)
//   node scripts/sync-fixture.mjs --check             download it at the recorded ref; fail if different
import { execFileSync } from 'node:child_process'
import { createHash } from 'node:crypto'
import { readFileSync, writeFileSync } from 'node:fs'
import { join } from 'node:path'

const REPO = 'KinetraLive/kinetra-app'
const PATH = 'docs/control-api.fixture.json'
const root = new URL('../', import.meta.url)
const fixtureFile = new URL('test/fixture/control-api.fixture.json', root)
const sourceFile = new URL('test/fixture/source.json', root)

const sha256 = (text) => createHash('sha256').update(text).digest('hex')
const normalize = (text) => text.replace(/\r\n/g, '\n')

async function download(ref) {
	const url = `https://raw.githubusercontent.com/${REPO}/${ref}/${PATH}`
	const res = await fetch(url)
	if (!res.ok) throw new Error(`${url}: HTTP ${res.status}`)
	return normalize(await res.text())
}

function record(text, ref) {
	writeFileSync(fixtureFile, text)
	writeFileSync(sourceFile, JSON.stringify({ repo: REPO, path: PATH, ref, sha256: sha256(text) }, null, '\t') + '\n')
	console.log(`fixture at ${REPO}@${ref} (${text.length} bytes)`)
}

const [arg, value] = process.argv.slice(2)
if (arg === '--check') {
	const source = JSON.parse(readFileSync(sourceFile, 'utf8'))
	const have = normalize(readFileSync(fixtureFile, 'utf8'))
	const want = await download(source.ref)
	if (have !== want || sha256(have) !== source.sha256) {
		console.error(`test/fixture/control-api.fixture.json differs from ${REPO}@${source.ref}`)
		process.exitCode = 1
	} else {
		console.log(`fixture matches ${REPO}@${source.ref}`)
	}
} else if (arg === '--from') {
	if (!value) throw new Error('--from needs the path of a Kinetra checkout')
	const ref = execFileSync('git', ['-C', value, 'rev-parse', 'HEAD'], { encoding: 'utf8' }).trim()
	record(normalize(readFileSync(join(value, PATH), 'utf8')), ref)
} else if (arg) {
	record(await download(arg), arg)
} else {
	console.error('usage: sync-fixture.mjs <commit|tag> | --from <checkout> | --check')
	process.exitCode = 2
}
