
import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    setupFiles: ['./tests/setup.ts'],
    globals: true,
    mockReset: true,
    environment: 'node',
    testTimeout: 30000,
    // Exclude integration scripts that have main() and call process.exit()
    exclude: [
      '**/node_modules/**',
      '**/dist/**',
      // Integration scripts (not Vitest tests)
      '**/browser-rename.test.ts',
      '**/gemini-parser.test.ts',
      '**/gemini-dom-research*.ts',
      '**/gemini-deep-research-dom.ts',
      '**/gemini-open-research-doc.ts',
      '**/docker-*.ts',
      '**/verify-registry-demo.ts',
      '**/test-parser-fix.ts',
      // Script-style tests that don't use Vitest framework
      '**/artifact-registry.test.ts',
      '**/graph-store.test.ts',
      // References dead code (knowledge.ts.disabled)
      '**/knowledge.test.ts',
    ],
    // Run tests in sequence to avoid port conflicts
    pool: 'forks',
    poolOptions: {
      forks: {
        singleFork: true,
      },
    },
  },
});
