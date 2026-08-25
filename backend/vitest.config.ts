import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globals: false,
    // Integration tests share one database; running files in parallel would
    // let one file's cleanup delete another file's fixtures.
    fileParallelism: false,
    setupFiles: ['tests/helpers/setup.ts'],
    include: ['tests/**/*.test.ts'],
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
