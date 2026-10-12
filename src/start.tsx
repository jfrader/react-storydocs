/** @jsxImportSource react */
import 'virtual:storybook-docs/global-styles';
import { StrictMode, createElement } from 'react';
import { createRoot } from 'react-dom/client';
import { site, themeCss, theme } from 'virtual:storybook-docs/site';
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
    style.dataset.storybookDocs = 'theme';
    style.textContent = themeCss;
    document.head.append(style);
  }
  document.title = site.title;
  createRoot(container).render(<StrictMode>{createElement(DocsApp)}</StrictMode>);
}
