import { createContext, useContext } from 'react';

/** The docs theme value a consumer decorator can follow. */
export interface DocsTheme {
  /** Current theme value, normally `'dark'` or `'light'`. */
  theme: string;
  /** The two configured values, initial first. */
  values: [string, string];
  /** Switch the docs theme. */
  setTheme: (value: string) => void;
}

export const DocsThemeContext = createContext<DocsTheme | null>(null);

/** Read the docs theme inside a `decorators.module`, so a React provider can follow it. */
export function useDocsTheme(): DocsTheme {
  const value = useContext(DocsThemeContext);
  if (!value) throw new Error('useDocsTheme must be used inside a react-storydocs app');
  return value;
}
