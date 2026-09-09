/**
 * Machine-enforced layer boundaries.
 *
 * Clean architecture is a claim about which direction imports point, and a
 * claim nothing checks is a claim that stops being true. Code review does not
 * reliably catch a single `import` on line 40 of a file whose diff is about
 * something else. These rules do.
 *
 * Run with `pnpm lint:boundaries`.
 */
module.exports = {
  forbidden: [
    {
      name: 'domain-stays-pure',
      severity: 'error',
      comment:
        'A domain layer must not know about React, Next.js, the database, the network, ' +
        'or any other module. A framework import in a domain file means a business rule ' +
        'has been written somewhere it cannot be tested or reused.',
      from: { path: '^src/modules/[^/]+/domain' },
      to: {
        pathNot: [
          '^src/modules/[^/]+/domain',
          '^src/shared/kernel',
          '^node_modules/typescript',
        ],
      },
    },
    {
      name: 'application-knows-only-domain',
      severity: 'error',
      comment:
        'The application layer orchestrates the domain through ports it declares itself. ' +
        'It must not reach into infrastructure — that inverts the dependency and makes ' +
        'the use cases untestable without a database.',
      from: { path: '^src/modules/[^/]+/application' },
      to: {
        path: '^src/modules/[^/]+/infrastructure',
      },
    },
    {
      name: 'no-inward-import-of-presentation',
      severity: 'error',
      comment:
        'Nothing inside a module may import from src/app. The App Router is the outermost ' +
        'layer; if a module needs something from it, the dependency is upside down.',
      from: { path: '^src/(modules|shared|platform)' },
      to: { path: '^src/app' },
    },
    {
      name: 'modules-talk-through-barrels',
      severity: 'error',
      comment:
        'Cross-module imports must go through the public barrel (index.ts or server.ts). ' +
        'Reaching into another module\'s internals couples you to how it works rather than ' +
        'what it offers, and makes it impossible to change without breaking callers.',
      from: { path: '^src/modules/([^/]+)/.+' },
      to: {
        path: '^src/modules/([^/]+)/(?!index|server)',
        pathNot: '^src/modules/$1/',
      },
    },
    {
      name: 'app-uses-module-barrels-only',
      severity: 'error',
      comment:
        'Pages import from @/modules/<name> or @/modules/<name>/server, never from a path ' +
        'inside a module. Same reason: the barrel is the contract.',
      from: { path: '^src/app' },
      to: { path: '^src/modules/[^/]+/(domain|application|infrastructure)' },
    },
    {
      name: 'platform-is-a-leaf',
      severity: 'error',
      comment:
        'Platform code (database client, env, logging) is infrastructure shared by modules. ' +
        'It must not depend on any module, or the shared foundation becomes coupled to one ' +
        'context\'s business rules.',
      from: { path: '^src/platform' },
      to: { path: '^src/modules' },
    },
    {
      name: 'kernel-depends-on-nothing',
      severity: 'error',
      comment:
        'The shared kernel is imported by everything, so it must import nothing of ours. ' +
        'Anything it depended on would become a transitive dependency of the whole system.',
      from: { path: '^src/shared/kernel' },
      to: { path: '^src/(modules|platform|app|shared/(ui|lib))' },
    },
    {
      name: 'no-circular',
      severity: 'error',
      comment:
        'A cycle means the two files are really one unit that has been split arbitrarily. ' +
        'Merge them or extract the shared part.',
      from: {},
      to: { circular: true },
    },
    {
      name: 'no-orphans',
      severity: 'warn',
      comment: 'Unreachable file — either wire it up or delete it.',
      from: {
        orphan: true,
        pathNot: [
          '\\.d\\.ts$',
          '(^|/)\\.[^/]+\\.(js|cjs|mjs|ts)$',
          '(^|/)tsconfig\\.json$',
          '^src/app/',
          '^src/instrumentation\\.ts$',
        ],
      },
      to: {},
    },
  ],

  options: {
    doNotFollow: { path: 'node_modules' },
    exclude: {
      path: [
        'node_modules',
        '\\.test\\.ts$',
        '__tests__',
      ],
    },
    tsPreCompilationDeps: true,
    tsConfig: { fileName: 'tsconfig.json' },
    enhancedResolveOptions: {
      exportsFields: ['exports'],
      conditionNames: ['import', 'require', 'node', 'default', 'types'],
      extensions: ['.js', '.jsx', '.ts', '.tsx'],
    },
    reporterOptions: {
      text: { highlightFocused: true },
    },
  },
};
