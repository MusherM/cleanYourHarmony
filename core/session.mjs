import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { coreFiles, contentDigest } from './integrity.mjs';
import { validateCatalog } from './validation.mjs';
import { adapters } from './adapters/index.mjs';
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
export async function executeSession({ request, hdc, root = dataRoot(), resume, recoveryOnly = false, cancelled = () => false, emit = () => {}, DeviceClass = Device, NavigatorClass = Navigator, catalog = readCatalog(), registry = adapters }) {
  validateCatalog(catalog, registry);
  if (recoveryOnly && !resume) throw new Error('恢复勿扰需要原证据目录');
  let operations, selectionError;
  try { operations = resolveSelection(catalog, request.selection); }
  catch (error) { if (!resume) throw error; selectionError = error; operations = []; }
  const dndPage = { key: 'DND', family: catalog.dnd.app, route: catalog.dnd.route };
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
      schemaVersion: 3, runId: randomUUID(), startedAt: now(), deviceId: request.deviceId,
      catalogHash: hash(JSON.stringify(catalog)), requestHash,
      request: { deviceId: request.deviceId, selection: normalized }, selected: normalized.map(o => o.id),
      items: {}, failures: [], dnd: null,
    };
    if (![1,2,3].includes(progress.schemaVersion)) throw new Error('不支持的进度版本');
    const legacy = progress.schemaVersion !== 3;
    if (progress.deviceId && progress.deviceId !== request.deviceId) throw new Error('设备不符，不能恢复此任务');
    if (legacy && !progress.dnd?.restorePending) throw new Error('旧进度版本不支持业务续跑，请保留证据并开始新任务');
    device = new DeviceClass(request.deviceId, entry => fs.appendFileSync(path.join(directory, 'commands.jsonl'), JSON.stringify({ at: now(), ...entry }) + '\n'), hdc, catalog.apps);
    nav = new NavigatorClass(device, cancelled, catalog.apps, registry);
    evidence = tag => capture(device, directory, tag);
    // Verify identity before restoring even when the catalog/request changed.
    if (progress.dnd?.restorePending) {
      recoveryAttempted = true;
      const identity = device.identity ? device.identity() : device.info([catalog.dnd.app]);
      if (!progress.device || identity.model !== progress.device.model || identity.software !== progress.device.software) {
        persist = undefined; throw new Error('设备身份或系统版本不符，不能恢复勿扰');
      }
      if (!progress.deviceId) {
        const info = device.info(Object.keys(catalog.apps));
        if (hash(request.deviceId + JSON.stringify(info)) !== progress.fingerprint) {
          persist = undefined; throw new Error('旧进度设备指纹不符，不能恢复勿扰');
        }
      }
      if (legacy) {
        const backup = path.join(directory,'progress.before-core-v3.json');
        if (!fs.existsSync(backup)) fs.copyFileSync(progressFile,backup,fs.constants.COPYFILE_EXCL);
        recoveryOnly = true;
      }
    }
    persist = () => { progress.updatedAt = now(); save(progressFile, progress); emit({ event: 'progress', directory, progress }); };
    // A recovery obligation survives catalog and request changes. Restore first,
    // but never run old business operations against a changed fingerprint.
    if (progress.dnd?.restorePending) {
      recoveryAttempted = true;
      nav.cancelled = () => false;
      await dnd({ nav, device, progress, persist, evidence, page: dndPage, emit, restore: true });
      nav.cancelled = cancelled;
      recoveryAttempted = false;
    }
    if (recoveryOnly) { progress.status = 'incomplete'; progress.stopReason = legacy ? '旧进度仅恢复勿扰，业务项目不支持续跑' : '勿扰恢复检查完成，业务项目未继续'; persist(); return { directory, progress }; }
    if (selectionError) throw selectionError;
    if (resume && (progress.requestHash !== requestHash || progress.catalogHash !== hash(JSON.stringify(catalog)))) throw new Error('目标或清单已改变，不能续跑；请开始新任务');
    progress.status = 'running'; delete progress.finishedAt; delete progress.stopReason; persist();
    const info = device.info([...new Set([catalog.dnd.app, ...pages.map(p => p.family)])]);
    const fingerprint = hash(request.deviceId + JSON.stringify(info));
    if (progress.fingerprint && progress.fingerprint !== fingerprint) throw new Error('设备或应用版本已变化，不能续跑');
    progress.device = info; progress.fingerprint = fingerprint;
    progress.attempts ??= [];
    const sources=coreFiles();
    progress.attempts.push({ at: now(), sources, coreDigest: contentDigest(sources) });
    persist();
    nav.onReturn = page => {
      for (const rule of catalog.overviews ?? []) {
        if (page.family !== rule.app || JSON.stringify(page.route) !== JSON.stringify(rule.route)) continue;
        const covered = rule.operations.filter(id => progress.selected.includes(id) && ['passed','unchanged'].includes(progress.items[id]?.status));
        progress.overviews ??= {};
        if (covered.length && covered.join() !== (progress.overviews[rule.id]?.covered ?? []).join()) {
          progress.overviews[rule.id] = { covered, evidence: evidence(rule.id + '-parent') }; persist();
        }
      }
    };
    if (!cancelled()) {
      await dnd({ nav, device, progress, persist, evidence, page: dndPage, emit });
      await runPages({ pages, device, nav, progress, persist, evidence, cancelled, emit });
    }
  } catch (e) {
    if (!progress || !persist) throw e;
    progress.stopReason = e.message; progress.status = 'incomplete'; persist();
  } finally {
    try {
    if (progress && persist) {
      if (progress.dnd?.restorePending && nav && !recoveryAttempted) {
        nav.cancelled = () => false;
        try { await dnd({ nav, device, progress, persist, evidence, page: dndPage, emit, restore: true }); }
        catch (e) { progress.stopReason = e.message; }
      }
      try { device?.cleanup(); delete progress.cleanupError; } catch (e) { progress.cleanupError = e.message; }
      progress.finishedAt = now();
      progress.status = recoveryOnly ? 'incomplete' : finalStatus(progress, cancelled());
      progress.executionCompleted = progress.status !== 'incomplete';
      persist();
    } else { device?.cleanup(); }
    } finally { release?.(); }
  }
  return { directory, progress };
}
