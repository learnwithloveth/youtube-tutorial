import { defineConfig, globalIgnores } from 'eslint/config';
import nextVitals from 'eslint-config-next/core-web-vitals';
import nextTs from 'eslint-config-next/typescript';

/**
 * Lint configuration.
 *
 * Next's flat config carries the rules that matter for correctness in this
 * framework (hook dependencies, the server/client boundary, image and script
 * usage). The additions below are the ones this codebase's architecture depends
 * on and that no default catches.
 */
const eslintConfig = defineConfig([
  ...nextVitals,
  ...nextTs,

  globalIgnores([
    '.next/**',
    'out/**',
    'build/**',
    'next-env.d.ts',
    'drizzle/**',
  ]),

  {
    rules: {
      // An unused import is usually the residue of a half-finished edit. The
      // underscore escape hatch keeps deliberately-ignored parameters legal.
      '@typescript-eslint/no-unused-vars': [
        'error',
        {
          argsIgnorePattern: '^_',
          varsIgnorePattern: '^_',
          caughtErrors: 'none',
        },
      ],
      // `import type` keeps type-only imports out of the emitted bundle, which
      // matters at the server/client boundary: a value import of a server
      // module from a client file is an error, a type import is not.
      '@typescript-eslint/consistent-type-imports': [
        'warn',
        { prefer: 'type-imports', fixStyle: 'inline-type-imports' },
      ],
    },
  },

  {
    // The domain layer is plain TypeScript with no I/O. Anything that reaches
    // for a browser or Node global here is in the wrong layer — the
    // dependency-cruiser rules catch imports, this catches globals.
    files: ['src/modules/*/domain/**/*.ts'],
    rules: {
      'no-restricted-globals': [
        'error',
        { name: 'window', message: 'The domain layer must not touch the browser.' },
        { name: 'document', message: 'The domain layer must not touch the browser.' },
        { name: 'fetch', message: 'I/O belongs in an adapter behind a port.' },
        { name: 'process', message: 'Configuration is injected, not read from the environment.' },
      ],
    },
  },

  {
    // Tests assert on things production code should not do.
    files: ['**/__tests__/**/*.ts', '**/*.test.ts'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
    },
  },
]);

export default eslintConfig;
