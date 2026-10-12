import { useEffect, useState } from 'react';
import { catalog, groups, stats } from 'virtual:storybook-docs/catalog';
import { pages, site, theme } from 'virtual:storybook-docs/site';
import { ComponentPage } from './pages/component-page';
import { ColorPage } from './pages/foundations-color';
import { TypePage } from './pages/foundations-type';
import { OverviewPage } from './pages/overview';
import { STORYBOOK_DOCS_BASE } from './base';

type Route =
  | { kind: 'overview' }
  | { kind: 'component'; slug: string }
  | { kind: 'color' }
  | { kind: 'typography' };

function parseRoute(hash: string): Route {
  const path = hash.replace(new RegExp(`^#?\\/?${STORYBOOK_DOCS_BASE}`), '').replace(/^\/+/, '');
  if (path.startsWith('components/')) {
    const slug = path.slice('components/'.length);
    if (catalog.some((entry) => entry.slug === slug)) return { kind: 'component', slug };
  }
  if (path === 'tokens/color') return { kind: 'color' };
  if (path === 'tokens/typography') return { kind: 'typography' };
  return { kind: 'overview' };
}

export function DocsApp() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [mode, setMode] = useState(theme.values?.[0] ?? 'dark');

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
      window.scrollTo(0, 0);
    };
    window.addEventListener('hashchange', onHash);
    return () => window.removeEventListener('hashchange', onHash);
  }, []);

  useEffect(() => {
    document.documentElement.setAttribute(theme.attribute ?? 'data-theme', mode);
  }, [mode]);

  const [darkMode, lightMode] = theme.values ?? ['dark', 'light'];
  const activeSlug = route.kind === 'component' ? route.slug : null;
  const foundations = [
    ...(pages.color ? [{ href: `${STORYBOOK_DOCS_BASE}/tokens/color`, label: 'Color' }] : []),
    ...(pages.typography ? [{ href: `${STORYBOOK_DOCS_BASE}/tokens/typography`, label: 'Typography' }] : []),
  ];

  return (
    <div className="app">
      <header className="top">
        <span className="mark">{site.mark ?? site.title.slice(0, 1).toUpperCase()}</span>
        <span className="brand">{site.title}</span>
        <span className="chip">docs</span>
        <span className="search">Search {stats.components} components…</span>
        <span className="spacer" />
        <button className="tool" onClick={() => setMode(mode === darkMode ? lightMode : darkMode)}>
          {mode === darkMode ? lightMode : darkMode}
        </button>
        {(site.links ?? []).map((link) => (
          <a className="tool" key={link.href} href={link.href}>
            {link.label} ↗
          </a>
        ))}
      </header>

      <nav className="nav">
        <a href={STORYBOOK_DOCS_BASE || '#'} className={route.kind === 'overview' ? 'on' : undefined}>
          Overview
        </a>
        {foundations.length > 0 ? <div className="grp">Foundations</div> : null}
        {foundations.map((item) => (
          <a
            key={item.href}
            href={item.href}
            className={
              (route.kind === 'color' && item.href.endsWith('color')) ||
              (route.kind === 'typography' && item.href.endsWith('typography'))
                ? 'on'
                : undefined
            }
          >
            {item.label}
          </a>
        ))}
        {groups.map((group) => (
          <div key={group}>
            <div className="grp">{group}</div>
            {catalog
              .filter((entry) => entry.group === group)
              .map((entry) => (
                <a
                  key={entry.slug}
                  href={`${STORYBOOK_DOCS_BASE}/components/${entry.slug}`}
                  className={activeSlug === entry.slug ? 'on' : undefined}
                >
                  {entry.name}
                </a>
              ))}
          </div>
        ))}
        <div className="nav-note">
          navigation, examples and API tables generated from {stats.components} story files · {stats.stories} stories
        </div>
      </nav>

      <main className="main">
        {route.kind === 'component' ? (
          <ComponentPage entry={catalog.find((entry) => entry.slug === route.slug)!} />
        ) : route.kind === 'color' ? (
          <ColorPage />
        ) : route.kind === 'typography' ? (
          <TypePage />
        ) : (
          <OverviewPage />
        )}
      </main>
    </div>
  );
}
