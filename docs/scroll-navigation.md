# Documentation scrolling

The document and navigation rails have different scroll ownership. Reading or
navigating the document must not reposition a sidebar the reader has scrolled.

## Browser contracts

- Native fragment links already reveal and scroll to their target. Do not combine
  their default action with an additional scroll in click, hash or render handlers.
  [HTML fragment navigation](https://html.spec.whatwg.org/multipage/browsing-the-web.html#scroll-to-the-fragment)
- `pushState` changes history without native fragment navigation or `hashchange`.
  Back/Forward traversal is separate; browser position restoration can occur after
  `popstate`. Keep a single scroll owner for each navigation.
  [History API](https://developer.mozilla.org/en-US/docs/Web/API/History/pushState),
  [traversal ordering](https://developer.mozilla.org/en-US/docs/Web/API/Window/popstate_event#when_popstate_is_sent)
- `scrollIntoView` defaults to all scrollable ancestors, including the viewport.
  `block: 'nearest'` minimizes movement but does not restrict its container.
  [CSSOM View](https://drafts.csswg.org/cssom-view/#scroll-a-target-into-view)
- Focus scrolls by default. When navigation already owns positioning, use
  `focus({ preventScroll: true })` to avoid a second movement.
  [HTMLElement.focus](https://developer.mozilla.org/en-US/docs/Web/API/HTMLElement/focus)
- `overscroll-behavior` controls wheel/touch chaining at a scroll boundary, not
  anchor or imperative scrolling. `overflow-anchor: none` disables layout-shift
  compensation; it is not a general cure for navigation bugs.
  [CSS Overscroll](https://drafts.csswg.org/css-overscroll-1/),
  [scroll anchoring](https://developer.mozilla.org/en-US/docs/Web/CSS/overflow-anchor)

## Implementation constraints

Keep the sidebar's DOM identity and scroll container stable between routes.
Selection updates must not automatically scroll the selected link into view.
[React subtree identity](https://react.dev/learn/preserving-and-resetting-state)

The document keeps a normal-width native scrollbar. Navigation rails use thin
native bars with the chrome's muted text color and a transparent track. The
document's scrollbar color stops inheriting at `body`, so example components
retain their own scrollbar styling. Coarse pointers and forced colors restore
native rail sizing; forced colors also restores native colors. No bars are hidden
on hover or focus changes, and overlay visibility remains browser/OS-controlled.
[CSS scrollbar sizing](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-width),
[scrollbar colors](https://developer.mozilla.org/en-US/docs/Web/CSS/Reference/Properties/scrollbar-color)

Desktop rail boundaries allow native wheel chaining to the document. A rail that
fits must not trap the wheel. The narrow-screen overlay menu keeps containment.
This follows MUI's document-plus-native-rails structure and desktop chaining,
without copying its active-item scroll reveal. MUI uses thin bars, not contextual
hover-only visibility.
[MUI navigation](https://github.com/mui/material-ui/blob/b8d5b87532f15e2ccdb3e36f7d8c98eadeda6ff6/packages-internal/core-docs/src/AppLayout/navigation/AppNavDrawer.tsx#L440-L478),
[MUI page outline](https://github.com/mui/material-ui/blob/b8d5b87532f15e2ccdb3e36f7d8c98eadeda6ff6/packages-internal/core-docs/src/TableOfContents/AppTableOfContents.tsx#L14-L44)

Section and API-part jumps are immediate. They focus the destination with
`preventScroll` before positioning it once, so keyboard scrolling belongs to the
document. There is no smooth-scroll animation to compete with wheel input and no
delayed correction to pull the reader back. Page changes reset and focus the new
document once before paint, without resetting the persistent navigation. A
same-page story query leaves focus to its destination, not the router's main element.

Apply sticky-header clearance once, using the document's CSS scroll padding;
do not also add the same offset as a heading scroll margin. Resolve a pending asynchronous
anchor when its target mounts, once per navigation, rather than correcting the
reader's position on each resize or unrelated render. A layout effect can run after
commit and before repaint, but does not make future asynchronous layout stable.
[Scroll alignment](https://developer.mozilla.org/en-US/docs/Web/API/Element/scrollIntoView#controlling_topbottom_alignment),
[React layout effects](https://react.dev/reference/react/useLayoutEffect)

Browser regression coverage must measure window and sidebar positions separately:
TOC clicks, ordinary controls, route changes, direct fragments, delayed content,
keyboard navigation and Back/Forward. A sibling rail moving with the viewport is
different from its own scroll position being changed.

Run the browser check against a running docs site from a directory that resolves
Playwright, like the reference consumer's Storybook app:

```sh
node /path/to/react-storydocs/scripts/check-navigation.mjs http://localhost:4346
node /path/to/react-storydocs/scripts/check-navigation.mjs http://localhost:4346 --widths 1440 --height 600
```

The check enables native scrollbar painting, verifies themed and forced-color
styles, and exercises rail interiors, boundaries and fitting outlines separately.
