#!/usr/bin/env node
/**
 * Checks the example frames of a running docs site: visits every component page, mounts the lazy
 * frames, and reports what each example actually renders.
 *
 * It answers the question a page-by-page look answers too slowly: does every example render, is
 * anything painted outside its frame, does a component collapse to nothing, and is anything
 * invisible-but-focusable? Zero-size component roots are reported as notes rather than defects —
 * an empty group or a progress bar at zero is legitimate.
 *
 * Usage, from a directory where `playwright` resolves (normally your Storybook app):
 *   node path/to/check-example-frames.mjs http://localhost:4320 [--json out.json]
 *
 * Manual tool, not a CI gate: Playwright and its browser must be installed by the caller.
 * For the built fixtures consumer, run `pnpm --dir examples/fixtures build`, then
 * `pnpm --dir examples/fixtures preview --host 127.0.0.1 --port 4334` in another terminal,
 * and pass http://127.0.0.1:4334 to this script from a directory with Playwright installed.
 * CI gates the fixtures build and virtual-module contract instead; this tool checks layout.
 * Exit code is 1 when a component has a real finding.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';

const require = createRequire(`${process.cwd()}/package.json`);
let chromium;
try {
  ({ chromium } = require('playwright'));
} catch {
  console.error('check-example-frames: playwright is not resolvable from here. Run it from a directory that has playwright installed, or install it first.');
  process.exit(2);
}

const [, , url, ...rest] = process.argv;
if (!url) {
  console.error('check-example-frames: pass the docs URL, for example http://localhost:4320');
  process.exit(2);
}
const jsonIndex = rest.indexOf('--json');
const jsonPath = jsonIndex === -1 ? null : rest[jsonIndex + 1];

const report = [];

const browser = await chromium.launch();
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const consoleErrors = [];
page.on('pageerror', (error) => consoleErrors.push(error.message.slice(0, 120)));

await page.goto(url, { waitUntil: 'load' });
await page.waitForTimeout(2500);
const slugs = await page.evaluate(() =>
  Array.from(document.querySelectorAll('.nav a[href*="/components/"]')).map((a) => a.getAttribute('href').split('/components/')[1]),
);
console.log(`checking ${slugs.length} component pages on ${url}`);

for (const slug of slugs) {
  consoleErrors.length = 0;
  try {
    await page.goto(`${url}/#/components/${slug}`, { waitUntil: 'load' });
    await page.waitForTimeout(4200);
    // Walk the page so lazy frames mount, then return to the top.
    const height = await page.evaluate(() => document.body.scrollHeight);
    for (const fraction of [0.33, 0.66, 1]) {
      await page.evaluate((y) => window.scrollTo(0, y), Math.round(height * fraction));
      await page.waitForTimeout(900);
    }
    await page.evaluate(() => window.scrollTo(0, 0));
    await page.waitForTimeout(600);

    const result = await page.evaluate(() => {
      const frames = Array.from(document.querySelectorAll('.frame'));
      const failed = [];
      const overflow = [];
      const collapsed = [];
      const zeroTargets = [];
      let mounted = 0;

      // Invisible helpers (measure probes, closed dialogs, top-layer overlays, aria-hidden
      // duplicates) are not defects: a docs front is full of them by design.
      const isReal = (element) => {
        if (element.closest('dialog:not([open])')) return false;
        if (element.closest('[hidden], [type=hidden]')) return false;
        if (element.getAttribute('aria-hidden') === 'true') return false;
        const style = getComputedStyle(element);
        if (style.position === 'fixed' || style.visibility === 'hidden' || style.display === 'none') return false;
        if (Number(style.opacity) === 0) return false;
        return element.checkVisibility ? element.checkVisibility({ checkOpacity: true, checkVisibilityCSS: true }) : true;
      };

      for (const frame of frames) {
        const story = frame.querySelector('header span')?.textContent?.trim() ?? '?';
        const lane = frame.querySelector('.story-lane');
        if (!lane) continue;
        if (lane.querySelector('.story-failed')) {
          failed.push(`${story}: ${lane.querySelector('.story-failed').textContent.slice(0, 120)}`);
          continue;
        }
        if (!lane.firstElementChild || frame.querySelector('.lazy-placeholder .skeleton')) continue;
        mounted += 1;

        const laneRect = lane.getBoundingClientRect();
        for (const element of lane.querySelectorAll('*')) {
          if (!isReal(element)) continue;
          const rect = element.getBoundingClientRect();
          if (rect.width === 0 || rect.height === 0) continue;
          const over = Math.max(rect.right - laneRect.right, laneRect.left - rect.left);
          if (over <= 2) continue;
          // Content inside a scroll container is the scroller's business. The walk goes past the
          // lane up to the frame, because the canvas itself scrolls (Storybook's behaviour) and an
          // example wider than the frame is expected, not a defect.
          let scroller = element.parentElement;
          let insideScroller = false;
          const boundary = frame;
          while (scroller && scroller !== boundary) {
            const style = getComputedStyle(scroller);
            if (/(auto|scroll|hidden|clip)/.test(style.overflowX + style.overflow)) {
              insideScroller = true;
              break;
            }
            scroller = scroller.parentElement;
          }
          if (!insideScroller) overflow.push(`${story}: <${element.tagName.toLowerCase()}> +${Math.round(over)}px`);
        }

        for (const root of lane.querySelectorAll('[data-ui]')) {
          if (!isReal(root) || root.closest('button, input, select, textarea, a[href]')) continue;
          const rect = root.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) {
            collapsed.push(`${story}: <${root.tagName.toLowerCase()} data-ui=${root.getAttribute('data-ui')}>`);
          }
        }

        for (const control of lane.querySelectorAll('button, input, select, textarea, a[href]')) {
          if (!isReal(control)) continue;
          const rect = control.getBoundingClientRect();
          if (rect.width < 1 || rect.height < 1) zeroTargets.push(`${story}: <${control.tagName.toLowerCase()}>`);
        }
      }

      return {
        frames: frames.length,
        mounted,
        failed,
        overflow: overflow.slice(0, 4),
        collapsed: collapsed.slice(0, 3),
        zeroTargets: zeroTargets.slice(0, 4),
        loadError: (document.body.innerText.match(/Could not load the story module[^\n]*/) ?? [])[0] ?? null,
      };
    });

    const issues = result.failed.length + result.overflow.length + result.zeroTargets.length + (result.loadError ? 1 : 0);
    report.push({ slug, ...result, consoleErrors: [...consoleErrors] });
    console.log(
      `${issues === 0 ? 'ok   ' : 'ISSUE'} ${slug.padEnd(24)} frames=${result.frames} mounted=${result.mounted}` +
        (result.loadError ? ` LOAD-ERROR=${result.loadError.slice(0, 80)}` : '') +
        (result.failed.length ? ` FAILED=${result.failed.join(' | ')}` : '') +
        (result.overflow.length ? ` OVERFLOW=${result.overflow.join(' | ')}` : '') +
        (result.zeroTargets.length ? ` ZERO-SIZE=${result.zeroTargets.join(',')}` : '') +
        (result.collapsed.length ? ` EMPTY-ROOTS=${result.collapsed.join(' | ')}` : ''),
    );
  } catch (error) {
    report.push({ slug, error: String(error).slice(0, 200) });
    console.log(`ERROR ${slug} ${String(error).slice(0, 120)}`);
  }
}

await browser.close();

if (jsonPath) {
  writeFileSync(jsonPath, JSON.stringify(report, null, 1));
  console.log(`wrote ${jsonPath}`);
}
const withIssues = report.filter((entry) => entry.error || entry.loadError || entry.failed?.length || entry.overflow?.length || entry.zeroTargets?.length);
console.log(`${report.length - withIssues.length} of ${report.length} components clean`);
process.exit(withIssues.length === 0 ? 0 : 1);
