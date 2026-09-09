/**
 * A no-op stand-in for the `server-only` package under test.
 *
 * That package ships two entry points: a real one selected by the `react-server`
 * export condition, and a stub that throws so a Client Component importing server
 * code fails loudly at build time. Vitest resolves the throwing one, which would
 * make every use case untestable.
 *
 * Aliasing it here keeps the guard doing its job in the Next build — which is the
 * only place it matters — while letting the tests import the modules it protects.
 */
export {};
