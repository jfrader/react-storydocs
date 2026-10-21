import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveDecoratorsModule(module: string | undefined, root: string): string | undefined {
  if (!module) return undefined;
  const resolved = path.resolve(root, module);
  if (!existsSync(resolved)) {
    throw new Error(`storybook-docs: decorators.module "${module}" does not exist (looked in ${resolved})`);
  }
  return resolved;
}

export function decoratorsModuleCode(resolved: string | undefined): string {
  if (!resolved) return 'export const decorators = [];';
  return `import * as mod from ${JSON.stringify(resolved)};\nconst exported = mod.default ?? [];\nexport const decorators = Array.isArray(exported) ? exported : [exported];\n`;
}
