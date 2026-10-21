/** @jsxImportSource react */
import { useState, type ReactNode } from 'react';
import { catalog } from 'virtual:react-storydocs/catalog';
import { decorators } from 'virtual:react-storydocs/decorators';
import type { CatalogEntry } from '../config';
import { hrefFor } from '../base';
import { storyName } from '../sections';
import { componentStoryHref } from '../story-route';
import { StoryView, useStoryModule, storyLayout } from '../story-view';
import '../story-frame.css';
import './story-page.css';

const WIDTHS = ['Fill', '1024', '768', '390'] as const;

function StoryMessage({ children, href }: { children: string; href: string }) {
  return <main className="sd-story-message"><h1>{children}</h1><a className="tool" href={href}>Back to documentation</a></main>;
}

function LoadedStoryPage({ entry, story, themeAction }: { entry: CatalogEntry; story: string; themeAction: ReactNode }) {
  const { module, error } = useStoryModule(entry);
  const [width, setWidth] = useState<(typeof WIDTHS)[number]>('Fill');
  const back = componentStoryHref(entry.slug, story);
  if (error) return <StoryMessage href={back}>Could not load the story.</StoryMessage>;
  if (module && (!Object.hasOwn(module, story) || !entry.stories.includes(story))) {
    return <StoryMessage href={back}>Story not found.</StoryMessage>;
  }
  const name = module ? storyName(module[story], story) : story;
  const layout = module ? storyLayout(module, story) : 'padded';
  return <div className="sd-story-page">
    <header className="sd-story-bar">
      <a className="tool" href={back} aria-label={`Back to ${entry.name}`}>← Back</a>
      <span className="sd-story-title">{entry.name}<span>{name}</span></span>
      <div className="sd-story-widths" role="group" aria-label="Story width">
        {WIDTHS.map((preset) => <button className="tool" key={preset} type="button" aria-pressed={width === preset} onClick={() => setWidth(preset)}>{preset}</button>)}
      </div>
      {themeAction}
    </header>
    <main className="sd-story-workspace" aria-label={`${entry.name}: ${name}`}>
      <div className="sd-story-stage" style={{ width: width === 'Fill' ? '100%' : `${width}px` }}>
        <div className="shot" data-layout={layout}>
          <div className="story-lane" data-layout={layout}>
            {module ? <StoryView module={module} story={story} decorators={decorators} /> : <p role="status">Loading story…</p>}
          </div>
        </div>
      </div>
    </main>
  </div>;
}

export function StandaloneStoryPage({ slug, story, themeAction }: { slug: string; story: string; themeAction: ReactNode }) {
  const entry = catalog.find((entry) => entry.slug === slug);
  if (!entry) return <StoryMessage href={`#${hrefFor('/')}`}>Component not found.</StoryMessage>;
  if (!entry.stories.includes(story)) return <StoryMessage href={componentStoryHref(slug, story)}>Story not found.</StoryMessage>;
  return <LoadedStoryPage key={`${slug}:${story}`} entry={entry} story={story} themeAction={themeAction} />;
}
