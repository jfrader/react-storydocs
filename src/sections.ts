/** Storybook's docs parameters, as this design system authors them: a component description, a
 * per-story description, authoring prose and an optional code sample that overrides the snippet
 * the engine would generate. */
export type DocsParameters = {
  description?: { component?: string; story?: string };
  /** Plain text or `- ` bulleted lines about behaviour and composition. */
  usage?: string;
  source?: { code?: string; language?: string };
};

export function mergeAnnotations(...values: Array<Record<string, unknown> | undefined>): Record<string, unknown> {
  const merged: Record<string, unknown> = {};
  const isRecord = (value: unknown): value is Record<string, unknown> =>
    value !== null && typeof value === 'object' && Object.getPrototypeOf(value) === Object.prototype;
  for (const value of values) {
    for (const [key, next] of Object.entries(value ?? {})) {
      if (next === undefined) continue;
      const previous = merged[key];
      merged[key] = isRecord(previous) && isRecord(next) ? mergeAnnotations(previous, next) : next;
    }
  }
  return merged;
}

/**
 * Story names carry the structure of a component's docs: which stories are variants,
 * which are states, which are environments. Bucketing them beats one flat list.
 */
const SECTIONS: Array<{ title: string; match: RegExp }> = [
  {
    title: 'Environments',
    match: /rtl|ltr|dir|theme|forced|reduced|motion|dark|light|contrast|a11y|aria|screen|zoom|locale|intl/i,
  },
  {
    title: 'Variants & sizes',
    match: /variant|tone|size|appearance|density|style|colour|color|emphasis|shape|level|orientation|align|position|placement/i,
  },
  {
    title: 'States',
    match: /loading|disabled|error|invalid|required|readonly|pending|selected|checked|open|closed|active|focus|hover|pressed|busy|empty|filled|failed|success|indeterminate/i,
  },
  {
    title: 'Interaction & keyboard',
    match: /keyboard|pointer|drag|click|typeahead|escape|tab|enter|space|arrow|scroll|wheel|swipe|gesture|hold|capture|press|navigate|activat/i,
  },
  {
    title: 'Content & layout',
    match: /long|short|narrow|wide|wrap|overflow|label|children|content|text|icon|image|avatar|number|value|truncat|clamp|stack/i,
  },
  {
    title: 'Edge cases',
    match: /error|reject|cancel|unmount|reset|guard|edge|stress|zero|invalid|falsy|boolean|external|controlled|uncontrolled|ref|slot|sx|default|initial|missing|duplicate|unknown|null/i,
  },
];

export interface StorySection {
  title: string;
  stories: string[];
}

export function sectionStories(stories: string[]): StorySection[] {
  const overview = stories.filter((story) => /^default$/i.test(story));
  const rest = stories.filter((story) => !/^default$/i.test(story));
  const buckets = SECTIONS.map((section) => ({ ...section, stories: [] as string[] }));
  const more: string[] = [];

  for (const story of rest) {
    const bucket = buckets.find((candidate) => candidate.match.test(story));
    (bucket ? bucket.stories : more).push(story);
  }

  const sections: StorySection[] = [];
  if (overview.length > 0) {
    sections.push({ title: 'Overview', stories: overview });
  }
  for (const bucket of buckets) {
    if (bucket.stories.length > 0) {
      sections.push({ title: bucket.title, stories: bucket.stories });
    }
  }
  if (more.length > 0) {
    sections.push({ title: 'More stories', stories: more });
  }
  return sections;
}

/** A first-pass usage snippet from the default story's own args. */
export function usageSnippet(componentName: string, args: Record<string, unknown> | undefined): string | null {
  if (!args) return null;
  const attributes: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (key === 'children' || key.startsWith('on')) continue;
    if (value === undefined || value === null) continue;
    if (typeof value === 'string') attributes.push(`${key}="${value}"`);
    else if (typeof value === 'number') attributes.push(`${key}={${value}}`);
    // `false` is the default for most booleans — showing it adds noise to a usage snippet.
    else if (typeof value === 'boolean' && value) attributes.push(key);
  }
  const children = typeof args.children === 'string' ? args.children : null;
  const opening = attributes.length > 0 ? `<${componentName} ${attributes.join(' ')}>` : `<${componentName}>`;
  return children ? `${opening}${children}</${componentName}>` : `${opening}\n  …\n</${componentName}>`;
}
