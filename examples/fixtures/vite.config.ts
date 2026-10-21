import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { reactStorydocs } from '@jfrader/react-storydocs/vite';
import config from './docs.config.mjs';

export default defineConfig({
  plugins: [
    reactStorydocs({ config }),
    react(),
  ],
  server: { port: 4334, strictPort: true },
});
