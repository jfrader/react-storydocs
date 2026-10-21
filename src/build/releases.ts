import { existsSync, readFileSync } from 'node:fs';
import path from 'node:path';
import type { ReactStorydocsConfig } from '../config.js';

export interface Releases {
  version: string | null;
  changelog: string | null;
}

export function readReleases(config: ReactStorydocsConfig, root: string): Releases {
  const readIfPresent = (candidate: string | undefined): string | null => {
    if (!candidate) return null;
    const resolved = path.resolve(root, candidate);
    return existsSync(resolved) ? readFileSync(resolved, 'utf8') : null;
  };
  let version = config.site.version ?? null;
  if (!version && config.releases?.versionFrom) {
    const manifest = readIfPresent(config.releases.versionFrom);
    if (manifest) {
      try {
        version = (JSON.parse(manifest) as { version?: string }).version ?? null;
      } catch {
        version = null;
      }
    }
  }
  const changelog = readIfPresent(config.releases?.changelog);
  return { version, changelog };
}

export function releasesCode(releases: Releases): string {
  return `export const releases = ${JSON.stringify(releases)};`;
}
