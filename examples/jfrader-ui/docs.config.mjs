/**
 * The only place this design system is described to the docs engine.
 * Copy this file, point `stories.from` at your package, and the docs front follows.
 */
export default {
  site: {
    title: 'jfrader/ui',
    mark: 'j',
    tagline:
      'Component documentation generated from the library’s own Storybook stories — navigation, examples and API tables all come from the story files.',
    links: [{ label: 'GitHub', href: 'https://github.com/jfrader/jfrader-ui' }],
  },
  stories: {
    from: '@jfrader/ui',
    pattern: 'src/components/*/*.stories.tsx',
  },
  groups: {
    // Authored story titles are left alone; the IA is normalised here.
    rename: { Data: 'Data display', 'Data Display': 'Data display' },
    order: [
      'Foundations',
      'Actions',
      'Forms',
      'Inputs',
      'Data display',
      'Feedback',
      'Navigation',
      'Surfaces',
      'Pickers',
      'Layout',
      'Components',
      'Showcase',
    ],
  },
  theme: {
    attribute: 'data-theme',
    values: ['dark', 'light'],
    vars: {
      bg: 'var(--ui-color-bg)',
      surface: 'var(--ui-color-surface)',
      surfaceRaised: 'var(--ui-color-surface-raised)',
      surfaceHover: 'var(--ui-color-surface-hover)',
      border: 'var(--ui-color-border)',
      borderSubtle: 'var(--ui-color-border-subtle)',
      text: 'var(--ui-color-text)',
      textMuted: 'var(--ui-color-text-muted)',
      textSubtle: 'var(--ui-color-text-subtle)',
      accent: 'var(--ui-color-accent)',
      accentText: 'var(--ui-color-accent-text)',
      accentSoft: 'var(--ui-color-accent-soft)',
      accentContrast: 'var(--ui-color-accent-contrast)',
      danger: 'var(--ui-color-danger)',
      success: 'var(--ui-color-success)',
      focusRing: 'var(--ui-color-focus-ring)',
    },
  },
  tokens: {
    varsModule: '@jfrader/tokens/vars',
    varsExport: 'vars',
    css: ['@jfrader/tokens/tokens.css', '@jfrader/tokens/base.css'],
  },
  guidance: {
    // Markdown files named after components (`button.md`) plus optionally `index.md`.
    // Later directories win for the same slug.
    dir: ['./guidance', './guidance-feedback'],
  },
};
