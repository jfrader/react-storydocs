declare module 'virtual:storybook-docs/site' {
  import type { StorybookDocsConfig } from './config';
  export const site: StorybookDocsConfig['site'];
  export const theme: NonNullable<StorybookDocsConfig['theme']>;
  export const pages: Required<NonNullable<StorybookDocsConfig['pages']>>;
  export const hasTokens: boolean;
  export const themeCss: string;
}

declare module 'virtual:storybook-docs/catalog' {
  import type { CatalogEntry } from './config';
  export const catalog: CatalogEntry[];
  export const groups: string[];
  export const stats: { components: number; stories: number; groups: number };
}

declare module 'virtual:storybook-docs/tokens' {
  export const vars: Record<string, unknown>;
}

declare module 'virtual:storybook-docs/props' {
  import type { ComponentPropsDoc } from './vite-plugin';
  export function loadProps(slug: string): Promise<{ components: ComponentPropsDoc[] }>;
}

declare module 'virtual:storybook-docs/global-styles';
