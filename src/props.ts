import { useEffect, useState } from 'react';
import { loadProps } from 'virtual:storybook-docs/props';
import type { CatalogRef, ComponentPropsDoc, PropDoc } from './prop-docs';

export type { CatalogRef, ComponentPropsDoc, PropDoc };

export interface PropsLoad {
  components: ComponentPropsDoc[] | null;
  uses: CatalogRef[];
}

/** Loads the component's source-derived props (react-docgen) once per page. */
export function useProps(slug: string): PropsLoad | null {
  const [loaded, setLoaded] = useState<PropsLoad | null>(null);
  useEffect(() => {
    let alive = true;
    setLoaded(null);
    loadProps(slug)
      .then((module) => {
        if (alive) setLoaded({ components: module.components, uses: module.uses ?? [] });
      })
      .catch(() => {
        if (alive) setLoaded({ components: [], uses: [] });
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  return loaded;
}
