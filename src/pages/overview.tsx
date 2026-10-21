/** @jsxImportSource react */

import type { ReactNode } from 'react';
import { catalog, groups, stats } from 'virtual:storybook-docs/catalog';
import { site } from 'virtual:storybook-docs/site';
import { hrefFor } from '../base';
import { Guidance } from '../guidance';

export function OverviewPage(): ReactNode {
  const startHere = catalog.slice(0, 6);
  return (
    <>
      <div className="crumb">Overview</div>
      <h1>{site.title}</h1>
      {site.tagline ? <p className="lede">{site.tagline}</p> : null}

      <Guidance slug="index" />

      <div className="tiles">
        <div className="card tile">
          <div className="num">{stats.components}</div>
          <b>Components</b>
        </div>
        <div className="card tile">
          <div className="num">{stats.stories}</div>
          <b>Stories</b>
        </div>
      </div>

      <h2>Browse by area</h2>
      <div className="group-grid">
        {groups.map((group) => {
          const inGroup = catalog.filter((entry) => entry.group === group);
          const shown = inGroup.slice(0, 6);
          return (
            <div className="card group-card" key={group}>
              <h3>
                {group} <span className="count">{inGroup.length}</span>
              </h3>
              <ul>
                {shown.map((entry) => (
                  <li key={entry.slug}>
                    <a
                      href={`#${hrefFor(`/components/${entry.slug}`)}`}
                      onMouseEnter={() => void entry.load()}
                      onFocus={() => void entry.load()}
                    >{entry.name}</a>
                  </li>
                ))}
              </ul>
              {inGroup.length > shown.length ? (
                <p className="hint">+ {inGroup.length - shown.length} more in this area</p>
              ) : null}
            </div>
          );
        })}
      </div>

      <h2>How this works</h2>
      <div className="grid2">
        <div className="card">
          <h3>1 · The config points at the stories</h3>
          <p>
            The host app declares where its story files live (a package name or a path) and a glob inside it. The Vite
            plugin reads them, takes each module&apos;s <code>title</code> and exported stories, and builds the sidebar —
            including any group renames, so authored titles can stay as they are.
          </p>
        </div>
        <div className="card">
          <h3>2 · Examples are the story modules</h3>
          <p>
            Opening a component lazily imports the same module Storybook renders and evaluates it here: the meta&apos;s{' '}
            <code>component</code>, merged <code>args</code>, or the story&apos;s own <code>render</code>. A design system
            gets a docs page without writing one. A meta may curate{' '}
            <code>parameters.docs.sections</code> to choose and order the examples the page shows.
          </p>
        </div>
        <div className="card">
          <h3>3 · API from the component sources</h3>
          <p>
            Each page&apos;s API comes from the component sources: root and part props, native element, slots and their
            defaults, and inherited contract notes. JSDoc supplies the introduction and part descriptions;{' '}
            <code>argTypes</code> only drive the controls.
          </p>
        </div>
        <div className="card">
          <h3>4 · The chrome uses the system&apos;s tokens</h3>
          <p>
            Optional theme and token bridges map the engine&apos;s semantic roles to the design system&apos;s CSS
            variables and token module — which is why the theme toggle restyles this site through the system&apos;s own
            theme attribute.
          </p>
        </div>
      </div>

      <h2>Start here</h2>
      <ul>
        {startHere.map((entry) => (
          <li key={entry.slug}>
            <a
              href={`#${hrefFor(`/components/${entry.slug}`)}`}
              onMouseEnter={() => void entry.load()}
              onFocus={() => void entry.load()}
            >{entry.name}</a> — {entry.stories.length} stories
          </li>
        ))}
      </ul>
    </>
  );
}
