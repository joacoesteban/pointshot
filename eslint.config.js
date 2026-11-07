import svelte from 'eslint-plugin-svelte'
import tseslint from 'typescript-eslint'
import svelteConfig from './svelte.config.mjs'

export default tseslint.config(
  {
    ignores: [
      'build',
      '.wxt',
      '.output',
      'node_modules',
      '*.config.*',
      '.prettierrc.mjs',
      'eslint.config.js',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  ...svelte.configs.recommended,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
        extraFileExtensions: ['.svelte'],
      },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-extraneous-class': [
        'error',
        { allowStaticOnly: true },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: 'ConditionalExpression',
          message: 'Use ts-pattern instead of ternaries.',
        },
        {
          selector: 'TryStatement',
          message: 'Use neverthrow results instead of try/catch.',
        },
      ],
    },
  },
  {
    files: ['**/*.svelte'],
    languageOptions: {
      parserOptions: {
        parser: tseslint.parser,
        svelteConfig,
      },
    },
  },
)
