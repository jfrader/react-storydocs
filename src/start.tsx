/** @jsxImportSource react */
import 'virtual:react-storydocs/global-styles';
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { site, themeCss, theme } from 'virtual:react-storydocs/site';
import { DocsApp } from './app';

/** Mounts the docs front into `#root` (creating it when the host page has none). */
export function start() {
  let container = document.getElementById('root');
  if (!container) {
    container = document.createElement('div');
    container.id = 'root';
    document.body.append(container);
  }
  const attribute = theme.attribute ?? 'data-theme';
  document.documentElement.setAttribute(attribute, theme.values?.[0] ?? 'dark');
  if (themeCss) {
    const style = document.createElement('style');
    style.dataset.reactStorydocs = 'theme';
    style.textContent = themeCss;
    document.head.append(style);
  }
  document.title = site.title;
  // A docs front is responsive by default; the host page does not have to declare the viewport.
  if (!document.head.querySelector('meta[name="viewport"]')) {
    const viewport = document.createElement('meta');
    viewport.name = 'viewport';
    viewport.content = 'width=device-width, initial-scale=1';
    document.head.append(viewport);
  }
  createRoot(container).render(<StrictMode>{createElement(DocsApp)}</StrictMode>);
}
