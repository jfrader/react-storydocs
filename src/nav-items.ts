import type { CatalogEntry, PageEntry } from './config';

export interface NavItem {
  /** The route path without its leading slash, which is also the page key. */
  route: string;
  name: string;
  load: () => Promise<unknown>;
}

/** A group's links in navigation order: its Markdown pages, then its components. */
export function groupNavItems(group: string, catalog: CatalogEntry[], pages: PageEntry[]): NavItem[] {
  return [
    ...pages.filter((page) => page.group === group).map((page) => ({ route: `pages/${page.slug}`, name: page.name, load: page.load })),
    ...catalog.filter((entry) => entry.group === group).map((entry) => ({ route: `components/${entry.slug}`, name: entry.name, load: entry.load })),
  ];
}
