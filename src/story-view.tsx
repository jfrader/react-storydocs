/** @jsxImportSource react */
import { Component, createElement, useEffect, useState, type ComponentType, type ReactNode } from 'react';
import type { CatalogEntry } from './config';
import { mergeAnnotations } from './sections';

interface StoryDefinition {
  decorators?: DecoratorLike[];
  render?: (args: Record<string, unknown>, context: unknown) => ReactNode;
  args?: Record<string, unknown>;
  name?: string;
  globals?: Record<string, unknown>;
  argTypes?: Record<string, Record<string, unknown>>;
  parameters?: Record<string, unknown>;
}

interface MetaDefinition extends StoryDefinition {
  title?: string;
  component?: ComponentType<Record<string, unknown>>;
}

interface StoryBoundaryProps {
  children: ReactNode;
  story: string;
  module: Record<string, unknown>;
  overrides?: Record<string, unknown>;
}

class StoryBoundary extends Component<StoryBoundaryProps, { failed: boolean; message: string }> {
  state = { failed: false, message: '' };
  static getDerivedStateFromError(error: unknown) {
    return { failed: true, message: error instanceof Error ? error.message : String(error) };
  }
  componentDidUpdate(previous: StoryBoundaryProps) {
    if (this.state.failed && (previous.module !== this.props.module || previous.overrides !== this.props.overrides)) {
      this.setState({ failed: false, message: '' });
    }
  }
  render() {
    if (this.state.failed) {
      return (
        <div className="story-failed">
          “{this.props.story}” failed to render here: {this.state.message.slice(0, 240)}
        </div>
      );
    }
    return this.props.children;
  }
}

/** Renders a story from its own module: meta decorators, the meta component with merged args, the
 * story's own decorators, or the story's render — the same composition order Storybook uses. */
export function StoryView({
  module,
  story,
  overrides,
}: {
  module: Record<string, unknown>;
  story: string;
  overrides?: Record<string, unknown>;
}) {
  return (
    <StoryBoundary key={story} story={story} module={module} overrides={overrides}>
      <StoryContent module={module} story={story} overrides={overrides} />
    </StoryBoundary>
  );
}

function StoryContent({ module, story, overrides }: {
  module: Record<string, unknown>;
  story: string;
  overrides?: Record<string, unknown>;
}) {
  const meta = (module.default ?? {}) as MetaDefinition;
  const definition = (module[story] ?? {}) as StoryDefinition;
  const args = { ...meta.args, ...definition.args, ...overrides };
  const argTypes = mergeAnnotations(meta.argTypes, definition.argTypes);
  for (const [name, type] of Object.entries(argTypes)) {
    const mapping = (type as { mapping?: Record<string, unknown> }).mapping;
    const map = (value: unknown) => {
      const key = typeof value === 'string' || typeof value === 'number' || typeof value === 'boolean' ? String(value) : null;
      return mapping && key !== null && Object.hasOwn(mapping, key) ? mapping[key] : value;
    };
    if (Object.hasOwn(args, name)) args[name] = Array.isArray(args[name]) ? args[name].map(map) : map(args[name]);
  }
  const context = {
    args, initialArgs: { ...meta.args, ...definition.args }, argTypes,
    globals: { ...meta.globals, ...definition.globals },
    parameters: mergeAnnotations(meta.parameters, definition.parameters),
    name: definition.name ?? story, story: definition.name ?? story,
    title: meta.title, component: meta.component, viewMode: 'story', loaded: {},
  };
  // Storybook's precedence: the story's own render, then the meta's render, then the component
  // with its args. Skipping the meta render breaks every story that only overrides args.
  const render = definition.render ?? meta.render;
  const renderStory = (current: typeof context): ReactNode =>
    typeof render === 'function'
      ? render(current.args, current)
      : meta.component
        ? createElement(meta.component, current.args)
        : null;
  if (!render && !meta.component) return <div className="story-failed">Story “{story}” has nothing to render.</div>;
  const decorators = [
    ...(definition.decorators ?? []),
    ...(meta.decorators ?? []),
  ];
  const decorated = decorators.reduce<(current: typeof context) => ReactNode>(
    (inner, decorator) => (current) => decorator(
      (update) => inner({ ...current, ...update }), current,
    ), renderStory,
  );
  return decorated(context);
}

type DecoratorLike = (Story: (update?: { args?: Record<string, unknown> }) => ReactNode, context: unknown) => ReactNode;

/** Lazily imports the same module Storybook loads; resolves once per entry. */
export function useStoryModule(entry: CatalogEntry) {
  const [module, setModule] = useState<Record<string, unknown> | null>(null);
  const [error, setError] = useState<string | null>(null);
  useEffect(() => {
    let alive = true;
    setModule(null);
    setError(null);
    entry
      .load()
      .then((loaded) => {
        if (alive) setModule(loaded);
      })
      .catch((cause: unknown) => {
        if (alive) setError(cause instanceof Error ? cause.message : String(cause));
      });
    return () => {
      alive = false;
    };
  }, [entry]);
  return { module, error };
}
