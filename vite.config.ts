import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  resolve: {
    // Panda's generated code; must match tsconfig `paths`.
    alias: { 'styled-system': decodeURIComponent(new URL('./styled-system', import.meta.url).pathname) },
  },
  // Fixed port: settings live in localStorage, which is per-origin (host + port).
  server: { port: 5173, strictPort: true },
});
