import tseslint from 'typescript-eslint';

export default tseslint.config(
  { ignores: ['dist/', 'coverage/', 'node_modules/', 'playwright-report/', 'test-results/'] },
  ...tseslint.configs.strict,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': ['error', { argsIgnorePattern: '^_' }],
    },
  },
  {
    // Determinism rule (PLAN §1.5): no wall-clock or unseeded randomness in the simulation.
    files: ['src/sim/**/*.ts'],
    rules: {
      'no-restricted-properties': [
        'error',
        { object: 'Math', property: 'random', message: 'Use the seeded RNG (core/rng.ts).' },
        { object: 'Date', property: 'now', message: 'Use the tick counter.' },
        { object: 'performance', property: 'now', message: 'Use the tick counter.' },
      ],
    },
  },
);
