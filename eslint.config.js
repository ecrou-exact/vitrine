import js from '@eslint/js';
import globals from 'globals';
import prettier from 'eslint-config-prettier';

export default [
  {
    ignores: ['dist/', 'coverage/', 'node_modules/', 'test-results/', 'playwright-report/'],
  },
  js.configs.recommended,
  {
    files: ['src/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.browser },
    },
    rules: {
      'no-eval': 'error',
      'no-implied-eval': 'error',
      'no-new-func': 'error',
      'no-script-url': 'error',
      'no-restricted-properties': [
        'error',
        {
          property: 'outerHTML',
          message: 'Use DOM APIs; untrusted HTML must go through the sanitizer.',
        },
      ],
      'no-restricted-syntax': [
        'error',
        {
          selector: "AssignmentExpression[left.property.name='innerHTML']",
          message:
            'Assigning innerHTML is forbidden outside src/core/security.js. Use textContent or the sanitizer.',
        },
        {
          selector: "CallExpression[callee.property.name='insertAdjacentHTML']",
          message: 'insertAdjacentHTML is forbidden. Use DOM APIs or the sanitizer.',
        },
        {
          selector: "CallExpression[callee.object.name='document'][callee.property.name='write']",
          message: 'document.write is forbidden.',
        },
      ],
    },
  },
  {
    files: ['src/core/security.js'],
    rules: { 'no-restricted-syntax': 'off' },
  },
  {
    files: ['scripts/**/*.js', '*.config.js', 'tests/**/*.js'],
    languageOptions: {
      ecmaVersion: 2022,
      sourceType: 'module',
      globals: { ...globals.node, ...globals.browser },
    },
  },
  prettier,
];
