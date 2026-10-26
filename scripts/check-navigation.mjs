#!/usr/bin/env node
/**
 * Browser regression checks against a running docs site. Run from a directory with Playwright:
 * node /path/to/check-navigation.mjs http://localhost:4346 [--route /components/button]
 *   [--widths 1440,1100,768,390] [--height 900] [--json /path/to/results.json]
 * Playwright and Chromium are caller-owned; this tool does not install dependencies.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

let chromium;
let options;
let target;
let widths;
let height;
try {
  options = parseArgs({
    allowPositionals: true,
    options: { route: { type: 'string' }, widths: { type: 'string' }, height: { type: 'string' }, json: { type: 'string' } },
  });
  if (options.positionals.length !== 1) throw new Error('Pass one running docs URL.');
  target = new URL(options.positionals[0]);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Use an HTTP(S) docs URL.');
  target.hash = options.values.route ?? '/components/button';
  widths = (options.values.widths ?? '1440,1100,768,390').split(',').map(Number);
  if (widths.some((width) => !Number.isInteger(width) || width <= 0)) {
    throw new Error('--widths must contain comma-separated positive integers.');
  }
  height = Number(options.values.height ?? 900);
  if (!Number.isInteger(height) || height <= 0) throw new Error('--height must be a positive integer.');
  ({ chromium } = createRequire(`${process.cwd()}/package.json`)('playwright'));
} catch (error) {
  console.error(`check-navigation: ${error.message}\nRun from a directory where playwright resolves.`);
  process.exit(2);
}

const HEIGHT = height;
const TOLERANCE = 4;
const OBSERVATION_MS = 4200;
const report = { url: target.href, height: HEIGHT, checks: [] };
const check = (width, name, pass, details) => {
  report.checks.push({ width, name, pass, details });
  console.log(`${pass ? 'PASS' : 'FAIL'} ${width}px ${name}${pass ? '' : ` ${JSON.stringify(details)}`}`);
};
const near = (a, b) => Math.abs(a - b) <= TOLERANCE;

async function measure(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.nav');
    const rect = nav.getBoundingClientRect();
    const headerBottom = document.querySelector('.top').getBoundingClientRect().bottom;
    const api = document.querySelector('#section-api');
    return {
      y: scrollY,
      top: rect.top,
      bottom: rect.bottom,
      scrollTop: nav.scrollTop,
      clientHeight: nav.clientHeight,
      scrollHeight: nav.scrollHeight,
      headerBottom,
      apiTop: api?.getBoundingClientRect().top ?? null,
      groups: [...nav.querySelectorAll('button[aria-expanded]')].map((button) => [button.id, button.getAttribute('aria-expanded')]),
    };
  });
}

async function observe(page) {
  const samples = [];
  const end = performance.now() + OBSERVATION_MS;
  do {
    samples.push(await measure(page));
    await page.waitForTimeout(100);
  } while (performance.now() < end);
  return samples;
}

async function visibleRoute(page) {
  return page.locator('.nav').evaluate((nav) => {
    const rail = nav.getBoundingClientRect();
    return [...nav.querySelectorAll('a[href*="/components/"]:not([aria-current="page"])')].find((link) => {
      const rect = link.getBoundingClientRect();
      return rect.height > 0 && rect.top >= Math.max(rail.top, 60) && rect.bottom <= Math.min(rail.bottom, innerHeight);
    })?.getAttribute('href') ?? null;
  });
}

async function followRoute(page, href) {
  for (const candidate of await page.locator('.nav a').all()) {
    if (await candidate.getAttribute('href') !== href) continue;
    await candidate.click();
    break;
  }
  await page.waitForFunction((hash) => location.hash === hash, href);
  await page.locator('main h1').waitFor();
  await page.waitForFunction((hash) =>
    document.querySelector('.nav a[aria-current="page"]')?.getAttribute('href') === hash, href);
}

/** The selected link as the reader sees it: which page it is, whether its group is open and whether
 * the rail actually shows it. */
async function landedState(page) {
  return page.evaluate(() => {
    const nav = document.querySelector('.nav');
    const rail = nav.getBoundingClientRect();
    const link = nav.querySelector('a[aria-current="page"]');
    const rect = link?.getBoundingClientRect();
    const group = link?.closest('[role="group"]');
    return {
      href: link?.getAttribute('href') ?? null,
      groupOpen: group ? group.querySelector('button[aria-expanded]')?.getAttribute('aria-expanded') === 'true' : null,
      visible: Boolean(rect && rect.top >= rail.top - 1 && rect.bottom <= rail.bottom + 1),
      scrollTop: nav.scrollTop,
      y: scrollY,
    };
  });
}

/** A component route whose group is collapsed, so a landing has to open it. */
async function collapsedRoute(page) {
  return page.locator('.nav').evaluate((nav) => {
    const groups = [...nav.querySelectorAll('[role="group"]')].filter((group) =>
      group.querySelector('button[aria-expanded="false"]'));
    return groups.at(-1)?.querySelector('a[href*="/components/"]')?.getAttribute('href') ?? null;
  });
}

async function scrollbarStyles(page) {
  return page.evaluate(() => {
    const read = (element) => {
      const style = getComputedStyle(element);
      return { width: style.scrollbarWidth, color: style.scrollbarColor };
    };
    const probe = document.createElement('div');
    probe.style.scrollbarColor = 'var(--sd-text-subtle) transparent';
    document.body.append(probe);
    const railColor = getComputedStyle(probe).scrollbarColor;
    probe.style.scrollbarColor = 'var(--sd-text-subtle) var(--sd-bg)';
    const documentColor = getComputedStyle(probe).scrollbarColor;
    probe.remove();
    return {
      root: read(document.documentElement),
      body: read(document.body),
      nav: read(document.querySelector('.nav')),
      toc: document.querySelector('.toc') ? read(document.querySelector('.toc')) : null,
      railColor,
      documentColor,
    };
  });
}

async function checkScrollbars(page, width) {
  const normal = await scrollbarStyles(page);
  check(width, 'native scrollbars use the chrome palette without leaking into stories',
    normal.root.width === 'auto' && normal.root.color === normal.documentColor &&
    normal.nav.width === 'thin' && normal.nav.color === normal.railColor &&
    (!normal.toc || (normal.toc.width === 'thin' && normal.toc.color === normal.railColor)) &&
    normal.body.color === 'auto', normal);
  await page.emulateMedia({ forcedColors: 'active' });
  const forced = await scrollbarStyles(page);
  check(width, 'forced colors restores native scrollbar width and colors',
    [forced.root, forced.nav, forced.toc].filter(Boolean).every((style) => style.width === 'auto' && style.color === 'auto'), forced);
  await page.emulateMedia({ forcedColors: 'none' });
  if (width <= 1000) return;

  for (const selector of ['.nav', '.toc']) {
    const rail = page.locator(selector);
    if (!(await rail.isVisible())) continue;
    const range = await rail.evaluate((node) => node.scrollHeight - node.clientHeight);
    for (const boundary of range > 0 ? ['inside', 'bottom', 'top'] : ['fitting']) {
      await rail.evaluate((node, boundary) => {
        node.scrollTop = boundary === 'bottom' ? node.scrollHeight : 0;
        window.scrollTo({ top: boundary === 'top' ? 250 : 0, behavior: 'instant' });
      }, boundary);
      const box = await rail.boundingBox();
      await page.mouse.move(box.x + box.width / 2, box.y + Math.min(100, box.height / 2));
      await page.evaluate(() => new Promise((resolve) => requestAnimationFrame(() => requestAnimationFrame(resolve))));
      const delta = { inside: Math.min(30, range), bottom: 200, top: -100, fitting: 200 }[boundary];
      await page.mouse.wheel(0, delta);
      const passed = await page.waitForFunction(({ selector, boundary, minimumRailMovement }) => {
        const node = document.querySelector(selector);
        if (boundary === 'inside') return node.scrollTop >= minimumRailMovement && Math.abs(window.scrollY) <= 4;
        if (boundary === 'top') return window.scrollY < 200 && node.scrollTop <= 4;
        return window.scrollY >= 150;
      }, { selector, boundary, minimumRailMovement: Math.max(1, delta - TOLERANCE) }, { timeout: 1500 }).then(() => true, () => false);
      check(width, `${selector} ${boundary} wheel input reaches its native scroll owner`, passed,
        await rail.evaluate((node) => ({ page: window.scrollY, rail: node.scrollTop, client: node.clientHeight, content: node.scrollHeight })));
    }
    await rail.evaluate((node) => { node.scrollTop = 0; });
  }
  await page.evaluate(() => window.scrollTo({ top: 0, behavior: 'instant' }));
}

const browser = await chromium.launch({ ignoreDefaultArgs: ['--hide-scrollbars'] });
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    try {
      await page.goto(target.href, { waitUntil: 'load' });
      await page.locator('main #section-api').waitFor();
      await page.locator('.toc').waitFor({ state: 'attached' });
      await checkScrollbars(page, width);

      await page.locator('main section > .frame[data-story][id]').nth(1).waitFor();
      const stories = await page.locator('main section > .frame[data-story][id]').evaluateAll((frames) =>
        frames.slice(0, 2).map((frame) => ({ story: frame.getAttribute('data-story'), id: frame.id })));
      check(width, 'same-page story regression has targets', stories.length === 2);
      for (const { story, id } of stories) {
        const destination = new URL(page.url());
        destination.hash = `${destination.hash.split('?')[0]}?story=${encodeURIComponent(story)}`;
        await page.goto(destination.href);
        await page.waitForFunction((id) => {
          const target = document.getElementById(id);
          return target && Math.abs(target.getBoundingClientRect().top - document.querySelector('.top').getBoundingClientRect().bottom) < 65;
        }, id);
        const focused = await page.evaluate((id) => document.activeElement === document.getElementById(id), id);
        check(width, `same-page ${story} link retains destination focus`, focused,
          { expected: id, actual: await page.evaluate(() => document.activeElement?.id) });
      }
      await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));

      const menu = page.getByRole('button', { name: 'Menu', exact: true });
      const mobile = await menu.isVisible();
      if (mobile) {
        check(width, 'mobile navigation starts closed', !(await page.locator('.nav').isVisible()));
        await menu.click();
        await page.locator('.nav').waitFor();
      }

      const extraGroup = page.locator('.nav button[aria-expanded="false"]').first();
      await extraGroup.click();
      const beforeRail = await measure(page);
      const railBox = await page.locator('.nav').boundingBox();
      await page.mouse.move(railBox.x + railBox.width / 2, Math.min(railBox.y + 200, HEIGHT - 100));
      await page.mouse.wheel(0, 300);
      await page.waitForTimeout(250);
      const rail = await measure(page);
      check(width, 'navigation is bounded and independently scrollable',
        rail.top >= rail.headerBottom - TOLERANCE && rail.bottom <= HEIGHT + TOLERANCE &&
        rail.scrollHeight > rail.clientHeight && rail.scrollTop > beforeRail.scrollTop + 100 && near(rail.y, beforeRail.y),
        { before: beforeRail, after: rail });

      if (mobile) {
        const href = await visibleRoute(page);
        check(width, 'mobile menu exposes a usable route', Boolean(href));
        if (href) {
          await followRoute(page, href);
          await page.waitForFunction(() => document.querySelector('.nav-toggle')?.getAttribute('aria-expanded') === 'false');
          check(width, 'route selection closes mobile menu', !(await page.locator('.nav').isVisible()));
          await menu.click();
          await page.locator('.nav').waitFor();
          const reopened = await measure(page);
          const landed = await landedState(page);
          const kept = rail.groups.filter(([, expanded]) => expanded === 'true')
            .every(([id]) => reopened.groups.some(([other, expanded]) => other === id && expanded === 'true'));
          check(width, 'reopening the menu shows the route it landed on and keeps the reader’s groups',
            landed.visible && landed.groupOpen === true && kept, { before: rail, after: reopened, landed });
          await menu.click();
        }
        continue;
      }

      const main = await page.locator('main').boundingBox();
      await page.mouse.move(main.x + main.width / 2, HEIGHT / 2);
      const beforeScroll = await measure(page);
      await page.mouse.wheel(0, 600);
      await page.waitForTimeout(250);
      const afterScroll = await measure(page);
      check(width, 'main scrolling preserves navigation position and groups', afterScroll.y > beforeScroll.y + 100 &&
        near(afterScroll.top, beforeScroll.top) && near(afterScroll.scrollTop, beforeScroll.scrollTop) &&
        JSON.stringify(afterScroll.groups) === JSON.stringify(beforeScroll.groups), { before: beforeScroll, after: afterScroll });

      const apiLink = page.locator('.toc button[title="API"]');
      if (await apiLink.isVisible()) {
        await apiLink.click();
        await page.waitForFunction(() => {
          const top = document.querySelector('#section-api').getBoundingClientRect().top;
          const header = document.querySelector('.top').getBoundingClientRect().bottom;
          return top >= header - 4 && top <= header + 60;
        });
        const landing = await measure(page);
        check(width, 'TOC API clears sticky header', landing.apiTop >= landing.headerBottom - TOLERANCE &&
          landing.apiTop <= landing.headerBottom + 60, landing);
        check(width, 'TOC preserves navigation rail', near(landing.top, afterScroll.top) &&
          near(landing.scrollTop, afterScroll.scrollTop), { before: afterScroll, after: landing });

        for (const input of ['wheel', 'keyboard']) {
          await apiLink.click();
          await page.waitForFunction(() => Math.abs(document.querySelector('#section-api').getBoundingClientRect().top -
            document.querySelector('.top').getBoundingClientRect().bottom) < 65);
          const before = await measure(page);
          await page.mouse.move(main.x + main.width / 2, HEIGHT / 2);
          if (input === 'wheel') await page.mouse.wheel(0, -600);
          else await page.keyboard.press('PageUp');
          await page.waitForTimeout(180);
          const samples = await observe(page);
          const first = samples[0];
          check(width, `manual ${input} is not undone for ${OBSERVATION_MS}ms`, first.y < before.y - 100 &&
            samples.every((sample) => near(sample.y, first.y)), { before: before.y, samples: samples.map((sample) => sample.y) });
        }

        await apiLink.click();
        await page.locator('.toc button[title="Usage"]').first().click();
        await page.waitForFunction(() => {
          const top = document.querySelector('#section-usage')?.getBoundingClientRect().top;
          return top !== undefined && Math.abs(top - document.querySelector('.top').getBoundingClientRect().bottom) < 65;
        });
        const samples = await observe(page);
        check(width, 'latest TOC click supersedes API', samples.every((sample) => near(sample.y, samples[0].y)),
          { samples: samples.map((sample) => sample.y) });

        await page.emulateMedia({ reducedMotion: 'no-preference' });
        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await apiLink.click();
        await page.mouse.move(main.x + main.width / 2, HEIGHT / 2);
        await page.mouse.wheel(0, -600);
        await page.waitForTimeout(250);
        const interrupted = await observe(page);
        check(width, 'normal-motion navigation immediately yields to wheel input', interrupted[0].apiTop > interrupted[0].headerBottom + 100 &&
          interrupted.every((sample) => near(sample.y, interrupted[0].y)), { ys: interrupted.map((sample) => sample.y) });

        await page.evaluate(() => scrollTo({ top: 0, behavior: 'instant' }));
        await apiLink.click();
      } else {
        check(width, 'TOC hidden at narrow desktop width', width < 1180);
      }

      const href = await visibleRoute(page);
      check(width, 'navigation has a visible cross-page link', Boolean(href));
      if (href) {
        const before = await measure(page);
        await followRoute(page, href);
        const samples = await observe(page);
        check(width, 'route supersedes scrolling without resetting navigation', samples.every((sample) =>
          near(sample.top, before.top) && near(sample.scrollTop, before.scrollTop) && sample.y <= TOLERANCE &&
          JSON.stringify(sample.groups) === JSON.stringify(before.groups)), { before, after: samples.at(-1), ys: samples.map((sample) => sample.y) });
      }

      const collapsedHref = await collapsedRoute(page);
      check(width, 'a collapsed destination group is available to test', Boolean(collapsedHref));
      if (collapsedHref) {
        const before = await measure(page);
        await page.evaluate((hash) => { window.location.hash = hash; }, collapsedHref);
        await page.locator('main h1').waitFor();
        await page.waitForFunction((hash) =>
          document.querySelector('.nav a[aria-current="page"]')?.getAttribute('href') === hash, collapsedHref);
        const landed = await landedState(page);
        check(width, 'cross-group route opens its group and reveals the link in the rail',
          landed.groupOpen === true && landed.visible === true && landed.y <= TOLERANCE, { before, landed });

        const settled = await observe(page);
        check(width, 'the reveal settles without a second correction', settled.every((sample) =>
          near(sample.scrollTop, settled[0].scrollTop) && near(sample.y, settled[0].y)),
          { samples: settled.map((sample) => [sample.scrollTop, sample.y]) });

        await page.reload();
        await page.locator('main h1').waitFor();
        await page.waitForFunction((hash) =>
          document.querySelector('.nav a[aria-current="page"]')?.getAttribute('href') === hash, collapsedHref);
        const direct = await landedState(page);
        check(width, 'a direct URL opens its group and reveals the link',
          direct.groupOpen === true && direct.visible === true, direct);
      }
    } catch (error) {
      check(width, 'scenario completes', false, error.message);
    } finally {
      await context.close();
    }
  }
} finally {
  await browser.close();
}

if (options.values.json) writeFileSync(options.values.json, `${JSON.stringify(report, null, 2)}\n`);
const failures = report.checks.filter((entry) => !entry.pass).length;
console.log(`${report.checks.length - failures}/${report.checks.length} navigation checks passed`);
process.exitCode = failures ? 1 : 0;
