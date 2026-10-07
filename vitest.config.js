import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'happy-dom',
    include: ['tests/unit/**/*.test.js', 'tests/security/**/*.test.js'],
    passWithNoTests: true,
  },
});
