// Browser entry. The Vite plugin lives on its own subpath (`@jfrader/storybook-docs/vite`)
// because it is Node-only — importing it from here would pull `node:fs` into the client bundle.
export { start } from './start.js';
export type { StorybookDocsConfig, CatalogEntry, ThemeRole } from './config.js';
