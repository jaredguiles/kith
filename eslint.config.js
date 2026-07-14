'use strict';

// ESLint flat config — two worlds:
//   1. server/**            Node.js 24, CommonJS
//   2. server/public/**     browser vanilla-JS SPA, classic scripts (no build
//                           step — files share globals via <script> tags)
// Vendored frontend libs are not ours to lint.

const js = require('@eslint/js');
const globals = require('globals');

module.exports = [
  {
    ignores: [
      'node_modules/**',
      'server/public/vendor/**',
      'data/**',
    ],
  },

  // Server-side Node (CJS)
  {
    files: ['server/**/*.js', 'eslint.config.js'],
    ignores: ['server/public/**'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'commonjs',
      globals: { ...globals.node },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      // Intentional patterns in this codebase:
      'no-empty': ['error', { allowEmptyCatch: true }],
    },
  },

  // Browser SPA (ES modules, no build step)
  {
    files: ['server/public/**/*.js'],
    ignores: ['server/public/vendor/**'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        ...globals.browser,
        ...globals.serviceworker,
      },
    },
    rules: {
      ...js.configs.recommended.rules,
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', caughtErrors: 'none' }],
      'no-empty': ['error', { allowEmptyCatch: true }],
      // Vendored libs land as bare globals (L, d3, MiniSearch, f3) via
      // <script> tags — per-file no-undef can't see them.
      'no-undef': 'off',
    },
  },
];
