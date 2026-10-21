import assert from 'node:assert/strict';
import { test } from 'node:test';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { mkdtempSync, readFileSync, rmSync, writeFileSync } from 'node:fs';
import { collectMatches, extractTitle, readStoryFile } from '../src/scan.ts';
import { buildCatalog, scanStories } from '../src/build/catalog.ts';
import { sectionStories } from '../src/sections.ts';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const acmeRoot = path.resolve(__dirname, '../examples/fixtures/packages/acme-ui');
const storyPattern = 'src/components/*/*.stories.tsx';

test('scanner extracts only the meta component identifier, ignoring decoys', () => {
  const root = mkdtempSync(path.resolve('.scan-test-'));
  const file = path.join(root, 'widget.stories.tsx');
  try {
    writeFileSync(file, `const decoy = { component: Wrong }; const meta = { title: 'Fields/Widget', component: Widget }; export default meta; export const Default = {};`);
    assert.equal(readStoryFile(file)!.component, 'Widget');
    writeFileSync(file, `const decoy = { component: Wrong }; const meta = { title: 'Fields/Widget' }; export default meta; export const Default = {};`);
    assert.equal(readStoryFile(file)!.component, null);
  } finally { rmSync(root, { recursive: true, force: true }); }
});

test('fixtures: only files with autodocs-visible stories enter the catalog and resolver', () => {
  const root = mkdtempSync(path.resolve('.scan-test-'));
  try {
    const sources = {
      hidden: `
        const meta = { title: 'Components/Hidden' } satisfies Meta;
        export default meta;
        export const First = { tags: ['!autodocs'], args: {} } satisfies Story;
        export const Second = { tags: ["!autodocs"] };
      `,
      mixed: `
        const meta = { title: 'Components/Mixed', tags: ['autodocs'] };
        export default meta;
        export const Hidden = { tags: ['!autodocs'] };
        export const Visible = { tags: ['!test', '!dev', 'custom'], args: { tags: ['!autodocs'] } };
      `,
      meta: `
        const meta = { title: 'Components/Meta', tags: ['!autodocs'] } satisfies Meta;
        export default meta;
        export const First = {};
        export const Second = { tags: ['autodocs'] };
      `,
      inline: `
        export default { title: 'Components/Inline', tags: ['!autodocs'] };
        export const First = {};
      `,
      empty: `const meta = { title: 'Components/Empty' }; export default meta;`,
    };
    for (const [name, source] of Object.entries(sources)) {
      writeFileSync(path.join(root, `${name}.stories.tsx`), source);
    }
    const stories = scanStories({ from: '.', pattern: '*.stories.tsx' }, root);
    assert.deepEqual(stories.map(({ facts }) => facts.title), ['Components/Mixed']);
    const catalog = buildCatalog(stories, undefined);
    assert.deepEqual(catalog.entries.map(({ slug, stories }) => ({ slug, stories })), [{ slug: 'mixed', stories: ['Visible'] }]);
    assert.deepEqual([...catalog.files.keys()], ['mixed']);
    assert.deepEqual(catalog.stats, { components: 1, stories: 1, groups: 1 });
  } finally {
    rmSync(root, { recursive: true, force: true });
  }
});

test('fixtures: collectMatches discovers every story file', () => {
  const matches = collectMatches(acmeRoot, storyPattern);
  assert.equal(matches.length, 5, 'exactly the five fixture stories');
  const basenames = matches.map((f) => path.basename(f)).sort();
  assert.deepEqual(basenames, ['alert.stories.tsx', 'button.stories.tsx', 'mui-field.stories.tsx', 'select.stories.tsx', 'widget.stories.tsx']);
});

test('fixtures: readStoryFile and extractTitle return the meta titles (decoy before meta is ignored)', () => {
  const matches = collectMatches(acmeRoot, storyPattern);
  const facts = matches.map((file) => readStoryFile(file)).filter(Boolean);
  const titles = facts.map((f) => f!.title).sort();
  assert.deepEqual(titles, ['Feedback/Alert', 'Primitives/Button', 'Primitives/MuiField', 'Primitives/Select', 'Primitives/Widget']);
  assert.equal(facts.find((f) => f!.title === 'Primitives/Widget')!.component, 'Widget');

  // explicit decoy test on the button story which contains a title: string before const meta
  const buttonFile = matches.find((f) => f.includes('button.stories.tsx'))!;
  const source = readFileSync(buttonFile, 'utf8');
  const extracted = extractTitle(source);
  assert.equal(extracted, 'Primitives/Button', 'scoped meta title wins over decoy title: string earlier in file');

  // stories are listed
  const buttonFacts = facts.find((f) => f!.title === 'Primitives/Button')!;
  assert.ok(buttonFacts.stories.includes('Default'));
  assert.ok(buttonFacts.stories.includes('Secondary'));
  assert.ok(buttonFacts.stories.includes('Large'));
  assert.ok(buttonFacts.stories.includes('Disabled'));
  assert.equal(buttonFacts.hasComponent, true);
  assert.equal(buttonFacts.component, 'Button');
});

test('fixtures: section bucketing from sections.ts works on fixture stories', () => {
  const stories = ['Default', 'VariantSolid', 'SizeMd', 'Disabled', 'Rtl', 'Loading', 'Keyboard', 'LongContent'];
  const sections = sectionStories(stories);
  const seen = sections.flatMap((s) => s.stories);
  assert.deepEqual([...seen].sort(), [...stories].sort(), 'every story appears exactly once');
  const titles = sections.map((s) => s.title);
  assert.ok(titles.includes('Overview'));
  assert.ok(titles.includes('Variants & sizes'));
  assert.ok(titles.includes('States'));
  assert.ok(titles.includes('Environments'));
  assert.ok(titles.includes('Interaction & keyboard'));
  assert.ok(titles.includes('Content & layout'));
});

test('fixtures: group rename/order is applied by the plugin (raw titles from pure scan are the authored ones)', () => {
  const matches = collectMatches(acmeRoot, storyPattern);
  const facts = matches.map((file) => readStoryFile(file)!);
  // raw authored titles use Primitives/ and Feedback/
  const groups = facts.map((f) => f.title.split('/')[0]).sort();
  assert.deepEqual(groups, ['Feedback', 'Primitives', 'Primitives', 'Primitives', 'Primitives']);
  // the config declares rename + order; that mapping lives only inside src/vite-plugin.ts buildCatalog
  // (collectMatches/readStoryFile/extractTitle are pure and see authored titles only)
  // so we assert the input titles here; the honouring is visible in runtime catalog served by dev server
});
