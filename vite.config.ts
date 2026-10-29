import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Panda's generated code; must match tsconfig `paths`.
    alias: { 'styled-system': decodeURIComponent(new URL('./styled-system', import.meta.url).pathname) },
  },
  // Only imported lazily (SQLite, DBML), so the dev server would otherwise discover it mid-session, re-optimize and reload the page.
  optimizeDeps: { include: ['sql.js', '@dbml/parse'] },
  // Fixed port: settings live in localStorage, which is per-origin (host + port).
  server: { port: 5173, strictPort: true },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
    coverage: {
      provider: 'v8',
      // Unit tests cover the pure modules; React components, hooks and the theme are Cypress's job,
      // so counting them would only make the floor meaningless.
      include: ['src/**/*.ts'],
      exclude: ['src/**/*.test.ts', 'src/**/use*.ts', 'src/editor/hooks/**', 'src/design-system/**'],
      reporter: ['text-summary'],
      // A floor, not a target: about 3 points under coverage on 2026-10-28, so a slide fails CI
      // but nobody writes tests to chase the number. No autoUpdate, which would ratchet it.
      thresholds: { statements: 78, branches: 72, functions: 77, lines: 80 },
    },
  },
});
