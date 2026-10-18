import js from '@eslint/js';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist', 'node_modules', 'styled-system', 'cypress/screenshots', 'cypress/videos', 'cypress/downloads'] },
  {
    files: ['**/*.{ts,tsx}'],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    languageOptions: { ecmaVersion: 2022, globals: globals.browser },
  },
  {
    files: ['src/**/*.{ts,tsx}'],
    extends: [reactHooks.configs.flat.recommended],
  },
  {
    files: ['cypress/**/*.ts'],
    rules: {
      // Cypress declares custom commands via `declare global { namespace Cypress }`.
      '@typescript-eslint/no-namespace': 'off',
    },
  },
);
