# Changelog

## Unreleased

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
