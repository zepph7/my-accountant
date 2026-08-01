/**
 * @swc/jest rather than ts-jest: ts-jest drives the TypeScript compiler API,
 * and TypeScript 7's native port removed `ts.sys`, so it cannot load. swc
 * transpiles TS directly and is unaffected by the compiler version.
 *
 * Type errors are therefore NOT caught by the test run — `npm run typecheck`
 * owns that, and CI must run both.
 */
module.exports = {
  testEnvironment: 'node',
  roots: ['<rootDir>/tests'],
  testMatch: ['**/*.test.ts'],
  transform: {
    '^.+\\.(t|j)s$': [
      '@swc/jest',
      {
        jsc: {
          parser: { syntax: 'typescript', decorators: false },
          target: 'es2022',
        },
        module: { type: 'commonjs' },
      },
    ],
  },
  collectCoverageFrom: ['src/**/*.ts', '!src/**/*.d.ts', '!src/server.ts'],
  clearMocks: true,
  /**
   * Jest's 5s default is too tight for the integration suite: each auth call
   * costs bcrypt at 12 rounds plus several round trips to a remote Postgres,
   * so a single test can legitimately take 6-8s. This is a ceiling, not a
   * delay — fast tests still finish fast.
   */
  testTimeout: 30_000,
};
