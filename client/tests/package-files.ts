import { readFileSync } from 'node:fs';

export function packageFile(world: string, filename: string) {
  return readFileSync(new URL('../../content/public/worlds/' + world + '/' + filename, import.meta.url));
}

export function packageJson(world: string, filename: string) {
  return JSON.parse(packageFile(world, filename).toString('utf8'));
}
