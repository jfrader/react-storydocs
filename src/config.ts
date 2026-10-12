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

  /** Optional page switches. Foundations pages require `tokens`. */
  pages?: {
    overview?: boolean;
    color?: boolean;
    typography?: boolean;
    api?: boolean;
  };
}

export type ThemeRole =
  | 'bg'
  | 'surface'
  | 'surfaceRaised'
  | 'surfaceHover'
  | 'border'
  | 'borderSubtle'
  | 'text'
  | 'textMuted'
  | 'textSubtle'
  | 'accent'
  | 'accentText'
  | 'accentSoft'
  | 'accentContrast'
  | 'danger'
  | 'focusRing';

export interface CatalogEntry {
  slug: string;
  name: string;
  group: string;
  storybookTitle: string;
  stories: string[];
  hasComponent: boolean;
  load: () => Promise<Record<string, unknown>>;
}
