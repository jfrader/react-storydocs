import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { storybookDocs } from '@jfrader/storybook-docs/vite';
import config from './docs.config.mjs';

export default defineConfig({
  plugins: [
    storybookDocs({ config }),
    // The stories under documentation are authored with Emotion's `css` prop, so they
    // compile through Emotion's runtime here too — the same setting Storybook uses.
    react({ jsxImportSource: '@emotion/react' }),
  ],
  server: { port: 4310 },
});
