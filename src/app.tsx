/** @jsxImportSource react */
import { useEffect, useRef, useState } from 'react';
import { catalog, groups, stats } from 'virtual:storybook-docs/catalog';
import { pages, site, theme } from 'virtual:storybook-docs/site';
import { ComponentPage } from './pages/component-page';
import { ColorPage } from './pages/foundations-color';
import { EffectsPage } from './pages/foundations-effects';
import { SpacingPage } from './pages/foundations-spacing';
import { TypePage } from './pages/foundations-type';
import { OverviewPage } from './pages/overview';
import { SearchBox } from './search';
import { STORYBOOK_DOCS_BASE, hrefFor } from './base';
import { PageRail, hashPath } from './toc';

const routeHref = (path: string) => `#${hrefFor(path)}`;

type Route =
  | { kind: 'overview' }
  | { kind: 'component'; slug: string }
  | { kind: 'color' }
  | { kind: 'typography' }
  | { kind: 'spacing' }
  | { kind: 'effects' };

function parseRoute(hash: string): Route {
  const path = hashPath(hash).replace(new RegExp(`^#?\\/?${STORYBOOK_DOCS_BASE}`), '').replace(/^\/+/, '');
  if (path.startsWith('components/')) {
    const slug = path.slice('components/'.length);
    if (catalog.some((entry) => entry.slug === slug)) return { kind: 'component', slug };
  }
  if (path === 'tokens/color') return { kind: 'color' };
  if (path === 'tokens/typography') return { kind: 'typography' };
  if (path === 'tokens/spacing') return { kind: 'spacing' };
  if (path === 'tokens/effects') return { kind: 'effects' };
  return { kind: 'overview' };
}

export function DocsApp() {
  const [route, setRoute] = useState<Route>(() => parseRoute(window.location.hash));
  const [mode, setMode] = useState(theme.values?.[0] ?? 'dark');
  const [navOpen, setNavOpen] = useState(false);
  const mainRef = useRef<HTMLElement | null>(null);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
      setNavOpen(false);
      window.scrollTo(0, 0);
      mainRef.current?.focus({ preventScroll: true });
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
    ...(pages.color ? [{ href: routeHref(`/tokens/color`), label: 'Color', kind: 'color' }] : []),
    ...(pages.typography ? [{ href: routeHref(`/tokens/typography`), label: 'Typography', kind: 'typography' }] : []),
    ...(pages.spacing ? [{ href: routeHref(`/tokens/spacing`), label: 'Spacing & shape', kind: 'spacing' }] : []),
    ...(pages.effects ? [{ href: routeHref(`/tokens/effects`), label: 'Elevation & motion', kind: 'effects' }] : []),
  ];

  return (
    <div className={route.kind === 'overview' ? 'app' : 'app has-toc'}>
      <a
        className="skip"
        href="#main"
        onClick={(event) => {
          event.preventDefault();
          mainRef.current?.focus();
        }}
      >
        Skip to content
      </a>
      <header className="top">
        <button
          type="button"
          className="tool nav-toggle"
          aria-expanded={navOpen}
          aria-controls="docs-nav"
          onClick={() => setNavOpen(!navOpen)}
        >
          Menu
        </button>
        <span className="mark" aria-hidden="true">{site.mark ?? site.title.slice(0, 1).toUpperCase()}</span>
        <span className="brand">{site.title}</span>
        <span className="chip">docs</span>
        <SearchBox />
        <span className="spacer" />
        <button
          type="button"
          className="tool"
          aria-label={`Switch to ${mode === darkMode ? lightMode : darkMode} theme`}
          onClick={() => setMode(mode === darkMode ? lightMode : darkMode)}
        >
          {mode === darkMode ? lightMode : darkMode}
        </button>
        {(site.links ?? []).map((link) => (
          <a className="tool" key={link.href} href={link.href}>
            {link.label} <span aria-hidden="true">↗</span>
          </a>
        ))}
      </header>

      <nav id="docs-nav" className={navOpen ? 'nav open' : 'nav'} aria-label="Documentation">
        <a href={routeHref('/')} className={route.kind === 'overview' ? 'on' : undefined} aria-current={route.kind === 'overview' ? 'page' : undefined}>
          Overview
        </a>
        {foundations.length > 0 ? (
          <div role="group" aria-labelledby="nav-grp-foundations">
            <div className="grp" id="nav-grp-foundations">
              Foundations
            </div>
            {foundations.map((item) => (
              <a
                key={item.href}
                href={item.href}
                className={route.kind === item.kind ? 'on' : undefined}
                aria-current={route.kind === item.kind ? 'page' : undefined}
              >
                {item.label}
              </a>
            ))}
          </div>
        ) : null}
        {groups.map((group, index) => (
          <div key={group} role="group" aria-labelledby={`nav-grp-${index}`}>
            <div className="grp" id={`nav-grp-${index}`}>
              {group}
            </div>
            {catalog
              .filter((entry) => entry.group === group)
              .map((entry) => (
                <a
                  key={entry.slug}
                  href={routeHref(`/components/${entry.slug}`)}
                  className={activeSlug === entry.slug ? 'on' : undefined}
                  aria-current={activeSlug === entry.slug ? 'page' : undefined}
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

      <main id="main" className="main" tabIndex={-1} ref={mainRef}>
        {route.kind === 'component' ? (
          <ComponentPage entry={catalog.find((entry) => entry.slug === route.slug)!} />
        ) : route.kind === 'color' ? (
          <ColorPage />
        ) : route.kind === 'typography' ? (
          <TypePage />
        ) : route.kind === 'spacing' ? (
          <SpacingPage />
        ) : route.kind === 'effects' ? (
          <EffectsPage />
        ) : (
          <OverviewPage />
        )}
      </main>
      {route.kind !== 'overview' ? <PageRail pageKey={activeSlug ?? route.kind} /> : null}
    </div>
  );
}
