// The module's identity as Bitfocus requires it: the manifest id matches the repository name
// (minus `companion-module-`), MIT everywhere, Node 26, and package.json agrees.
import { readFileSync } from 'node:fs'
import { describe, expect, it } from 'vitest'

const read = (path: string) => JSON.parse(readFileSync(new URL(`../${path}`, import.meta.url), 'utf8'))
const manifest = read('companion/manifest.json')
const pkg = read('package.json')

describe('manifest', () => {
	it('names the module kinetra-graphics, shown as Kinetra', () => {
		expect(manifest.id).toBe('kinetra-graphics')
		expect(manifest.name).toBe('Kinetra')
		expect(manifest.shortname).toBe('kinetra')
		expect(manifest.manufacturer).toBe('Kinetra')
		expect(manifest.products).toEqual(['Kinetra'])
		// Keywords never repeat the manufacturer or product names.
		expect(manifest.keywords.some((k: string) => /kinetra/i.test(k))).toBe(false)
	})

	it('points at the Bitfocus repository and its issues', () => {
		const repo = 'github.com/bitfocus/companion-module-kinetra-graphics'
		expect(manifest.repository).toBe(`git+https://${repo}.git`)
		expect(manifest.bugs).toBe(`https://${repo}/issues`)
		expect(pkg.repository.url).toBe(manifest.repository)
		expect(pkg.bugs.url).toBe(manifest.bugs)
		expect(manifest.repository).toContain(`companion-module-${manifest.id}.git`)
	})

	it('is MIT, runs on Node 26 over IPC, and leaves versions to the build', () => {
		expect(manifest.license).toBe('MIT')
		expect(pkg.license).toBe('MIT')
		expect(readFileSync(new URL('../LICENSE', import.meta.url), 'utf8')).toContain('Rørvik Medieteknikk')
		expect(manifest.runtime).toEqual({
			type: 'node26',
			api: 'nodejs-ipc',
			apiVersion: '0.0.0',
			entrypoint: '../dist/main.js',
		})
		expect(manifest.version).toBe('0.0.0')
		expect(pkg.main).toBe('dist/main.js')
		expect(manifest.maintainers).toEqual([{ name: 'Ludvig', email: 'hello@kinetra.live' }])
	})
})
