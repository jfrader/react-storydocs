import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { storybookDocs } from '@jfrader/storybook-docs/vite';
import config from './docs.config.mjs';

export default defineConfig({
  plugins: [
    storybookDocs({ config }),
    react(),
  ],
  server: { port: 4334, strictPort: true },
});
