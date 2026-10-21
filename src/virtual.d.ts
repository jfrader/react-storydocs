declare module 'virtual:react-storydocs/site' {
  type ReactStorydocsConfig = import('./config.js').ReactStorydocsConfig;
  export const site: ReactStorydocsConfig['site'];
  export const theme: NonNullable<ReactStorydocsConfig['theme']>;
  export const pages: Required<NonNullable<ReactStorydocsConfig['pages']>>;
  export const hasTokens: boolean;
  export const themeCss: string;
}

declare module 'virtual:react-storydocs/catalog' {
  type CatalogEntry = import('./config.js').CatalogEntry;
  export const catalog: CatalogEntry[];
  export const storySource: string;
  export const groups: string[];
  export const stats: { components: number; stories: number; groups: number };
}

declare module 'virtual:react-storydocs/tokens' {
  export const vars: Record<string, unknown>;
}

declare module 'virtual:react-storydocs/props' {
  type CatalogRef = import('./prop-docs.js').CatalogRef;
  type ComponentPropsDoc = import('./prop-docs.js').ComponentPropsDoc;
  export function loadProps(slug: string): Promise<{ components: ComponentPropsDoc[]; uses: CatalogRef[] }>;
}

declare module 'virtual:react-storydocs/guidance' {
  export function loadGuidance(slug: string): Promise<{ markdown: string }>;
}

declare module 'virtual:react-storydocs/story-sources' {
  export function loadStorySources(slug: string): Promise<{ sources: Record<string, string> }>;
}

declare module 'virtual:react-storydocs/releases' {
  export const releases: { version: string | null; changelog: string | null };
}

declare module 'virtual:react-storydocs/global-styles';

declare module 'virtual:react-storydocs/decorators' {
  export const decorators: unknown[];
}

declare module 'virtual:react-storydocs/code' {
  import type { ComponentType } from 'react';
  export const provided: boolean;
  /** The consumer's code renderer, or undefined when the config names none. */
  export const Code: ComponentType<{ code: string; language?: string }> | undefined;
}

declare module 'virtual:react-storydocs/api' {
  import type { ComponentType } from 'react';
  type ApiRendererProps = import('./prop-docs.js').ApiRendererProps;
  export const provided: boolean;
  export const Api: ComponentType<ApiRendererProps> | undefined;
}

declare module 'virtual:react-storydocs/composition' {
  import type { ComponentType } from 'react';
  type CatalogRef = import('./prop-docs.js').CatalogRef;
  type ComponentPropsDoc = import('./prop-docs.js').ComponentPropsDoc;
  export const provided: boolean;
  export const Composition: ComponentType<{
    entry: { slug: string; name: string; group: string };
    components: ComponentPropsDoc[] | null;
    uses: CatalogRef[];
  }> | undefined;
}
