# Configuration reference

The consumer contract is `StorybookDocsConfig` in `src/config.ts`. Export a plain
object from `docs.config.mjs` and pass it to `storybookDocs({ config })` in Vite.
Only `site` and `stories` are required. Defaults below describe the current engine,
not values copied from the reference consumer.

## Site and stories

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `site` | object | Required | Branding and header content. |
| `site.title` | `string` | Required | Header brand and overview heading. |
| `site.mark` | `string` | First character of `site.title`, uppercased | Header mark. |
| `site.tagline` | `string` | Built-in paragraph about generated documentation | Overview introduction. |
| `site.links` | `Array<{ label: string; href: string }>` | `[]` | Header links. `label` is the visible text; `href` is the destination; both are required per item. |
| `stories` | object | Required | Story discovery source. |
| `stories.from` | `string` | Required | Installed package name, absolute directory, or relative directory holding story sources. |
| `stories.pattern` | `string` | Required | Glob relative to the story root, for example `src/components/*/*.stories.tsx`. Matches determine navigation, examples and API tables. |

Package roots are resolved by walking up from the consumer root for
`node_modules/<package>`. Relative paths resolve against the Vite project root
(normally the directory containing the config), not the engine's directory.
The plugin option `root?: string` overrides that consumer root; it is not a
`StorybookDocsConfig` key. Keep the config and Vite root together, or set `root`
explicitly. Published packages must include their story sources, or
`stories.from` must point at a checkout. The scanner supports `*` within one path
segment and `**` across directories.

### Authored documentation already in the stories

The following authored documentation parameters are rendered without a second copy of the prose:

| Storybook parameter | Where it appears |
| --- | --- |
| `parameters.docs.description.component` | Page introduction under the title; defaults to the root component's JSDoc. |
| `parameters.docs.description.story` | Blurb on that story's example. |
| `parameters.docs.usage` | Usage section, rendered as Markdown (headings, lists, tables, callouts) above the examples. |
| `parameters.docs.sections` | Meta-only ordered list of `{ title, stories: string[] }` sections using story export names. Only listed docs-visible examples render. |
| `parameters.docs.source.code` | The example's Code panel instead of generated example code. |
| `parameters.docs.source.language` | Language id handed to the consumer's code renderer; the derived snippet is `tsx`. |
| `tags: ['!autodocs']` | Story is left off docs pages, as in Storybook. Meta and story tags both apply. |

Meta parameters apply to every story; a story's own parameters win.

Author sections on the story meta:

```ts
parameters: {
  docs: {
    sections: [
      { title: 'Basic', stories: ['Default', 'Variant'] },
      { title: 'Behavior', stories: ['Controlled'] },
    ],
  },
}
```

The first listed docs-visible story is featured above Usage and removed from its section.
Unknown names, `!autodocs` stories and duplicate names are ignored; the first occurrence wins.
Empty sections (including a section containing only the featured story) have no heading.
An explicit empty array renders no examples. Without `docs.sections`, the existing heuristic
featured selection and story-name buckets apply. A non-array `docs.sections` also falls back to
heuristics; malformed entries or entries without an array of stories are skipped.
Usage appears only when `docs.usage` is authored;
there is no page-level story snippet. Each example retains its own Code panel.

### API section

After the examples, API renders the component import from `stories.from` (when non-empty), then
one named H3 per component table: root first, followed by compound parts. Tables list only own
props, never inherited DOM attributes. Inherited catalog contracts get a short linked line
("Also accepts the props of Surface"). Known native elements get an attributes line; otherwise
external inherited contracts are summarized by name without a table. `ComponentPropsDoc.native`
is inferred from the props' ref element type or React `ComponentPropsWithRef<'tag'>` /
`ComponentProps<'tag'>` aliases, and omitted when ambiguous. Pages without docgen use their
`argTypes` table instead. Stories-only pages with no API data omit the API section entirely.
The import code block is labelled Import, separately from example source code.

`ComponentPropsDoc.description?: string` contains the component symbol's JSDoc, including each
compound part symbol. The root description supplies the page introduction unless overridden by
`docs.description.component`; part descriptions appear under their API heading. Parts attached
with `Object.assign(Root, { Content: ContentFunction })` read the target function's JSDoc,
including imported aliases.

Slots merges members of `slotProps`, then `slots`, across all component tables. Each key appears
once, root first and other keys alphabetical, with its `data-ui` token, default component or
element, and description. Defaults matching an API part scroll to that heading without changing
the route hash, respecting reduced motion; other catalog defaults link to their component page. Also uses links to catalog
components value-imported by this component. Empty Slots and Also uses headings are omitted.
The page rail includes API and its H3 headings; there is no separate in-page index.

### Rendering code with the design system's own block

Code renders in the engine's plain block unless the consumer names a renderer:

```js
export default {
  // …
  code: { module: './src/code.tsx' },
};
```

```tsx
// src/code.tsx — the module's default export receives { code, language, label }.
// `label` is optional and names the panel for assistive tech; forward it to your renderer
// (a design system's code block usually takes a `label`) so a page with many examples does not
// expose several landmarks with the same name.
import { CodeBlock } from '@acme/ui';
import { loadShikiHighlight } from '@acme/ui/code-block/shiki';

export default function Code({ code, language }: { code: string; language?: string }) {
  return <CodeBlock code={code} language={language} highlight={loadShikiHighlight} copyable />;
}
```

The same renderer is used for the API import, every example's Code panel and every fenced block
in authored Markdown. A design system that highlights code opt-in per component (a `highlight`
loader, as Storybook does) wires it here once for the whole docs site. If the renderer throws, that
block falls back to plain text rather than failing the page.

### Composition panel

An optional consumer module renders extra component-page content after guidance and before the
story sections. Libraries without the key see no panel.

```js
composition: { module: './src/composition.tsx' },
```

The default export receives `{ entry, components, uses }`. `entry` is `{ slug, name, group }`.
`components` is the props tables, or `null` while they load. A prop or member may include
`component: { name, slug }` when its type declaration belongs to another catalog component.
`uses` lists other catalog components value-imported from this component's source. The engine
renders Slots and Also uses itself; this panel remains available for additional consumer content. If the module throws, the page
continues without the panel.

## Groups

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `groups` | object | Omitted | Optional ordering and display-name changes. |
| `groups.order` | `string[]` | See below | Places named groups first, in this order. Unlisted groups follow; components within a group sort by name. |
| `groups.rename` | `Record<string, string>` | `{}` | Maps authored group names to display names before sorting. Use renamed names in `order`. |

Default order: `Getting started`, `Foundations`, `Actions`, `Forms`, `Inputs`,
`Data display`, `Feedback`, `Navigation`, `Surfaces`, `Pickers`, `Layout`,
`Content`, `Components`. Passing `[]` disables this preferred order.
Groups and component names come from story meta titles such as `Inputs/Button`;
there is no separate component registry.

## Theme

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `theme` | object | Omitted | Optional bridge from docs chrome to consumer theme. |
| `theme.attribute` | `string` | `'data-theme'` | Attribute set on `document.documentElement` by the theme toggle. |
| `theme.values` | `[string, string]` | `['dark', 'light']` | Initial and alternate theme attribute values, also used as toggle labels. |
| `theme.vars` | `Partial<Record<ThemeRole, string>>` | `{}` | CSS values assigned to the engine's semantic roles. Unmapped roles keep the defaults in `src/styles.css`. |

Each value is a complete CSS value, typically `var(--acme-bg)`, not a bare custom
property name. These are all supported `ThemeRole` keys (each is an optional
`string`, with the corresponding stylesheet role as its fallback):

| Key | CSS property | Role |
| --- | --- | --- |
| `theme.vars.bg` | `--sd-bg` | Page background. |
| `theme.vars.surface` | `--sd-surface` | Cards and panels. |
| `theme.vars.surfaceRaised` | `--sd-surface-raised` | Raised surfaces. |
| `theme.vars.surfaceHover` | `--sd-surface-hover` | Hovered surfaces. |
| `theme.vars.border` | `--sd-border` | Standard boundaries. |
| `theme.vars.borderSubtle` | `--sd-border-subtle` | Subtle separators. |
| `theme.vars.text` | `--sd-text` | Primary text. |
| `theme.vars.textMuted` | `--sd-text-muted` | Secondary text. |
| `theme.vars.textSubtle` | `--sd-text-subtle` | Low-emphasis text. |
| `theme.vars.accent` | `--sd-accent` | Accent surfaces and decoration. |
| `theme.vars.accentText` | `--sd-accent-text` | Accent text. |
| `theme.vars.accentSoft` | `--sd-accent-soft` | Subdued accent surfaces. |
| `theme.vars.accentContrast` | `--sd-accent-contrast` | Text on accent surfaces. |
| `theme.vars.danger` | `--sd-danger` | Error boundaries and tinted callouts. |
| `theme.vars.dangerText` | `--sd-danger-text` | Danger **text**; use a tone that passes 4.5:1 on your surface (axe checks it). |
| `theme.vars.focusRing` | `--sd-focus-ring` | Keyboard focus outlines. |

## Tokens and guidance

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `tokens` | object | Omitted | Enables Foundations navigation. Without it the virtual token object is `{}`. |
| `tokens.varsModule` | `string` | Required when `tokens` is supplied | Module specifier exporting the token object. |
| `tokens.varsExport` | `string` | `'vars'` | Named export to read from that module. |
| `tokens.css` | `string[]` | `[]` | CSS module specifiers imported globally, in order, after engine styles. |
| `guidance` | object | Omitted | Optional Markdown prose; without it no authored content loads. Component pages can still show their built-in placeholder. |
| `guidance.dir` | `string` | Required when `guidance` is supplied | Directory resolved against the consumer root. Files named `<component-slug>.md` render on that component's page; `index.md` renders on the overview. A missing directory or file loads no authored content. |

Foundations read string-valued maps from the exported token object: `color`;
`font`, `fontWeight`, `textSize`; `space`, `radius`, `size`; and `shadow`,
`motion.duration`, `motion.ease` (or `motion.easing`). Values can be CSS variable
references. Missing maps produce empty sections, not a crash. Guidance is authored
Markdown rendered with `marked`; there is no built-in prose editor.

## Page switches

| Key | Type | Default | Effect |
| --- | --- | --- | --- |
| `pages` | object | Omitted | Optional switches. |
| `pages.overview` | `boolean` | `true` | Exposed in page settings; currently the shell still shows the overview link and fallback route when `false`. |
| `pages.color` | `boolean` | `true` with tokens, otherwise `false` | Shows Color in Foundations navigation. |
| `pages.typography` | `boolean` | `true` with tokens, otherwise `false` | Shows Typography in Foundations navigation. |
| `pages.spacing` | `boolean` | `true` with tokens, otherwise `false` | Shows Spacing & shape in Foundations navigation. |
| `pages.effects` | `boolean` | `true` with tokens, otherwise `false` | Shows Elevation & motion in Foundations navigation. |
| `pages.api` | `boolean` | `true` | Exposed in page settings; currently component pages still show API tables when `false`. |

Setting a Foundations switch to `true` does not enable it without
`tokens.varsModule`. These switches hide navigation entries, not direct routes.

## Add your design system in five minutes

Use a docs app with React, React DOM, Vite, `@vitejs/plugin-react`, this engine,
and your design system installed. Add these four files, matching the README's
consumer contract:

1. **`docs.config.mjs`** — point at the story sources:

   ```js
   export default {
     site: { title: 'acme/ui', mark: 'a' },
     stories: { from: '@acme/ui', pattern: 'src/components/*/*.stories.tsx' },
     // Optional: tokens: { varsModule: '@acme/tokens/vars', css: ['@acme/tokens/tokens.css'] },
     // Optional: guidance: { dir: './guidance' },
   };
   ```

2. **`vite.config.ts`** — register the engine and React plugins:

   ```ts
   import react from '@vitejs/plugin-react';
   import { defineConfig } from 'vite';
   import { storybookDocs } from '@jfrader/storybook-docs/vite';
   import config from './docs.config.mjs';

   export default defineConfig({ plugins: [storybookDocs({ config }), react()] });
   ```

3. **`index.html`** — mount the app:

   ```html
   <!doctype html>
   <html lang="en">
     <head><meta charset="UTF-8"><title>acme/ui docs</title></head>
     <body><div id="root"></div><script type="module" src="/src/main.tsx"></script></body>
   </html>
   ```

4. **`src/main.tsx`** — start the engine:

   ```ts
   import { start } from '@jfrader/storybook-docs';
   start();
   ```

Run `pnpm exec vite` in the docs app. Match your stories' JSX runtime and install
their imports in the consumer. The reference consumer is `examples/jfrader-ui`.

### When the design system is linked rather than installed

Stories are rendered from the design system's own files, so its imports resolve
next to those files, not next to your app. Three things follow, and all three
show up as stories that render wrong rather than as errors:

- **Dedupe the styling runtime.** If the design system ships its own copy of
  Emotion, styled-components or similar, a story that provides a cache or reads
  a context sees a different instance than the components do. Add the runtime to
  `resolve.dedupe` in the consumer so it resolves from your app.
- **Provide optional peers.** A story may import a package the design system
  treats as optional (its own Storybook installs it, your app does not). Install
  it in the consumer and dedupe it too; an unresolved import fails the whole
  story module, not just the story.
- **Generate the design system's CSS.** Token CSS is usually generated and
  gitignored, so a linked checkout can hold a build from before your tokens
  changed. Regenerate it before `vite` (`pnpm --dir <design-system>/packages/tokens
  generate` in the reference setup). A stale file loses variables silently:
  every component that sizes itself from a token collapses to zero.

## Known limits

- Compound parts hidden from docgen (including `Object.assign` compounds and
  `Dialog.Content = …`) rely on exported `*Props` types. Parts without exported
  props types remain invisible.
- Meta and story args, globals, argTypes and parameters are composed with story-level precedence.
  Parameters and argTypes merge recursively; arrays replace rather than concatenate.
  Explicit args win over deprecated argType defaults. Docgen defaults describe controls only;
  they are not evaluated or passed into the component. Render functions receive the composed
  context, and decorators can call `Story({ args })` to override arguments.
- Controls support boolean, number, text/string, select, radio/inline-radio (as a select),
  range and object (JSON, applied on blur). ArgType mappings apply to rendered arguments.
  Custom renders accept controls too. Check/inline-check, multi-select, color, date and file
  editors are not provided; their authored args still render unchanged.
- Story `name` supplies the example heading; export names remain the stable identifiers.
  `!dev` and `!test` affect Storybook's sidebar/test runner, not this docs front.
  Custom tags have no filtering effect here. `!autodocs` hides docs examples.
- Meta and story decorators are applied in Storybook's order. Project-level
  decorators from `.storybook/preview` are not recreated: theme, global styles
  and layout come from the docs config instead. A story that throws shows its
  error in place rather than disappearing.
- Play functions and accessibility checks do not run here. Loaders and beforeEach hooks
  are not executed: test hooks can modify clocks, preferences and shared browser state,
  which cannot safely be isolated across simultaneous examples. Affected frames show a notice.
  Loader-dependent examples may not render correctly. Project globals/initialGlobals and
  Storybook-specific context APIs (hooks, canvas, mount, step) are not recreated.
  Addon parameters such as viewport and backgrounds are not applied; viewport frames show
  a notice. Layout supports centered, padded and fullscreen (an unpadded docs frame,
  not a separate viewport-sized canvas).
- Search scans the in-memory catalog's component, group and story names. There is
  no generated full-text search index for guidance, props or rendered content.

### Checking a running site

The engine ships a frame check for the thing unit tests cannot see: whether the examples a docs site
renders are actually right. From a directory where `playwright` resolves:

```bash
node scripts/check-example-frames.mjs http://localhost:4320 [--json report.json]
```

It reports stories that fail to render (including modules that never loaded), content painted outside
its frame, zero-size interactive controls, and component roots that collapsed to nothing. Invisible
helpers — measure probes, closed dialogs, top-layer overlays, aria-hidden duplicates — are ignored, so
findings are real. Exit code is 1 when a component has a finding.

## Verification and CI

From the engine root, run `pnpm test`, `pnpm typecheck` (engine and tests), and
`pnpm build` (the reference consumer). The reference consumer's link dependencies
expect a sibling `jfrader-ui` checkout, with UI dependencies installed and token
CSS generated: run `pnpm --filter @jfrader/ui... install --frozen-lockfile --prefer-offline`
then `pnpm --filter @jfrader/tokens generate` in that checkout, and
`pnpm --dir examples/jfrader-ui install --frozen-lockfile --prefer-offline` in the
engine checkout.

CI runs on pushes and pull requests targeting `master`. It uses Node 22.23.3 (the
`engines.node` minimum major), the root's pinned `pnpm@10.12.1`, cached package
downloads and frozen, prefer-offline installs. It tests and typechecks before
checking out the reference design system at
`c990db09c143a183f5666d404c35cf2fe324cf9d`, installing its UI/token dependencies,
generating tokens, installing the consumer and running the build.

Set the repository secret `REFERENCE_UI_TOKEN` to a token with read-only contents
access to `jfrader/jfrader-ui`. Checkout does not persist its credentials.
Fork PRs do not receive this secret and fail the credential check; verify them on
a trusted branch instead. CI never uses `pull_request_target` to run PR code with
elevated permissions.
