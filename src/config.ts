/**
 * The consumer-facing configuration. Nothing in the engine is bound to a specific
 * design system: every path, package name, theme variable and label comes from here.
 */
export interface StorybookDocsConfig {
  /** Branding and header content. */
  site: {
    title: string;
    mark?: string;
    tagline?: string;
    links?: Array<{ label: string; href: string }>;
    /** Shown as a chip in the header; leave unset to read it from `releases.versionFrom`. */
    version?: string;
  };

  /**
   * Optional release information. Point `changelog` at the design system's changelog file
   * (rendered as a Releases page) and `versionFrom` at the package whose `version` field is
   * the current release.
   */
  releases?: {
    changelog?: string;
    versionFrom?: string;
  };

  /**
   * Where the story files live. `from` is either a package name (`@acme/ui`) or a path
   * relative to the config file (`../packages/ui`); `pattern` is a glob relative to that
   * root — the files it matches are the source of truth for navigation, examples and
   * API tables.
   */
  stories: {
    from: string;
    pattern: string;
    /** Bare package specifier used by import snippets. Defaults to `from` when it is a package
     * name, or to the package.json `name` found at the story root when `from` is a path. */
    importFrom?: string;
  };

  /** Optional information architecture: explicit group order and renames. */
  groups?: {
    order?: string[];
    rename?: Record<string, string>;
  };

  /**
   * Optional theme bridge. `vars` maps the engine's semantic roles to the design
   * system's own CSS custom properties, so the docs chrome is themed by the system it
   * documents (and the toggle works through the system's own theme attribute).
   */
  theme?: {
    attribute?: string;
    values?: [string, string];
    vars?: Partial<Record<ThemeRole, string>>;
  };

  /** Optional token source that enables the Foundations pages. */
  tokens?: {
    varsModule: string;
    /** Named export in `varsModule` holding the token object. Defaults to `vars`. */
    varsExport?: string;
    /** CSS files to load for the consumer's tokens (bare specifiers). */
    css?: string[];
  };

  /**
   * Optional authored prose. A directory of Markdown files named after component slugs
   * (`button.md`) plus optionally `index.md` for the overview; each is rendered on that
   * component's page. This is the part stories cannot generate. Several directories may be
   * listed; for the same slug, a later directory wins.
   */
  guidance?: {
    dir: string | string[];
  };

  /**
   * Optional code renderer. `module` is a path to a module in the consumer app (relative to the
   * config) whose default export renders `{ code, language }` — normally the design system's own
   * code block, wired to its highlighter, so examples look exactly as they do in the system.
   * Without it, code renders in the engine's plain block.
   */
  code?: {
    module: string;
  };

  /**
   * Optional composition panel. `module` is a path relative to the consumer root whose default
   * export renders `{ entry, components, uses }`. Absent config renders nothing. A throw in the
   * panel does not take down the page. The engine does not interpret slots or related components;
   * the consumer does.
   */
  composition?: {
    module: string;
  };

  /** A module relative to the consumer root whose default export is one Storybook decorator or
   * an array of them. Applied around every example, outside meta/story decorators. The module
   * can import its own CSS. */
  decorators?: { module: string };

  /** Optional page switches. Foundations pages require `tokens`. */
  pages?: {
    overview?: boolean;
    color?: boolean;
    typography?: boolean;
    spacing?: boolean;
    effects?: boolean;
    api?: boolean;
  };
}

export const THEME_ROLES = [
  'bg',
  'surface',
  'surfaceRaised',
  'surfaceHover',
  'border',
  'borderSubtle',
  'text',
  'textMuted',
  'textSubtle',
  'accent',
  'accentText',
  'accentSoft',
  'accentContrast',
  'danger',
  'dangerText',
  'success',
  'focusRing',
] as const;

export type ThemeRole = (typeof THEME_ROLES)[number];

export interface CatalogEntry {
  slug: string;
  name: string;
  group: string;
  storybookTitle: string;
  stories: string[];
  hasComponent: boolean;
  load: () => Promise<Record<string, unknown>>;
}
