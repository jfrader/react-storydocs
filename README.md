# @jfrader/storybook-docs

A documentation front for **any design system that has Storybook**. Point it at a set of
story files; it generates the navigation, renders every story in place, and builds API
tables from the stories' own `argTypes`. There is no second component list anywhere.

```
example/            # a consumer you can copy
  docs.config.mjs   # ← the only place the design system is described
  vite.config.ts    # registers the plugin
  index.html
  src/main.tsx      # six lines
```

## What it does with your stories

| Piece | Source of truth |
| --- | --- |
| Sidebar, groups, slugs | each story module's `title` |
| Examples (all of them, inline) | the story module itself — meta `component` + merged `args`, or the story's `render` |
| API tables | the story meta's `argTypes` + default `args` |
| Foundations pages | your token module (optional) |
| Docs chrome theme | your CSS custom properties (optional) |

Stories that need project-level Storybook decorators fail soft (an error boundary per
story frame) instead of breaking the page. Play functions, controls and a11y checks stay
in Storybook — this front is for reading and browsing.

## Use it

```bash
pnpm install
pnpm --filter <your docs app> dev      # or: vite --config examples/jfrader-ui/vite.config.ts
```

The consumer contract is four files:

```js
// docs.config.mjs
export default {
  site: { title: 'acme/ui', mark: 'a', links: [{ label: 'GitHub', href: '…' }] },
  stories: { from: '@acme/ui', pattern: 'src/components/*/*.stories.tsx' },
  groups: { rename: { Data: 'Data display' }, order: ['Foundations', 'Inputs', 'Components'] },
  theme: {
    attribute: 'data-theme',
    values: ['dark', 'light'],
    vars: { bg: 'var(--acme-bg)', text: 'var(--acme-text)', accent: 'var(--acme-accent)' },
  },
  tokens: { varsModule: '@acme/tokens/vars', varsExport: 'vars', css: ['@acme/tokens/tokens.css'] },
};
```

```ts
// vite.config.ts
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';
import { storybookDocs } from '@jfrader/storybook-docs/vite';
import config from './docs.config.mjs';

export default defineConfig({ plugins: [storybookDocs({ config }), react()] });
```

```html
<!-- index.html -->
<div id="root"></div><script type="module" src="/src/main.tsx"></script>
```

```ts
// src/main.tsx
import { start } from '@jfrader/storybook-docs';
start();
```

## Notes and limits

- The plugin scans the resolved package directory and imports story files by absolute
  path, so it works with workspace links and does not require the design system to publish
  its stories or expose extra package exports.
- If the design system is consumed from a published tarball that only ships built files,
  point `stories.from` at a checkout (or publish the story sources) — the tool reads
  source modules by design, because that is what Storybook renders.
- Mounting under a sub-path: set `window.__STORYBOOK_DOCS_BASE__ = '/docs'` before `start()`.
- Not included yet: search, versioned docs, prose authoring, adoption analytics. All of
  them are free/OSS additions once the shape earns them.
