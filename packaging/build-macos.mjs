import fs from 'node:fs';
import path from 'node:path';
import { spawnSync } from 'node:child_process';
import { createHash } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { createMacOSDiskImage } from './create-macos-dmg.mjs';
const root = fileURLToPath(new URL('../', import.meta.url));
const args = process.argv.slice(2), arg = key => args[args.indexOf(key) + 1];
const arch = args.includes('--arch') ? arg('--arch') : process.arch;
if (!['arm64','x64'].includes(arch) || process.platform !== 'darwin') throw new Error('需要 macOS 构建主机和 arm64/x64 目标');
const runtime = path.join(root, 'build', 'runtime', `darwin-${arch}`);
const manifest = JSON.parse(fs.readFileSync(path.join(runtime, 'manifest.json')));
for (const [file, expected] of Object.entries(manifest.files)) if (createHash('sha256').update(fs.readFileSync(path.join(runtime,file))).digest('hex') !== expected) throw new Error('工具校验失败：' + file);
const release = args.includes('--release');
if (args.includes('--distributable') && !manifest.redistributionReviewed) throw new Error('分发包需要已核验的工具来源与许可证');
if (release && (!manifest.redistributionReviewed || !process.env.CYH_SIGN_IDENTITY || !process.env.CYH_NOTARY_PROFILE)) throw new Error('发布需要已审核的工具分发清单、CYH_SIGN_IDENTITY 和 CYH_NOTARY_PROFILE');
const destination = path.join(root, 'dist', `macos-${arch}`), app = path.join(destination, 'cleanYourHarmony.app');
if (fs.existsSync(app)) fs.rmSync(app, { recursive: true });
const contents = path.join(app, 'Contents'), resources = path.join(contents, 'Resources');
fs.mkdirSync(path.join(contents, 'MacOS'), { recursive: true });
fs.mkdirSync(path.join(resources, 'engine'), { recursive: true });
function run(command, args) { const r = spawnSync(command, args, { stdio:'inherit', timeout:300000 }); if (r.error || r.status !== 0) throw new Error(`${command} 失败：${r.error?.message ?? r.status}`); }
fs.cpSync(runtime, path.join(resources, 'runtime'), { recursive: true });
fs.cpSync(path.join(root, 'scripts'), path.join(resources, 'engine', 'scripts'), { recursive: true, filter: s => !s.endsWith('.test.mjs') && !s.includes('/fixtures') });
fs.copyFileSync(path.join(root, 'operations.json'), path.join(resources, 'engine', 'operations.json'));
fs.writeFileSync(path.join(contents, 'Info.plist'), `<?xml version="1.0" encoding="UTF-8"?><!DOCTYPE plist PUBLIC "-//Apple//DTD PLIST 1.0//EN" "http://www.apple.com/DTDs/PropertyList-1.0.dtd"><plist version="1.0"><dict><key>CFBundleExecutable</key><string>cleanYourHarmony</string><key>CFBundleIdentifier</key><string>app.cleanyourharmony.desktop</string><key>CFBundleName</key><string>cleanYourHarmony</string><key>CFBundleVersion</key><string>2</string><key>CFBundleShortVersionString</key><string>1.1.0</string><key>CFBundlePackageType</key><string>APPL</string><key>LSMinimumSystemVersion</key><string>13.5</string><key>NSHighResolutionCapable</key><true/></dict></plist>`);
run('swiftc', ['-swift-version','5','-parse-as-library','-O','-target',`${arch === 'x64' ? 'x86_64' : 'arm64'}-apple-macosx13.5`,'-module-cache-path',path.join(root,'build','swift-cache'),path.join(root,'desktop','macos','App.swift'),'-o',path.join(contents,'MacOS','cleanYourHarmony')]);
const identity = release ? process.env.CYH_SIGN_IDENTITY : '-';
const signing = release ? ['--options','runtime','--timestamp'] : [];
for (const file of ['libusb_shared.dylib','hdc','node']) {
  const entitlements = file === 'node' ? ['--entitlements',path.join(root,'packaging','node-entitlements.plist')] : [];
  run('codesign',['--force','--sign',identity,...signing,...entitlements,path.join(resources,'runtime',file)]);
}
manifest.sourceFiles = {...manifest.files};
for (const file of Object.keys(manifest.files)) manifest.files[file] = createHash('sha256').update(fs.readFileSync(path.join(resources,'runtime',file))).digest('hex');
fs.writeFileSync(path.join(resources,'runtime','manifest.json'), JSON.stringify(manifest,null,2) + '\n');
run('codesign',['--force','--sign',identity,...signing,app]);
run('codesign',['--verify','--deep','--strict',app]);
if (args.includes('--dmg') || release) {
  const dmg = path.join(destination, `cleanYourHarmony-${arch}.dmg`);
  createMacOSDiskImage(app, dmg);
  if (release) {
    run('codesign',['--sign',identity,'--timestamp',dmg]);
    run('xcrun',['notarytool','submit',dmg,'--keychain-profile',process.env.CYH_NOTARY_PROFILE,'--wait']);
    run('xcrun',['stapler','staple',dmg]);run('xcrun',['stapler','validate',dmg]);
  }
}
console.log(`${release ? 'Release' : 'Development (ad-hoc signed)'}: ${app}`);
