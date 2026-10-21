# Changelog

## 0.17.0

- Replace example blocks with StoryFrame: compact accessible actions for inline code, copy link and a standalone story view. The code panel keeps the library's CodeBlock header and copy action, and story descriptions render inline code.
- Add standalone hash-routed stories without docs chrome, with width presets and the shared theme toggle. Existing component story links remain supported.
- Export `StoryFrame` and `StoryFrameProps` in place of `ComponentDemo` and `ComponentDemoProps`.

## 0.16.5

- Nested field expansion now drops external DOM/React members: `ButtonRenderProps` shows `ref`/`data-ui`, `ThreadPartProps` shows `className`/`sx`, instead of hundreds of native fields. This also keeps the full catalog at 1.5 GB and ~111s.

## 0.16.4

- Keep the new member extraction within the production build heap: expand slot contracts and signature parameter objects only when they are small local contracts (≤8 slot fields, ≤5 parameter fields). The full catalog builds under 1.5 GB again while `ThreadPartProps` and `MoneyInputDetails` stay inspectable.

## 0.16.3

- Expand object parameter types in signatures (`details: MoneyInputDetails`, `ThreadPartProps`) and shared local prop contracts, so the API table can inspect named types instead of printing a bare alias.

## 0.16.2

- Expand fields for slot members whose props type is shared inside the design system (for example `ThreadPartProps` on `CommentThread.slotProps.resolved`), without restating another catalog component's props.

## 0.16.1

- Keep the docs build heap bounded on a 2 GB build instance: clear each component's cached prop rows after its virtual module is serialized, build a fresh TypeScript program per component instead of threading the previous one through, and expand array element fields only for selectable collections (`options`, `items`, `rows`, `columns`, tabs, steps, links, series, photos). The full jfrader-ui catalog now builds under a 1.5 GB heap.

## 0.16.0

- Add `api.module`: a consumer component replaces the built-in props and slots tables, receiving `{ components, argTypes, defaultArgs }`. The API heading, Import block and Also uses stay in the engine.
- Extract every overload signature and expose `signature` on props that belong to one shorthand/composed overload, plus `typeParameters` on the component table.
- Add `element` to array props (for example what each `options` entry accepts), strip `NoInfer<…>` from displayed types, and read family defaults from the component folder's binding initializers.

## 0.15.1

- First published version of `@jfrader/react-storydocs`; `0.15.0` could not be reused after npm staged and unpublished it.

## 0.15.0

- Renamed the package and public API to `@jfrader/react-storydocs`: import `reactStorydocs` from `@jfrader/react-storydocs/vite`, use `ReactStorydocsConfig`, `window.__REACT_STORYDOCS_BASE__`, and `virtual:react-storydocs/*`. The published `0.14.x` package is deprecated in favour of this name.

- Documentation scrollbars follow the current theme. Desktop navigation and page outlines use thin native bars, with normal native sizing for touch pointers and high-contrast mode.
- Scrolling over a desktop sidebar continues on the page at its boundary, including when the page outline fits without scrolling.
- Configure global example providers and CSS through `decorators.module`, outside meta/story decorators.
- Render CSF2 function stories with their args and decorators, using export keys for labels.
- Resolve props from imported `meta.component` sources when stories live in a separate folder, including barrel re-exports and nested titles.
- Nested story titles use the last segment as the component name and the preceding segments as the group.
- Import snippets use `stories.importFrom` or the design system's package.json name instead of a checkout path.
- Inherited props stay available in a disclosure under each component's own-props table.
- Inherited props are grouped by declaring contract, with DOM/ARIA groups last.
- Export `useDocsTheme()` from the `./theme` subpath so a React provider can follow the docs theme.
- Add a synthetic MUI fixture (wrapper component, separated story) to the fixture build.
- Overview links prefetch their story module on hover or focus, matching the sidebar and search.
- The docs chrome owns its background and text colour, so a story's global `CssBaseline` cannot repaint the page white in dark mode.
- `start()` adds the viewport meta tag when the host page omits it, so the docs front is responsive on phones without extra host markup.

## 0.14.2

- "On this page" and API-part links jump directly to their destination and move keyboard focus there, without an animation or later correction overriding your scrolling.
- Sidebars scroll independently from the document. The left menu keeps its scroll position and expanded groups when you navigate to another page.
- Section links apply the sticky-header offset once, without a consumer CSS workaround.
- Story links within the current page keep keyboard focus on the selected example.

## 0.14.1

- API tables show native `style` as a type and a short note instead of expanding `CSSProperties` into hundreds of member rows. A generic `style` prop no longer dominates a page with platform MDN tables.

## 0.14.0

- Component pages end with one API section: import, named root and part tables, merged slots and links to components they use. Component JSDoc supplies the introduction and part descriptions.
- Story metas can author `parameters.docs.sections` to select and order examples without heuristic buckets. The first listed visible example is featured once.
- Usage renders only authored `parameters.docs.usage` Markdown. Example Code panels remain available without a duplicate page-level snippet.
- Compound parts attached with `Object.assign` retain their function JSDoc. API tables omit inherited DOM rows in favor of compact catalog/native contract notes, and infer native element names from props. Long inline tokens wrap on mobile; empty stories-only APIs are hidden; malformed authored sections fall back safely.

- Component slot defaults link to their catalog family through type contracts and value defaults, or to the local part's display name.
- Slot and slotProps members expose their default HTML element or component, inferred from their type contracts or the component's default slots map.
- Props and slot maps are expanded for component families whose exports add a suffix to the catalog name, such as `CardFlightsProvider`.
- Slot defaults link only to the component itself or its own props types, not shared part types. Story files with no autodocs-visible examples no longer create empty pages or override component links.

## 0.12.0

- Story sections render as Overview, Variants & sizes, States, Interaction & keyboard, Content & layout, Environments, Edge cases. A name that matches both an environment and a variant still lands in Environments.
- Story canvases mount with the page. The "On this page" rail no longer follows a document that grows as examples load.
- A custom render whose source could not be extracted no longer gets a one-tag snippet from its arguments. The frame says "No usage code for this example."
- `composition.module` renders a consumer panel from the props tables and the other catalog components a component imports. Prop types link to that other component when the declaration belongs to it.
- A slot reports the contract its own component declares (so a panel can list what the part accepts) and the `data-ui` token that component's source gives the part, which names the default it renders.

## 0.11.0

- The demo frame describes skipped setup and viewport in plain words — "Setup not run here. Open it in Storybook.", "Shown at this page's width. Open it in Storybook." — instead of printing the story's hook names, and a story without controls renders no controls panel: `getStoryControls` no longer returns `unavailable`.

## 0.10.0

- Props tables show callback signatures, overloads and documented parameter meanings, with the full contract available in a disclosure.
- Object and slot disclosures preview their fields. Primitive unions no longer show prototype methods as object fields.
- Inherited props link to catalog components whose public contracts contain those declarations; full inherited rows remain available.
- Props columns keep type contracts and notes readable without widening the table on desktop.
