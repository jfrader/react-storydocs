#!/usr/bin/env node
/**
 * Browser regression checks against a running docs site. Run from a directory with Playwright:
 * node /path/to/check-navigation.mjs http://localhost:4346 [--route /components/button]
 *   [--widths 1440,1100,768,390] [--json /path/to/results.json]
 * Playwright and Chromium are caller-owned; this tool does not install dependencies.
 */
import { createRequire } from 'node:module';
import { writeFileSync } from 'node:fs';
import { parseArgs } from 'node:util';

let chromium;
let options;
let target;
let widths;
try {
  options = parseArgs({
    allowPositionals: true,
    options: { route: { type: 'string' }, widths: { type: 'string' }, json: { type: 'string' } },
  });
  if (options.positionals.length !== 1) throw new Error('Pass one running docs URL.');
  target = new URL(options.positionals[0]);
  if (!['http:', 'https:'].includes(target.protocol)) throw new Error('Use an HTTP(S) docs URL.');
  target.hash = options.values.route ?? '/components/button';
  widths = (options.values.widths ?? '1440,1100,768,390').split(',').map(Number);
  if (widths.some((width) => !Number.isInteger(width) || width <= 0)) {
    throw new Error('--widths must contain comma-separated positive integers.');
  }
  ({ chromium } = createRequire(`${process.cwd()}/package.json`)('playwright'));
} catch (error) {
  console.error(`check-navigation: ${error.message}\nRun from a directory where playwright resolves.`);
  process.exit(2);
}

const HEIGHT = 900;
const TOLERANCE = 4;
const OBSERVATION_MS = 4200;
const report = { url: target.href, checks: [] };
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

const browser = await chromium.launch();
try {
  for (const width of widths) {
    const context = await browser.newContext({ viewport: { width, height: HEIGHT }, reducedMotion: 'reduce' });
    const page = await context.newPage();
    page.setDefaultTimeout(10000);
    try {
      await page.goto(target.href, { waitUntil: 'load' });
      await page.locator('main #section-api').waitFor();

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
          check(width, 'reopened menu retains scroll and groups', near(rail.scrollTop, reopened.scrollTop) &&
            JSON.stringify(rail.groups) === JSON.stringify(reopened.groups), { before: rail, after: reopened });
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
