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

export interface ExampleStory {
  name: string;
  description?: string;
}

const DEBUG_STORY = /\b(?:loading|disabled|error|invalid|pending|failure|failed|reject(?:ed)?|rtl|ltr|forced|keyboard|light|dark|theme|motion|controlled|uncontrolled|empty|missing|boundary|boundaries|ref|veto|open|closed|focus|hover|pressed|busy|checked|selected|readonly|read only|indeterminate|success|a11y|aria|contrast|locale|zoom)\b/i;
const SHOWCASE_STORY = /^(highlighted|card|patterns?|composition|showcase|playground)$/i;
const CONTENT_STORY = /withicons|sizes|variants|patterns|composition|example|content/i;

/** Prefer a complete composition (a highlighted block or placeholder card) over a bare
 * Default. Otherwise lead with Default/Primary, then authored or named showcases.
 * State, environment and test fixtures never introduce a component. Ties keep source order. */
export function selectExample(stories: ExampleStory[]): string | null {
  const candidates = stories.filter((story) => !DEBUG_STORY.test(story.name.replace(/([a-z0-9])([A-Z])/g, '$1 $2').replace(/[_-]/g, ' ')));
  return (candidates.find((story) => SHOWCASE_STORY.test(story.name))
    ?? candidates.find((story) => /^(default|primary)$/i.test(story.name))
    ?? candidates.find((story) => story.description?.trim())
    ?? candidates.find((story) => CONTENT_STORY.test(story.name))
    ?? candidates[0])?.name ?? null;
}

function serializable(value: unknown, ancestors = new Set<unknown>()): boolean {
  if (value === null || typeof value === 'string' || typeof value === 'boolean') return true;
  if (typeof value === 'number') return Number.isFinite(value);
  if (typeof value !== 'object' || ancestors.has(value)) return false;
  if (!Array.isArray(value) && (Object.getPrototypeOf(value) !== Object.prototype || '$$typeof' in value)) return false;
  ancestors.add(value);
  const result = Object.values(value).every((item) => serializable(item, ancestors));
  ancestors.delete(value);
  return result;
}

/** Only story-authored values: never synthesize children or component defaults. */
export function usageSnippet(componentName: string, args: Record<string, unknown> | undefined): string | null {
  if (!args || Object.keys(args).length === 0) return null;
  const attributes: string[] = [];
  for (const [key, value] of Object.entries(args)) {
    if (key === 'children' || /^on[A-Z]/.test(key) || value === undefined) continue;
    if (!serializable(value)) return null;
    if (typeof value === 'string' && !/["&<>\n\r]/.test(value)) attributes.push(`${key}="${value}"`);
    else if (value === true) attributes.push(key);
    else attributes.push(`${key}={${JSON.stringify(value)}}`);
  }
  const opening = `<${componentName}${attributes.length ? ` ${attributes.join(' ')}` : ''}`;
  if (args.children === undefined) return attributes.length ? `${opening} />` : null;
  if (!serializable(args.children) || (args.children !== null && typeof args.children === 'object')) return null;
  const children = typeof args.children === 'string' && !/[&<>{}]/.test(args.children)
    ? args.children : `{${JSON.stringify(args.children)}}`;
  return `${opening}>${children}</${componentName}>`;
}

export function buildUsageSnippet({ componentName, from, args, source, jsxName, component }: {
  componentName: string;
  from: string;
  args?: Record<string, unknown>;
  source?: string;
  jsxName?: string;
  component?: unknown;
}): string | null {
  const rootName = componentName.split('.')[0]!;
  const identity = component as { displayName?: unknown } | undefined;
  const tag = jsxName ?? (typeof identity?.displayName === 'string' && identity.displayName.startsWith(`${rootName}.`)
    ? identity.displayName : componentName);
  const compound = component != null && Object.entries(component).some(([name, part]) => /^[A-Z]/.test(name)
    && (typeof part === 'function' || (part !== null && typeof part === 'object' && '$$typeof' in part)));
  // Root arguments cannot describe a compound's anatomy. Require authored composition code,
  // or the identity of the specific part, rather than showing an empty provider/root tag.
  const example = source?.trim() || (compound && !tag.includes('.') ? null : usageSnippet(tag, args));
  if (!example) return null;
  const imports = [...example.matchAll(/import\s*\{([^}]+)\}\s*from\s*(['"])(.*?)\2/g)];
  const imported = imports.some((match) => match[3] === from && match[1]!.split(',').some((name) => name.trim() === rootName));
  return imported ? example : `import { ${rootName} } from '${from}';\n\n${example}`;
}
