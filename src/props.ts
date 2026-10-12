import { useEffect, useState } from 'react';
import { loadProps } from 'virtual:storybook-docs/props';
import type { ComponentPropsDoc, PropDoc } from './vite-plugin';

export type { ComponentPropsDoc, PropDoc };

/** Loads the component's source-derived props (react-docgen) once per page. */
export function useProps(slug: string) {
  const [components, setComponents] = useState<ComponentPropsDoc[] | null>(null);
  useEffect(() => {
    let alive = true;
    setComponents(null);
    loadProps(slug)
      .then((module) => {
        if (alive) setComponents(module.components);
      })
      .catch(() => {
        if (alive) setComponents([]);
      });
    return () => {
      alive = false;
    };
  }, [slug]);
  return components;
}
