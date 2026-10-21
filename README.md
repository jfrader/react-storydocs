# @jfrader/react-storydocs

A documentation front for **React design systems that use Storybook**. Point it at a set of
story files; it generates the navigation, renders docs-visible stories in place, and builds API
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
| Sidebar, groups, slugs | each story module's `title` (scoped to the `meta` object, so fixtures never leak in) |
| Search (⌘K) | the catalog, scored over component, group and story names |
| Examples (inline, in sections) | the story module itself — meta `component` + merged `args`, or the story's `render` |
| Example sections | authored `parameters.docs.sections`, or story-name buckets when absent |
| Props tables (one per component and part, with native-element notes and an inherited-props disclosure) | the component sources — `react-docgen-typescript` for components, the TypeScript compiler API for exported `*Props` types (where compound parts live) |
| Usage | authored `parameters.docs.usage` Markdown only |
| API | component import, root and part descriptions and props, merged slots and related components |
| Per-example toolbar: inline code, Copy code, Copy link, and full-screen story | authored source or code derived from the story's render and merged args; links use the component slug and story export key |
| Authored guidance per component | Markdown files in the configured guidance directories, with `> Do —` / `> Don't —` blockquotes rendered as do/don't cards — the part stories cannot generate |
| Foundations: Color, Typography, Spacing & shape, Elevation & motion | your token module (optional) |
| Docs chrome theme | your CSS custom properties (optional) |

Standalone stories use `#/stories/<component-slug>/<story-export-key>`, with both segments URL-encoded.
The full-screen action opens that route in a new tab, without docs navigation, with width presets and
the theme toggle. `#/components/<slug>?story=<story>` links still open the component page at that story.

Known limits: compound parts declared as property assignments (`Dialog.Content = …`) are picked up
through their exported `*Props` types; parts with no exported props type stay invisible. Stories that
need project-level providers can share decorators through `decorators.module`; `.storybook/preview`
is not imported automatically. Unhandled render errors fail soft in each story frame. Play functions
and a11y checks stay in Storybook — this front is for reading and browsing.

CSF3 objects and CSF2 function stories are supported, including bound templates with args and
decorators. Nested titles use the last segment as the component name and the preceding segments as
its group (`Form/Fields/InputField` is `InputField` under `Form/Fields`). Props use co-located
component sources first; when the story folder has no sources, the engine follows the imported
`meta.component` to its source folder, including barrel re-exports. Inherited props stay available
in a disclosure, grouped by contract instead of one 300-row table. `useDocsTheme()` from
`@jfrader/react-storydocs/theme` lets a React provider follow the docs toggle without a DOM observer.

## What it looks like

| | |
| --- | --- |
| ![Overview: browse-by-area directory](docs/images/overview.png) | ![Search with highlighted matches and story-level results](docs/images/search.png) |
| The overview: stat tiles, then a card per area with counts and links into every component. | ⌘K search: matches highlighted, story hits listed as `Component › Story`. |
| ![A component page with examples and their controls](docs/images/component.png) | ![Authored guidance with Do and Don't callouts](docs/images/guidance.png) |
| Every story renders in place, bucketed into sections, with live controls and toolbar actions for inline code, Copy code, Copy link, and a standalone story view. | Authored Markdown becomes typed React blocks: Do/Don't cards, tables, code with language. |
| ![The releases page and version chip](docs/images/releases.png) | ![Foundations: spacing scale and radii from the token source](docs/images/foundations.png) |
| Releases: the changelog rendered in place, with the current version read from the package. | Foundations: colour, type, spacing/shape and elevation/motion, all from the token module. |

## The reference consumer

`examples/fixtures/` is a second, synthetic design system (Acme UI) used by the scanner tests and by CI
as the build gate that needs no credentials — it proves the engine is not shaped around jfrader/ui.
`examples/jfrader-ui/` is the real one; its `link:` paths resolve against the main clone layout, so a
git worktree copy needs those symlinks repointed locally (see its `node_modules/@jfrader` entries).

## Development

```bash
pnpm install
pnpm test                 # engine unit tests (glob, title extraction, sections, snippets)
pnpm --dir examples/fixtures install
pnpm --dir examples/fixtures dev # the synthetic consumer (port 4334)
```

To check what a running docs site actually renders, point the frame check at it. It visits every
component page, mounts the lazy frames, and reports stories that fail to render, content painted
outside its frame, zero-size controls and components that collapsed to nothing — the check that
caught a component rendering at 0×0 with its own tests green. It needs Playwright, so run it from a
directory where that resolves (normally your Storybook app):

```bash
node scripts/check-example-frames.mjs http://localhost:4320 [--json report.json]
```

It exits non-zero when a component has a real finding, so it can gate CI. Zero-size component roots
are reported as notes: an empty group or a progress bar at zero is legitimate.

## Use it

```bash
pnpm add react@^19 react-dom@^19
pnpm add -D @jfrader/react-storydocs vite @vitejs/plugin-react @types/node @types/react @types/react-dom
```

Use Node 22.12 or newer (maintainer tests need Node 22.18 or newer). React 19 and Vite 6, 7 or 8
are peers supplied by the consumer. Published packages and linked checkouts both expose built
JavaScript and types (`dist/`); run `pnpm build:package` after editing a linked engine checkout.
The browser entry imports its CSS automatically; no stylesheet subpath or manual `virtual.d.ts`
reference is needed. Importing the root entry also loads the virtual-module declarations.

Maintainers can run `pnpm smoke:package` to pack, install and typecheck/build an isolated minimal
consumer without links or private dependencies. See [release instructions](docs/RELEASING.md).

The consumer contract is four files:

```js
// docs.config.mjs
export default {
  site: { title: 'acme/ui', mark: 'a', links: [{ label: 'GitHub', href: '…' }] },
  stories: { from: '@acme/ui', pattern: 'src/components/*/*.stories.tsx', importFrom: '@acme/ui' }, // importFrom is optional
  decorators: { module: './src/decorators.tsx' }, // optional default-export decorator or array
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
import { reactStorydocs } from '@jfrader/react-storydocs/vite';
import config from './docs.config.mjs';

export default defineConfig({ plugins: [reactStorydocs({ config }), react()] });
```

```html
<!-- index.html -->
<div id="root"></div><script type="module" src="/src/main.tsx"></script>
```

```ts
// src/main.tsx
import { start } from '@jfrader/react-storydocs';
start();
```

## Notes and limits

- The plugin scans the resolved package directory and imports story files by absolute
  path, so it works with workspace links and does not require the design system to publish
  its stories or expose extra package exports.
- If the design system is consumed from a published tarball that only ships built files,
  point `stories.from` at a checkout (or publish the story sources) — the tool reads
  source modules by design, because that is what Storybook renders.
- Mounting under a sub-path: set `window.__REACT_STORYDOCS_BASE__ = '/docs'` before `start()`.
- Not included yet: versioned docs, prose authoring, adoption analytics. All of
  them are free/OSS additions once the shape earns them.
