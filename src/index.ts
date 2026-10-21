// Browser entry. The Vite plugin lives on its own subpath (`@jfrader/react-storydocs/vite`)
// because it is Node-only — importing it from here would pull `node:fs` into the client bundle.
export { start } from './start.js';
export { ComponentDemo, type ComponentDemoProps } from './component-demo.js';
export type { ReactStorydocsConfig, CatalogEntry, ThemeRole } from './config.js';
