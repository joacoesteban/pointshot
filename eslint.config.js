import tseslint from 'typescript-eslint'

export default tseslint.config(
  {
    ignores: [
      'build',
      '.wxt',
      '.output',
      'node_modules',
      '**/*.svelte',
      '*.config.*',
      '.prettierrc.mjs',
      'eslint.config.js',
    ],
  },
  ...tseslint.configs.strictTypeChecked,
  {
    languageOptions: {
      parserOptions: {
        projectService: true,
        tsconfigRootDir: import.meta.dirname,
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
)
