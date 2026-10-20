/** @jsxImportSource react */
import { useEffect, useLayoutEffect, useRef, useState, type ReactNode } from 'react';
import { catalog, groups, stats } from 'virtual:storybook-docs/catalog';
import { pages, site, theme } from 'virtual:storybook-docs/site';
import { ComponentPage } from './pages/component-page';
import { ColorPage } from './pages/foundations-color';
import { EffectsPage } from './pages/foundations-effects';
import { SpacingPage } from './pages/foundations-spacing';
import { TypePage } from './pages/foundations-type';
import { OverviewPage } from './pages/overview';
import { ReleasesPage } from './pages/releases';
import { SearchBox } from './search';
import { releases } from 'virtual:storybook-docs/releases';
import { STORYBOOK_DOCS_BASE, hrefFor } from './base';
import { PageRail, hashPath } from './toc';

const routeHref = (path: string) => `#${hrefFor(path)}`;
function NavGroup({ id, title, active, children }: { id: string; title: string; active: boolean; children: ReactNode }) {
  const [open, setOpen] = useState(active);
  return (
    <div role="group" aria-labelledby={id}>
      <button type="button" className="grp" id={id} aria-expanded={open} aria-controls={`${id}-links`} onClick={() => setOpen(!open)}>
        <span>{title}</span>
        <svg className="grp-chevron" width="14" height="14" viewBox="0 0 16 16" fill="none" stroke="currentColor" strokeWidth="1.5" aria-hidden="true">
          <path d="m6 4 4 4-4 4" />
        </svg>
      </button>
      <div id={`${id}-links`} hidden={!open}>
        {children}
      </div>
    </div>
  );
}

type Route =
  | { kind: 'overview' }
  | { kind: 'releases' }
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
  // A releases page without a configured changelog documents nothing: the nav entry and the route
  // only exist when there is a changelog to read.
  if (path === 'releases' && releases.changelog) return { kind: 'releases' };
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
  const pageKey = route.kind === 'component' ? `components/${route.slug}` : route.kind;
  const headerRef = useRef<HTMLElement | null>(null);
  const mainRef = useRef<HTMLElement | null>(null);
  const renderedPage = useRef(pageKey);
  useLayoutEffect(() => {
    if (renderedPage.current !== pageKey) {
      window.scrollTo({ top: 0, left: 0, behavior: 'instant' });
      mainRef.current?.focus({ preventScroll: true });
      renderedPage.current = pageKey;
    }
  }, [pageKey]);

  useEffect(() => {
    const header = headerRef.current;
    if (!header) return;
    const root = document.documentElement;
    const previousHeight = root.style.getPropertyValue('--sd-header-height');
    const measure = () => root.style.setProperty('--sd-header-height', `${header.getBoundingClientRect().height}px`);
    measure();
    const observer = new ResizeObserver(measure);
    observer.observe(header);
    return () => {
      observer.disconnect();
      if (previousHeight) root.style.setProperty('--sd-header-height', previousHeight);
      else root.style.removeProperty('--sd-header-height');
    };
  }, []);

  useEffect(() => {
    const onHash = () => {
      setRoute(parseRoute(window.location.hash));
      setNavOpen(false);
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
      <header className="top" ref={headerRef}>
        <button
          type="button"
          className="tool nav-toggle"
          aria-expanded={navOpen}
          aria-controls="docs-nav"
          onClick={() => setNavOpen(!navOpen)}
        >
          Menu
        </button>
        <a className="brand-link" href={routeHref('/')}>
          <span className="mark" aria-hidden="true">{site.mark ?? site.title.slice(0, 1).toUpperCase()}</span>
          <span className="brand">{site.title}</span>
        </a>
        <span className="chip">docs{releases.version ? ` · v${releases.version}` : ''}</span>
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

      <div className="rail-track nav-track">
      <nav id="docs-nav" className={navOpen ? 'nav open' : 'nav'} aria-label="Documentation">
        <a href={routeHref('/')} className={route.kind === 'overview' ? 'on' : undefined} aria-current={route.kind === 'overview' ? 'page' : undefined}>
          Overview
        </a>
        {releases.changelog ? (

          <a

            href={routeHref('/releases')}

            className={route.kind === 'releases' ? 'on' : undefined}

            aria-current={route.kind === 'releases' ? 'page' : undefined}

          >

            Releases

            {releases.version ? <span className="nav-count">v{releases.version}</span> : null}

          </a>

        ) : null}
        {foundations.length > 0 ? (
          <NavGroup key="foundations" id="nav-grp-foundations" title="Design tokens" active={foundations.some((item) => route.kind === item.kind)}>
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
          </NavGroup>
        ) : null}
        {groups.map((group, index) => {
          const entries = catalog.filter((entry) => entry.group === group);
          const active = entries.some((entry) => entry.slug === activeSlug);
          return (
            <NavGroup key={group} id={`nav-grp-${index}`} title={group} active={active}>
              {entries.map((entry) => (
                <a
                  key={entry.slug}
                  href={routeHref(`/components/${entry.slug}`)}
                  className={activeSlug === entry.slug ? 'on' : undefined}
                  aria-current={activeSlug === entry.slug ? 'page' : undefined}
                  onMouseEnter={() => void entry.load()}
                  onFocus={() => void entry.load()}
                >
                  {entry.name}
                </a>
              ))}
            </NavGroup>
          );
        })}
      </nav>
      </div>

      <main id="main" className="main" tabIndex={-1} ref={mainRef}>
        {route.kind === 'component' ? (
          <ComponentPage key={pageKey} entry={catalog.find((entry) => entry.slug === route.slug)!} />
        ) : route.kind === 'color' ? (
          <ColorPage />
        ) : route.kind === 'typography' ? (
          <TypePage />
        ) : route.kind === 'spacing' ? (
          <SpacingPage />
        ) : route.kind === 'effects' ? (
          <EffectsPage />
        ) : route.kind === 'releases' ? (
          <ReleasesPage />
        ) : (
          <OverviewPage />
        )}
      </main>
      {route.kind !== 'overview' ? <PageRail key={pageKey} pageKey={pageKey} /> : null}
    </div>
  );
}
