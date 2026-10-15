import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const base = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...base,
	{
		// Tests, the test runner and scripts aren't shipped: they may import dev dependencies and dist/.
		files: ['vitest.config.ts', 'test/**/*.ts', 'scripts/**/*.mjs'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
