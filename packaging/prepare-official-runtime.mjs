import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import {createHash} from 'node:crypto';
import {spawnSync} from 'node:child_process';
import {fileURLToPath} from 'node:url';

const root = fileURLToPath(new URL('../', import.meta.url));
const lock = JSON.parse(fs.readFileSync(new URL('./runtime-lock.json', import.meta.url)));
const platform = process.argv[2] ?? `${process.platform}-${process.arch}`;
const spec = lock.hdcSdk.archives[platform];
if (!spec) throw Error('Unsupported runtime platform: ' + platform);
const cache = path.join(root, 'build/downloads');
fs.mkdirSync(cache, {recursive:true});
async function digest(file) {
  const hash = createHash('sha256');
  for await (const chunk of fs.createReadStream(file)) hash.update(chunk);
  return hash.digest('hex');
}
function run(command, args, capture = false) {
  const result = spawnSync(command, args, {stdio:capture?'pipe':'inherit', encoding:'utf8', maxBuffer:8*1024*1024, timeout:3600000, windowsHide:true});
  if (result.error || result.status !== 0) throw Error(`${command}: ${result.error?.message ?? result.stderr ?? result.status}`);
  return result.stdout;
}
async function download(url, name, sha256) {
  const file = path.join(cache, name);
  if (!fs.existsSync(file)) {
    const part = file + '.part';
    run('curl', ['-fL','--retry','4','--retry-all-errors','--connect-timeout','30','--max-time','3300','-C','-',url,'-o',part]);
    if (await digest(part) !== sha256) throw Error('Download checksum mismatch: ' + name);
    fs.renameSync(part,file);
  }
  if (await digest(file) !== sha256) throw Error('Cached download checksum mismatch: ' + name);
  return file;
}
const archive = await download(lock.hdcSdk.baseUrl + spec.file, spec.file, spec.sha256);
const libusb = await download(lock.libusbSource.url, 'libusb-source.tar.gz', lock.libusbSource.sha256);
const work = fs.mkdtempSync(path.join(os.tmpdir(), 'cyh-official-tools-'));
try {
  const entries = run('tar',['-tzf',archive],true).split(/\r?\n/);
  const system = platform.startsWith('win32') ? 'windows' : 'darwin';
  const candidates = entries.filter(name => /(?:^|\/)toolchains-[^/]+\.zip$/.test(name) && name.includes(`toolchains-${system}-`));
  if (candidates.length !== 1) throw Error('Expected exactly one platform toolchains archive: ' + candidates.join(', '));
  run('tar',['-xzf',archive,'-C',work,candidates[0]]);
  const tools = path.join(work,'tools'); fs.mkdirSync(tools);
  run('tar',['-xf',path.join(work,candidates[0]),'-C',tools]);
  const executable = platform.startsWith('win32') ? 'hdc.exe' : 'hdc';
  function find(directory) {
    return fs.readdirSync(directory,{withFileTypes:true}).flatMap(entry => {
      const file = path.join(directory,entry.name);
      return entry.isDirectory() ? find(file) : entry.name === executable ? [file] : [];
    });
  }
  const binaries = find(tools);
  if (binaries.length !== 1) throw Error('Expected exactly one HDC executable');
  const hdcDirectory = path.dirname(binaries[0]);
  const files = [executable, 'NOTICE.txt', ...fs.readdirSync(hdcDirectory).filter(name => system === 'windows' ? name.endsWith('.dll') : name === 'libusb_shared.dylib')];
  fs.copyFileSync(libusb,path.join(hdcDirectory,'LIBUSB-SOURCE.tar.gz'));
  fs.writeFileSync(path.join(hdcDirectory,'THIRD-PARTY-NOTICES.txt'), `Bundled tools: ${lock.hdcSdk.version}\nSDK archive: ${lock.hdcSdk.baseUrl + spec.file}\nSDK SHA-256: ${spec.sha256}\nRelease license statement: ${lock.hdcSdk.licenseSource}\nHDC source (Apache-2.0): ${lock.hdcSdk.hdcSource}\nlibusb corresponding source (including patches and build files): ${lock.libusbSource.url}\nThe complete libusb source is included as LIBUSB-SOURCE.tar.gz. Component licenses and copyright notices are preserved in NOTICE.txt.\n\nlibusb is dynamically linked. You may replace the library with a compatible modified build. On macOS, replacing a library invalidates the ad-hoc signature; re-sign the modified library and app locally with codesign --force --sign - before running your modified copy. No device credentials or signing certificate are required by this app.\n`);
  files.push('LIBUSB-SOURCE.tar.gz','THIRD-PARTY-NOTICES.txt');
  const manifest = {platform, source:lock.hdcSdk.baseUrl + spec.file, redistributionReviewed:true, files:Object.fromEntries(await Promise.all(files.map(async name => [name, await digest(path.join(hdcDirectory,name))])))};
  const manifestPath = path.join(work,'hdc-manifest.json'); fs.writeFileSync(manifestPath,JSON.stringify(manifest,null,2));
  run(process.execPath,[path.join(root,'packaging/prepare-runtime.mjs'),'--platform',platform,'--hdc-dir',hdcDirectory,'--hdc-manifest',manifestPath]);
} finally { fs.rmSync(work,{recursive:true,force:true}); }
