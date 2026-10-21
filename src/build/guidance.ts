import { existsSync, readdirSync } from 'node:fs';
import path from 'node:path';
import type { ReactStorydocsConfig } from '../config.js';
import { VIRTUAL_PREFIX } from './module-ids.ts';

export function indexGuidance(guidance: ReactStorydocsConfig['guidance'], root: string): Map<string, string> {
  const files = new Map<string, string>();
  for (const dir of [guidance?.dir ?? []].flat()) {
    const directory = path.resolve(root, dir);
    if (!existsSync(directory)) continue;
    for (const file of readdirSync(directory)) {
      if (!file.endsWith('.md')) continue;
      files.set(file.slice(0, -'.md'.length), path.join(directory, file));
    }
  }
  return files;
}

export function guidanceIndexCode(slugs: Iterable<string>): string {
  return `
export function loadGuidance(slug) {
  switch (slug) {
${[...slugs].map((slug) => `    case ${JSON.stringify(slug)}: return import(${JSON.stringify(`${VIRTUAL_PREFIX}guidance/${slug}`)});`).join('\n')}
    default: return Promise.resolve({ markdown: '' });
  }
}
`;
}

export function guidanceCode(markdown: string): string {
  return `export const markdown = ${JSON.stringify(markdown)};`;
}
