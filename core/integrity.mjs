import fs from 'node:fs';
import path from 'node:path';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
export const sha256 = bytes => createHash('sha256').update(bytes).digest('hex');
export function coreFiles(root = fileURLToPath(new URL('../',import.meta.url))) {
  const walk = dir => fs.readdirSync(path.join(root,dir),{withFileTypes:true}).flatMap(entry => entry.isDirectory() ? walk(dir+'/'+entry.name) : [dir+'/'+entry.name]);
  const names=[...walk('core').filter(f=>f.endsWith('.mjs')), 'operations.json', 'scripts/run.mjs'];
  return Object.fromEntries(names.sort().map(name=>[name,sha256(fs.readFileSync(path.join(root,name)))]));
}
export const contentDigest = files => sha256(JSON.stringify(Object.entries(files).sort(([a],[b])=>a.localeCompare(b,'en'))));
