import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import assert from 'node:assert/strict';
import {createHash} from 'node:crypto';
import {spawn, spawnSync} from 'node:child_process';
import readline from 'node:readline';
import { coreFiles, contentDigest } from '../core/integrity.mjs';

const root = path.resolve(process.argv[2]);
const engine = path.join(root,'engine');
const source = JSON.parse(fs.readFileSync(path.join(engine,'core-source.json')));
assert.match(source.commit,/^[a-f0-9]{40}$/);
assert.deepEqual(coreFiles(engine),source.files);
assert.equal(contentDigest(source.files),source.digest);
console.log('PASS: packaged core source ' + source.commit + ' ' + source.digest);
const runtime = path.join(root, 'runtime');
const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'manifest.json')));
assert.equal(manifest.redistributionReviewed, true);
for (const [file, hash] of Object.entries(manifest.files)) {
  assert.equal(createHash('sha256').update(fs.readFileSync(path.join(runtime,file))).digest('hex'), hash, file);
}
const windows = process.platform === 'win32';
const suffix = windows ? '.exe' : '';
const env = {...process.env, PATH: windows ? `${process.env.SystemRoot}\\System32;${process.env.SystemRoot}` : '/usr/bin:/bin:/usr/sbin:/sbin'};
delete env.NODE_OPTIONS; delete env.NODE_PATH;
for (const [file, args, expected] of [['node',['--version'],`v${manifest.nodeVersion}`], ['hdc',['-v'],'Ver:']]) {
  const result = spawnSync(path.join(runtime,file + suffix),args,{env,encoding:'utf8',timeout:15000});
  assert.equal(result.status,0, `${file}: ${result.error ?? result.stderr}`);
  assert.ok(result.stdout.includes(expected),result.stdout);
  console.log(`${file}: ${result.stdout.trim()}`);
}
const data = fs.mkdtempSync(path.join(os.tmpdir(),'cyh 包验证 '));
const host = spawn(path.join(runtime,'node' + suffix),[path.join(root,'engine/scripts/desktop-host.mjs'),'--hdc',path.join(runtime,'hdc' + suffix),'--data-dir',data],{env,stdio:['pipe','pipe','pipe']});
let stderr = ''; host.stderr.on('data',chunk => stderr += chunk);
const replies = new Map();
const input = readline.createInterface({input:host.stdout});
input.on('line',line => { const value = JSON.parse(line); replies.get(value.id)?.(value); });
const exit = new Promise((resolve,reject) => { host.on('error',reject); host.on('exit',code => code === 0 ? resolve() : reject(Error(`Host exit ${code}: ${stderr}`))); });
function request(id, method, params) {
  return new Promise((resolve,reject) => {
    const timer = setTimeout(() => reject(Error('Host response timeout: ' + id)),15000);
    replies.set(id,value => { clearTimeout(timer); value.error ? reject(Error(value.error)) : resolve(value.result); });
    host.stdin.write(JSON.stringify({id,method,params}) + '\n');
  });
}
const timeout = setTimeout(() => host.kill(),45000);
try {
  const catalog = await request('catalog','catalog');
  assert.equal(catalog.operations.length,22);
  assert.equal(catalog.categories[0].name,'浏览器');
  const plan = await request('plan','plan',{selection:[{id:'B01',target:'simple'},{id:'B02',target:false}]});
  assert.deepEqual(plan.flatMap(page => page.items).sort(),['B01','B02']);
  assert.equal(await request('shutdown','shutdown'),true);
  await exit;
  console.log('PASS: packaged checksums, native dependencies, isolated PATH, real host catalog/selection/shutdown');
} finally {
  clearTimeout(timeout); input.close();
  if (host.exitCode === null) host.kill();
  fs.rmSync(data,{recursive:true,force:true});
}
