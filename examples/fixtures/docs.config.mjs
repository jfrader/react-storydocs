/**
 * Config for the synthetic Acme UI fixture.
 * Demonstrates a different design system layout, title scheme, group IA, tokens and guidance.
 */
export default {
  decorators: { module: './src/decorators.tsx' },
  site: {
    title: 'Acme UI (fixtures)',
    mark: 'A',
    tagline: 'Synthetic design system to prove the storybook-docs engine is generic across any Storybook-using library.',
    links: [{ label: 'Source', href: 'https://example.com/acme' }],
  },
  stories: {
    from: './packages/acme-ui',
    pattern: 'src/components/*/*.stories.tsx',
    importFrom: '@acme/ui',
  },
  groups: {
    rename: { Primitives: 'Core primitives', Feedback: 'Alerts & feedback' },
    order: [
      'Core primitives',
      'Alerts & feedback',
      'Layout',
    ],
  },
  theme: {
    attribute: 'data-theme',
    values: ['dark', 'light'],
    vars: {
      bg: 'var(--acme-color-bg)',
      surface: 'var(--acme-color-surface)',
      surfaceRaised: 'var(--acme-color-surface-raised)',
      surfaceHover: 'var(--acme-color-surface-hover)',
      border: 'var(--acme-color-border)',
      borderSubtle: 'var(--acme-color-border-subtle)',
      text: 'var(--acme-color-text)',
      textMuted: 'var(--acme-color-text-muted)',
      textSubtle: 'var(--acme-color-text-subtle)',
      accent: 'var(--acme-color-accent)',
      accentText: 'var(--acme-color-accent-text)',
      accentSoft: 'var(--acme-color-accent-soft)',
      accentContrast: 'var(--acme-color-accent-contrast)',
      danger: 'var(--acme-color-danger)',
      focusRing: 'var(--acme-color-focus-ring)',
    },
  },
  tokens: {
    varsModule: '/packages/acme-ui/src/tokens.js',
    varsExport: 'vars',
    css: ['/packages/acme-ui/src/tokens.css'],
  },
  guidance: {
    dir: './guidance',
  },
};
