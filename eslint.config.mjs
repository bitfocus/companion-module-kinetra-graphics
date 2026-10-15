import { generateEslintConfig } from '@companion-module/tools/eslint/config.mjs'

const base = await generateEslintConfig({
	enableTypescript: true,
})

export default [
	...base,
	{
		// Tests and the test runner aren't shipped: they may import dev dependencies.
		files: ['vitest.config.ts', 'test/**/*.ts'],
		rules: {
			'n/no-unpublished-import': 'off',
		},
	},
]
