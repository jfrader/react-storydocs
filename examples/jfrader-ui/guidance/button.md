## Guidance

> ✅ **Do** — one primary action per surface: `variant="solid"` with `tone="accent"`. Everything else
> drops to `soft` or `ghost` so the hierarchy stays readable.
>
> ⛔ **Don't** — swap the label to “Loading…” while work happens. Pass `loading`: the control keeps its
> name, its width and its focus, and assistive tech hears the busy state.

### When to use it

- A single, immediate action: submit, save, confirm, open.
- Navigation to another screen, when the target is a page rather than an action.

### When not to

- A row of several equally-weighted choices — that is a `ButtonGroup` or `SegmentedControl`.
- An action attached to a menu — that is a `SplitButton`.
- Anything that destroys data without a confirmation step: pair `tone="danger"` with `Dialog` or
  `HoldToConfirm`.

### Accessibility notes

- Native `<button>`; Enter and Space activate exactly once, including while loading.
- Disabled buttons stay focusable (`aria-disabled`) unless you pass the native `disabled` — a control
  that disappears from the tab order hides the reason it cannot be used.
- Icon-only usage needs an accessible name; never drop the label silently.
