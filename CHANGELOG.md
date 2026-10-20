# Changelog

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
