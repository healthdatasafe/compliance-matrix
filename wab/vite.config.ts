import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react-swc';
import tailwindcss from '@tailwindcss/vite';
import path from 'node:path';
import backloop from 'vite-plugin-backloop.dev';

// https://vitejs.dev/config/
export default defineConfig(({ mode }) => {
  const config: any = {
    // Relative base so the same build works at GH-Pages root, sub-path, or custom domain.
    base: './',
    envPrefix: ['VITE_'],
    server: {
      host: '::',
      port: 8095
    },
    plugins: [
      react(),
      tailwindcss()
    ],
    resolve: {
      alias: {
        '@': path.resolve(__dirname, './src')
      }
    },
    assetsInclude: ['**/*.wasm', '**/*.sqlite'],
    build: {
      // dist/ is checked out as the gh-pages branch (see scripts/setup.sh).
      // Vite must not wipe dist/.git on each build, so we keep emptyOutDir
      // false and clean stale assets manually in scripts/upload.sh.
      emptyOutDir: false
    }
  };
  // Enable backloop.dev (HTTPS + proper hostname) by default in dev mode.
  // Use `npm run dev:raw` to bypass it (plain http://localhost).
  if (mode !== 'raw') {
    config.plugins.push(backloop('compliance-matrix'));
  }
  return {
    ...config,
    test: {
      globals: true,
      environment: 'jsdom'
    }
  };
});
