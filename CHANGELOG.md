# Changelog

## Unreleased

## 0.11.0

- The demo frame describes skipped setup and viewport in plain words — "Setup not run here. Open it in Storybook.", "Shown at this page's width. Open it in Storybook." — instead of printing the story's hook names, and a story without controls renders no controls panel: `getStoryControls` no longer returns `unavailable`.

## 0.10.0

- Props tables show callback signatures, overloads and documented parameter meanings, with the full contract available in a disclosure.
- Object and slot disclosures preview their fields. Primitive unions no longer show prototype methods as object fields.
- Inherited props link to catalog components whose public contracts contain those declarations; full inherited rows remain available.
- Props columns keep type contracts and notes readable without widening the table on desktop.

