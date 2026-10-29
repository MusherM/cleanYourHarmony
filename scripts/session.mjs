import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readCatalog, resolveSelection } from './catalog.mjs';
import { plan } from './routes.mjs';
import { Device } from './device.mjs';
import { Navigator } from './navigator.mjs';
import { capture, dnd, hash, now, runPages, save } from './runner.mjs';

export function dataRoot() {
  return path.join(process.platform === 'darwin' ? path.join(os.homedir(), 'Library', 'Application Support') :
    process.env.LOCALAPPDATA || path.join(os.homedir(), '.local', 'share'), 'cleanYourHarmony');
}
export function acquireDevice(id) {
  const lock = path.join(os.tmpdir(), `cyh-device-${hash(id).slice(0,16)}.lock`);
  try { fs.mkdirSync(lock); }
  catch (e) {
    if (e.code !== 'EEXIST') throw e;
    const busy = () => new Error('设备被占用；请先结束其他执行任务。锁位置：' + lock);
    let owner;
    try { owner = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'))); } catch { throw busy(); }
    if (!Number.isSafeInteger(owner.pid) || owner.pid <= 0) throw busy();
    try { process.kill(owner.pid, 0); throw busy(); }
    catch (error) { if (error.code !== 'ESRCH') throw busy(); }
    // Claim stale-lock recovery with an exclusive marker. Never remove a live
    // process's lease, or race another app trying to reclaim the same lease.
    const marker = path.join(lock, 'reclaim');
    let fd;
    try { fd = fs.openSync(marker, 'wx'); } catch { throw busy(); }
    try {
      const current = JSON.parse(fs.readFileSync(path.join(lock, 'owner.json')));
      if (current.pid !== owner.pid || current.token !== owner.token) throw busy();
    } finally { fs.closeSync(fd); }
    fs.rmSync(lock, { recursive: true });
    try { fs.mkdirSync(lock); } catch { throw busy(); }
  }
  const token = randomUUID();
  fs.writeFileSync(path.join(lock, 'owner.json'), JSON.stringify({ pid: process.pid, token, at: now() }));
  return () => {
    if (JSON.parse(fs.readFileSync(path.join(lock, 'owner.json'))).token === token) fs.rmSync(lock, { recursive: true });
  };
}
export function discoverRuns(root = dataRoot()) {
  const dir = path.join(root, 'runs');
  if (!fs.existsSync(dir)) return [];
  return fs.readdirSync(dir).flatMap(name => {
    try {
      const directory = path.join(dir, name), p = JSON.parse(fs.readFileSync(path.join(directory, 'progress.json')));
      return p.deviceId && (p.dnd?.restorePending || !['completed', 'completed_with_missing', 'completed_with_failures'].includes(p.status)) ?
        [{ directory, runId: p.runId, deviceId: p.deviceId, model: p.device?.model, restorePending: Boolean(p.dnd?.restorePending), request: p.request, status: p.status }] : [];
    } catch { return []; }
  });
}
export function finalStatus(progress, cancelled) {
  const terminal = progress.selected.every(id => ['passed', 'unchanged', 'not_found'].includes(progress.items[id]?.status) || progress.items[id]?.failureKind === 'disabled');
  if (cancelled || !terminal || progress.stopReason || progress.dnd?.restorePending || progress.dnd?.enableError || progress.cleanupError) return 'incomplete';
  if (progress.selected.some(id => progress.items[id]?.status === 'failed')) return 'completed_with_failures';
  if (progress.selected.some(id => progress.items[id]?.status === 'not_found')) return 'completed_with_missing';
  return 'completed';
}
export async function executeSession({ request, hdc, root = dataRoot(), resume, recoveryOnly = false, cancelled = () => false, emit = () => {}, DeviceClass = Device, NavigatorClass = Navigator }) {
  const catalog = readCatalog(), operations = resolveSelection(catalog, request.selection);
  const normalized = operations.map(o => ({ id: o.id, target: o.requestedTarget }));
  const requestHash = hash(JSON.stringify({ deviceId: request.deviceId, selection: normalized }));
  if (!request.deviceId || typeof request.deviceId !== 'string') throw new Error('请选择目标设备');
  const pages = plan(catalog, operations);
  let release, device, nav, progress, persist, evidence, directory, recoveryAttempted = false;
  try {
    release = acquireDevice(request.deviceId);
    directory = resume ? path.resolve(resume) : path.join(root, 'runs', `${now().replace(/[:+]/g, '-')}_${randomUUID()}`);
    const pending = discoverRuns(root).find(r => r.deviceId === request.deviceId && r.restorePending && r.directory !== directory);
    if (pending) throw new Error('存在待恢复勿扰的任务，请先恢复该任务：' + pending.directory);
    fs.mkdirSync(directory, { recursive: true, mode: 0o700 });
    const progressFile = path.join(directory, 'progress.json');
    progress = resume ? JSON.parse(fs.readFileSync(progressFile)) : {
      schemaVersion: 2, runId: randomUUID(), startedAt: now(), deviceId: request.deviceId,
      catalogHash: hash(JSON.stringify(catalog)), requestHash,
      request: { deviceId: request.deviceId, selection: normalized }, selected: normalized.map(o => o.id),
      items: {}, failures: [], dnd: null,
    };
    if (progress.deviceId !== request.deviceId) throw new Error('设备不符，不能恢复此任务');
    persist = () => { progress.updatedAt = now(); save(progressFile, progress); emit({ event: 'progress', directory, progress }); };
    device = new DeviceClass(request.deviceId, entry => fs.appendFileSync(path.join(directory, 'commands.jsonl'), JSON.stringify({ at: now(), ...entry }) + '\n'), hdc);
    nav = new NavigatorClass(device, cancelled);
    evidence = tag => capture(device, directory, tag);
    // A recovery obligation survives catalog and request changes. Restore first,
    // but never run old business operations against a changed fingerprint.
    if (progress.dnd?.restorePending) {
      recoveryAttempted = true;
      nav.cancelled = () => false;
      await dnd({ nav, device, progress, persist, evidence, restore: true });
      nav.cancelled = cancelled;
      recoveryAttempted = false;
    }
    if (recoveryOnly) { progress.status = 'incomplete'; progress.stopReason = '勿扰已恢复，业务项目未继续'; persist(); return { directory, progress }; }
    if (resume && (progress.requestHash !== requestHash || progress.catalogHash !== hash(JSON.stringify(catalog)))) throw new Error('目标或清单已改变，不能续跑；请开始新任务');
    progress.status = 'running'; delete progress.finishedAt; delete progress.stopReason; persist();
    const info = device.info([...new Set(['N', ...pages.map(p => p.family)])]);
    const fingerprint = hash(request.deviceId + JSON.stringify(info));
    if (progress.fingerprint && progress.fingerprint !== fingerprint) throw new Error('设备或应用版本已变化，不能续跑');
    progress.device = info; progress.fingerprint = fingerprint;
    progress.attempts ??= [];
    progress.attempts.push({ at: now(), sources: Object.fromEntries(['session.mjs','runner.mjs','navigator.mjs','device.mjs','ui-tree.mjs','routes.mjs','catalog.mjs'].map(f => [f, hash(fs.readFileSync(fileURLToPath(new URL(f, import.meta.url))))])) });
    persist();
    nav.onReturn = page => {
      if (page.family !== 'F' || page.route.join('/') !== '更多/设置') return;
      const covered = ['F01','F02','F03','F04'].filter(id => progress.selected.includes(id) && ['passed','unchanged'].includes(progress.items[id]?.status));
      if (covered.length && covered.join() !== (progress.overview?.covered ?? []).join()) { progress.overview = { covered, evidence: evidence('G03-parent') }; persist(); }
    };
    if (!cancelled()) {
      await dnd({ nav, device, progress, persist, evidence });
      await runPages({ pages, device, nav, progress, persist, evidence, cancelled });
    }
  } catch (e) {
    if (!progress || !persist) throw e;
    progress.stopReason = e.message; progress.status = 'incomplete'; persist();
  } finally {
    if (progress && persist) {
      if (progress.dnd?.restorePending && nav && !recoveryAttempted) {
        nav.cancelled = () => false;
        try { await dnd({ nav, device, progress, persist, evidence, restore: true }); }
        catch (e) { progress.stopReason = e.message; }
      }
      try { device?.cleanup(); delete progress.cleanupError; } catch (e) { progress.cleanupError = e.message; }
      progress.finishedAt = now();
      progress.status = recoveryOnly ? 'incomplete' : finalStatus(progress, cancelled());
      progress.executionCompleted = progress.status !== 'incomplete';
      persist();
    }
    release?.();
  }
  return { directory, progress };
}
