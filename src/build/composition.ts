import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveCompositionModule(module: string | undefined, root: string): string | undefined {
  if (!module) return undefined;
  const resolved = path.resolve(root, module);
  if (!existsSync(resolved)) {
    throw new Error(`storybook-docs: composition.module "${module}" does not exist (looked in ${resolved})`);
  }
  return resolved;
}

export function compositionModuleCode(resolved: string | undefined): string {
  if (!resolved) return 'export const provided = false;\nexport const Composition = undefined;\n';
  return `import { lazy } from 'react';\nexport const Composition = lazy(() => import(${JSON.stringify(resolved)}));\nexport const provided = true;\n`;
}
