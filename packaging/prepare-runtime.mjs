import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), get = key => args[args.indexOf(key) + 1];
const platform = args.includes('--platform') ? get('--platform') : `${process.platform}-${process.arch}`;
const lock = JSON.parse(fs.readFileSync(new URL('./runtime-lock.json', import.meta.url)));
const spec = lock.node[platform];
if (!spec) throw new Error('不支持的平台：' + platform);
const hdcDir = args.includes('--hdc-dir') ? path.resolve(get('--hdc-dir')) : '/Applications/DevEco-Studio.app/Contents/sdk/default/openharmony/toolchains';
const exe = platform.startsWith('win32') ? '.exe' : '';
const hdc = path.join(hdcDir, 'hdc' + exe);
if (!fs.existsSync(hdc)) throw new Error('SDK toolchains 目录缺少 hdc：' + hdc);
const source = args.includes('--hdc-manifest') ? JSON.parse(fs.readFileSync(get('--hdc-manifest'))) : null;
if (source && source.platform !== platform) throw new Error('hdc 清单平台不符');
const cache = path.join(root, 'build', 'downloads'), output = path.join(root, 'build', 'runtime', platform);
fs.mkdirSync(cache, { recursive: true });
fs.mkdirSync(output, { recursive: true });
const digest = file => createHash('sha256').update(fs.readFileSync(file)).digest('hex');
function run(command, args) { const r = spawnSync(command, args, { stdio: 'inherit', timeout: 300000, windowsHide: true }); if (r.error || r.status !== 0) throw new Error(`${command} 失败：${r.error?.message ?? r.status}`); }
const archive = path.join(cache, spec.file);
if (!fs.existsSync(archive)) {
  const part = archive + '.part';
  run('curl', ['-fL', '--connect-timeout', '20', '--max-time', '240', `https://nodejs.org/dist/v${lock.nodeVersion}/${spec.file}`, '-o', part]);
  if (digest(part) !== spec.sha256) throw new Error('Node 下载校验失败');
  fs.renameSync(part, archive);
}
if (digest(archive) !== spec.sha256) throw new Error('Node 缓存校验失败，请检查并移走损坏文件后重试');
const extraction = fs.mkdtempSync(path.join(os.tmpdir(), 'cyh-runtime-'));
try {
  if (exe) run('tar', ['-xf', archive, '-C', extraction]);
  else run('tar', ['-xzf', archive, '-C', extraction]);
  const extracted = path.join(extraction, spec.file.replace(/\.tar\.gz$|\.zip$/, ''));
  fs.copyFileSync(path.join(extracted, exe ? 'node.exe' : 'bin/node'), path.join(output, 'node' + exe));
  fs.copyFileSync(path.join(extracted, 'LICENSE'), path.join(output, 'NODE-LICENSE'));
} finally { fs.rmSync(extraction, { recursive: true, force: true }); }
const files = source?.files ? Object.keys(source.files) : exe ? ['hdc.exe', ...fs.readdirSync(hdcDir).filter(f => f.endsWith('.dll')), 'NOTICE.txt'] : ['hdc', 'libusb_shared.dylib', 'NOTICE.txt'];
if (!files.includes('hdc' + exe) || !files.includes(exe ? 'libusb_shared.dll' : 'libusb_shared.dylib')) throw new Error('hdc 清单缺少必要工具或 USB 库');
for (const name of files) {
  if (path.basename(name) !== name) throw new Error('工具清单只允许当前目录文件');
  const file = path.join(hdcDir, name);
  if (source && digest(file) !== source.files[name]) throw new Error('hdc 校验失败：' + name);
  fs.copyFileSync(file, path.join(output, name));
}
if (!exe) {
  fs.chmodSync(path.join(output, 'node'), 0o755); fs.chmodSync(path.join(output, 'hdc'), 0o755);
  const expected = platform.endsWith('arm64') ? 'arm64' : 'x86_64';
  for (const name of ['node', 'hdc', 'libusb_shared.dylib']) {
    const result = spawnSync('lipo', ['-archs', path.join(output, name)], { encoding: 'utf8' });
    if (result.status !== 0 || !result.stdout.split(/\s+/).includes(expected)) throw new Error('工具架构不符：' + name);
  }
}
const manifest = { platform, nodeVersion: lock.nodeVersion, nodeSource: `https://nodejs.org/dist/v${lock.nodeVersion}/${spec.file}`, nodeArchiveSHA256: spec.sha256,
  hdcSource: source?.source ?? 'Local SDK; development use only', redistributionReviewed: source?.redistributionReviewed === true,
  files: Object.fromEntries(fs.readdirSync(output).filter(f => f !== 'manifest.json').map(f => [f, digest(path.join(output, f))])) };
fs.writeFileSync(path.join(output, 'manifest.json'), JSON.stringify(manifest, null, 2) + '\n');
console.log(output);
