import { defineConfig, type Plugin } from 'vitest/config';
import react from '@vitejs/plugin-react';
import pkg from './package.json' with { type: 'json' };

/**
 * The production CSP lives in index.html and is strict (no inline or remote
 * scripts, no eval). The Vite dev server needs an inline React Refresh preamble
 * and a websocket for HMR, so ONLY while serving (`npm run dev`) the policy is
 * widened to allow exactly that. `vite build` never runs this plugin.
 */
function devServerCsp(): Plugin {
  return {
    name: 'code-editor-dev-csp',
    apply: 'serve',
    transformIndexHtml(html) {
      return html
        .replace("script-src 'self'", "script-src 'self' 'unsafe-inline'")
        .replace("connect-src 'self'", "connect-src 'self' ws://localhost:* ws://127.0.0.1:*");
    },
  };
}

export default defineConfig({
  // Relative base so the built dist/index.html also loads from file:// in the packaged app.
  base: './',
  plugins: [react(), devServerCsp()],
  define: {
    __APP_NAME__: JSON.stringify(pkg.productName),
    __APP_VERSION__: JSON.stringify(pkg.version),
  },
  build: {
    outDir: 'dist',
    emptyOutDir: true,
    sourcemap: false,
  },
  server: {
    host: '127.0.0.1',
    port: 5173,
  },
  test: {
    environment: 'jsdom',
    include: ['src/**/*.test.{ts,tsx}', 'electron/**/*.test.{ts,tsx}'],
    css: false,
  },
});
