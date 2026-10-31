import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { execFileSync } from 'node:child_process';
import { coreFiles, contentDigest } from '../core/integrity.mjs';
export function copyEngine(root, destination) {
  execFileSync(process.execPath,[path.join(root,'scripts/check-core.mjs')],{cwd:root,stdio:'inherit'});
  fs.mkdirSync(path.join(destination,'scripts'),{recursive:true});
  fs.cpSync(path.join(root,'core'),path.join(destination,'core'),{recursive:true});
  for (const name of ['run','desktop-host','desktop-worker']) fs.copyFileSync(path.join(root,'scripts',name+'.mjs'),path.join(destination,'scripts',name+'.mjs'));
  for (const name of ['operations.json','core-source.json']) fs.copyFileSync(path.join(root,name),path.join(destination,name));
  const source=JSON.parse(fs.readFileSync(path.join(destination,'core-source.json')));
  if (contentDigest(coreFiles(destination))!==source.digest) throw new Error('打包内核摘要不符');
}
if (process.argv[1] && path.resolve(process.argv[1])===fileURLToPath(import.meta.url)) {
  if (!process.argv[2]) throw new Error('需要目标 engine 目录');
  copyEngine(fileURLToPath(new URL('../',import.meta.url)),path.resolve(process.argv[2]));
}
