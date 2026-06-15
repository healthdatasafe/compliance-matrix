import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import reactRefresh from 'eslint-plugin-react-refresh';
import tseslint from 'typescript-eslint';
import neostandard from 'neostandard';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'public/compliance.sqlite'] },
  {
    extends: [
      js.configs.recommended,
      ...tseslint.configs.recommended,
      ...neostandard({ semi: true, ts: true })
    ],
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      ecmaVersion: 2022,
      globals: globals.browser
    },
    plugins: {
      'react-hooks': reactHooks,
      'react-refresh': reactRefresh
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      'react-refresh/only-export-components': ['warn', { allowConstantExport: true }]
    }
  }
);
