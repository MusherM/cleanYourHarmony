#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { fileURLToPath } from 'node:url';
import { plan } from './routes.mjs';
import { Device } from './device.mjs';
import { Navigator } from './navigator.mjs';
import { capture, dnd, hash, now, runPages, save } from './runner.mjs';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const args = process.argv.slice(2);
const value = key => { const i = args.indexOf(key); if (i < 0) return null; if (!args[i+1] || args[i+1].startsWith('--')) throw new Error(`${key} 缺少参数`); return args[i+1]; };
const allowed = new Set(['--plan', '--execute', '--resume', '--device', '--hdc']);
for (let i=0;i<args.length;i++) { if (!allowed.has(args[i])) throw new Error(`未知参数 ${args[i]}`); if (['--resume','--device','--hdc'].includes(args[i])) i++; }
const catalogText = fs.readFileSync(path.join(root, 'operations.json'), 'utf8');
const pages = plan(JSON.parse(catalogText));
if (!args.includes('--execute')) {
  console.log(JSON.stringify({ mode: 'plan', deviceActions: false, operations: pages.flatMap(p => p.operations).length,
    pages: pages.map(p => ({ page: p.key, operations: p.operations.map(o => o.id) })) }, null, 2));
} else {
  let lock, lockHeld = false, progress, persist, nav, device, dir;
  let interrupted = false;
  process.on('SIGINT', () => { interrupted = true; });
  process.on('SIGTERM', () => { interrupted = true; });
  try {
    const ids = Device.list(value('--hdc') ?? 'hdc');
    const selected = value('--device') ?? (ids.length === 1 ? ids[0] : null);
    if (!selected || !ids.includes(selected)) throw new Error(ids.length ? '连接多台设备，请用 --device 指定目标' : '未检测到设备；Agent 应按 README 检查工具、USB 调试及授权');
    // Cross-run exclusive lease. A stale lease must be inspected, never auto-stolen.
    lock = path.join(os.tmpdir(), `cyh-device-${hash(selected).slice(0,16)}.lock`);
    fs.mkdirSync(lock); lockHeld = true;
    fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, at: now() }));
    dir = value('--resume') ? path.resolve(value('--resume')) : path.join(root, 'dev', 'device-run', 'evidence_' + now().replace(/[:+]/g, '-') + '_' + process.pid);
    fs.mkdirSync(dir, { recursive: true, mode: 0o700 });
    const progressFile = path.join(dir, 'progress.json');
    const logFile = path.join(dir, 'commands.jsonl');
    device = new Device(selected, data => fs.appendFileSync(logFile, JSON.stringify({ at: now(), ...data }) + '\n'), value('--hdc') ?? 'hdc');
    const info = device.info(), fingerprint = hash(selected + JSON.stringify(info));
    progress = value('--resume') ? JSON.parse(fs.readFileSync(progressFile, 'utf8')) : {
      schemaVersion: 1, startedAt: now(), fingerprint, device: info, catalogHash: hash(catalogText),
      selected: pages.flatMap(p => p.operations.map(o => o.id)), items: {}, failures: [], dnd: null,
    };
    if (progress.fingerprint !== fingerprint || progress.catalogHash !== hash(catalogText)) throw new Error('设备/版本或清单变化，不能复用旧进度；请开始新运行');
    persist = () => { progress.updatedAt = now(); save(progressFile, progress); };
    progress.status = 'running'; delete progress.finishedAt;
    progress.attempts ??= [];
    progress.attempts.push({ at: now(), sources: Object.fromEntries(['run.mjs','runner.mjs','navigator.mjs','device.mjs','ui-tree.mjs','routes.mjs'].map(f => [f,hash(fs.readFileSync(path.join(root,'scripts',f)))])) });
    persist();
    const evidence = tag => capture(device, dir, tag);
    nav = new Navigator(device, () => interrupted);
    nav.onReturn = page => {
      if (page.family === 'F' && page.route.join('/') === '更多/设置' && ['F01','F02','F03','F04'].every(id => ['passed','unchanged'].includes(progress.items[id]?.status))) {
        const covered = ['F01','F02','F03','F04'].filter(id => ['passed','unchanged'].includes(progress.items[id]?.status));
        const previous = progress.overview?.covered ?? [];
        if (covered.join() !== previous.join()) { progress.overview = { covered, evidence: evidence('G03-parent') }; persist(); }
      }
    };
    console.log(`证据目录：${dir}`);
    if (progress.dnd?.restorePending) await dnd({ nav, device, progress, persist, evidence, restore: true });
    try {
      await dnd({ nav, device, progress, persist, evidence });
      await runPages({ pages, device, nav, progress, persist, evidence, cancelled: () => interrupted });
    } finally {
      // Cleanup ignores cancellation and retains the last verified route; failures reset it.
      if (progress.dnd?.restorePending) {
        nav.cancelled = () => false;
        await dnd({ nav, device, progress, persist, evidence, restore: true });
      }
    }
    progress.finishedAt = now();
    progress.executionCompleted = !interrupted && !progress.dnd?.restorePending && progress.selected.every(id => ['passed','unchanged','not_found'].includes(progress.items[id]?.status) || progress.items[id]?.failureKind === 'disabled');
    progress.status = !progress.executionCompleted ? 'incomplete' : progress.selected.some(id => progress.items[id]?.status === 'failed') ? 'completed_with_failures' : progress.selected.some(id => progress.items[id]?.status === 'not_found') ? 'completed_with_missing' : 'completed';
    persist();
    console.log(`结果：${progress.status}；勿扰：${progress.dnd?.enableError ? '准备失败（见进度）' : '已检查'}；${progressFile}`);
    process.exitCode = ['completed','completed_with_missing'].includes(progress.status) ? 0 : 2;
  } catch (e) {
    if (progress && persist) { progress.status = 'incomplete'; progress.stopReason = e.message; progress.finishedAt = now(); persist(); }
    console.error(e.message); process.exitCode = 2;
  }
  finally {
    try { device?.cleanup(); }
    catch (e) {
      process.exitCode = 2;
      if (progress && persist) {
        progress.status = 'incomplete'; progress.executionCompleted = false;
        progress.cleanupError = e.message; progress.finishedAt = now(); persist();
      }
      console.error('临时文件清理失败：' + e.message);
    } finally { if (lockHeld) fs.rmSync(lock, { recursive: true }); }
  }
}
