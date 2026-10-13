declare module 'virtual:storybook-docs/site' {
  type StorybookDocsConfig = import('./config.js').StorybookDocsConfig;
  export const site: StorybookDocsConfig['site'];
  export const theme: NonNullable<StorybookDocsConfig['theme']>;
  export const pages: Required<NonNullable<StorybookDocsConfig['pages']>>;
  export const hasTokens: boolean;
  export const themeCss: string;
}

declare module 'virtual:storybook-docs/catalog' {
  type CatalogEntry = import('./config.js').CatalogEntry;
  export const catalog: CatalogEntry[];
  export const groups: string[];
  export const stats: { components: number; stories: number; groups: number };
}

declare module 'virtual:storybook-docs/tokens' {
  export const vars: Record<string, unknown>;
}

declare module 'virtual:storybook-docs/props' {
  type ComponentPropsDoc = import('./vite-plugin.js').ComponentPropsDoc;
  export function loadProps(slug: string): Promise<{ components: ComponentPropsDoc[] }>;
}

declare module 'virtual:storybook-docs/guidance' {
  export function loadGuidance(slug: string): Promise<{ markdown: string }>;
}

declare module 'virtual:storybook-docs/releases' {
  export const releases: { version: string | null; changelog: string | null };
}

declare module 'virtual:storybook-docs/global-styles';

declare module 'virtual:storybook-docs/code' {
  import type { ComponentType } from 'react';
  export const provided: boolean;
  /** The consumer's code renderer, or undefined when the config names none. */
  export const Code: ComponentType<{ code: string; language?: string }> | undefined;
}
