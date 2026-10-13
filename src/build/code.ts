import { existsSync } from 'node:fs';
import path from 'node:path';

export function resolveCodeModule(module: string | undefined, root: string): string | undefined {
  if (!module) return undefined;
  const resolved = path.resolve(root, module);
  if (!existsSync(resolved)) {
    throw new Error(`storybook-docs: code.module "${module}" does not exist (looked in ${resolved})`);
  }
  return resolved;
}

export function codeModuleCode(resolved: string | undefined): string {
  if (!resolved) return 'export const provided = false;\nexport const Code = undefined;\n';
  return `import { lazy } from 'react';\nexport const Code = lazy(() => import(${JSON.stringify(resolved)}));\nexport const provided = true;\n`;
}
