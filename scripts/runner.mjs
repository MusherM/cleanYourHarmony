import os from 'node:os';
import { setTimeout as delay } from 'node:timers/promises';
import fs from 'node:fs';
import path from 'node:path';
import { createHash, randomUUID } from 'node:crypto';
import { state, dndControl } from './ui-tree.mjs';
import { NotificationNotFound } from './navigator.mjs';

export const now = () => new Date(Date.now() + 8 * 3600000).toISOString().replace('Z', '+08:00');
export const hash = data => createHash('sha256').update(data).digest('hex');
export function save(file, data) {
  const tmp = file + '.' + randomUUID() + '.tmp';
  fs.writeFileSync(tmp, JSON.stringify(data, null, 2) + '\n', { mode: 0o600 });
  fs.renameSync(tmp, file);
}
export function capture(device, dir, tag) {
  const name = `${tag}-${randomUUID()}.png`, file = path.join(dir, name);
  device.shot(file);
  if (!fs.statSync(file).size) throw new Error('截图为空，不能提交完成状态');
  return { path: name, at: now(), sha256: hash(fs.readFileSync(file)) };
}
export async function runPages({ pages, device, nav, progress, persist, evidence, cancelled = () => false }) {
  for (const page of pages) {
    await delay(0); // Let SIGINT/SIGTERM handlers run between synchronous hdc calls.
    if (cancelled()) break;
    const pending = page.operations.filter(o => !['passed', 'unchanged', 'not_found'].includes(progress.items[o.id]?.status));
    if (!pending.length) continue;
    progress.currentPage = page.key; delete progress.stopReason; persist();
    const navigationCancelled = nav.cancelled;
    const visited = [];
    try {
      await nav.go(page);
      // Once on a page, complete verification of any mutation before honouring
      // cancellation. The next item is never started after the cancel flag.
      nav.cancelled = () => false;
      for (const op of pending) {
        if (cancelled()) break;
        progress.currentItem = op.id; persist();
        const { scope } = await nav.current(page, op.locator);
        if (cancelled()) break;
        visited.push(op);
        const current = state(scope, op.locator);
        const prev = progress.items[op.id];
        const rec = progress.items[op.id] = { ...prev, id: op.id, group: op.screenshot.group, target: op.requestedTarget ?? op.target.checked,
          before: prev?.before ?? current.checked, enabled: current.enabled, status: 'pending', observedAt: now() };
        delete rec.error; delete rec.failureKind;
        if (current.checked !== op.target.checked) {
          if (!current.enabled) { rec.status = 'failed'; rec.failureKind = 'disabled'; rec.after = current.checked; rec.error = '目标控件禁用'; rec.evidence = [evidence(`${op.id}-disabled`)]; persist(); continue; }
          // Persist intent first: after a crash, never blindly replay the toggle.
          rec.mutationPending = true; persist();
          device.click(current.n);
          const { scope: afterScope } = await nav.wait(page.family, s => {
            if (!nav.isPage(s, page.family, page.route)) return false;
            return state(s, op.locator).checked === op.target.checked;
          });
          rec.after = state(afterScope, op.locator).checked;
          rec.evidence = [...(rec.evidence ?? []), evidence(`${op.id}-after`)];
          persist();
        } else { rec.after = current.checked; }
      }
      // One screenshot can cover all currently visible members of this page.
      const visible = visited.filter(o => progress.items[o.id]?.status !== 'failed');
      if (visible.length) {
        const { scope } = await nav.current(page);
        for (const op of visible) if (state(scope, op.locator).checked !== op.target.checked) throw new Error(`状态发生变化：${op.id}`);
        const shot = evidence(page.operations[0].screenshot.group + '-page');
        for (const op of visible) {
          const rec = progress.items[op.id]; rec.evidence = [...(rec.evidence ?? []), shot];
          if (!rec.mutationPending) rec.status = 'unchanged';
        }
        persist();
      }
      const changed = visible.filter(o => progress.items[o.id].mutationPending);
      if (changed.length) {
        const { scope: reentered } = await nav.reenter(page);
        for (const op of changed) if (state(reentered, op.locator).checked !== op.target.checked) throw new Error(`重进状态不符：${op.id}`);
        const shot = evidence(page.operations[0].screenshot.group + '-reentry');
        for (const op of changed) {
          Object.assign(progress.items[op.id], { status: 'passed', mutationPending: false, reentry: { at: now(), checked: op.target.checked } });
          progress.items[op.id].evidence.push(shot);
        }
        persist();
      }
      console.log(`${page.key}: ${visited.map(o => o.id + '=' + progress.items[o.id].status).join(', ')}`);
    } catch (e) {
      if (e instanceof NotificationNotFound && page.notification) {
        try {
          const shot = evidence('not-found');
          for (const op of pending) progress.items[op.id] = { id: op.id, status: 'not_found',
            observedAt: now(), reason: e.message, evidence: [shot] };
          persist(); nav.reset();
          console.log(`${page.key}: 未找到`);
          continue;
        } catch (captureError) { e = captureError; }
      }
      if (device.lastTree) {
        const diagnostic = path.join(os.tmpdir(), 'cyh-failure-' + randomUUID() + '.json');
        fs.writeFileSync(diagnostic, JSON.stringify(device.lastTree), { mode: 0o600 });
        progress.diagnosticTree = diagnostic;
      }
      let shot;
      try { shot = evidence('failure'); } catch { /* Preserve the original failure. */ }
      for (const op of pending) {
        const rec = progress.items[op.id] ??= { id: op.id };
        if (['passed', 'unchanged'].includes(rec.status)) continue;
        rec.status = cancelled() ? 'incomplete' : 'failed'; rec.failureKind = 'execution'; rec.error = e.message; rec.observedAt = now();
        if (shot) rec.evidence = [...(rec.evidence ?? []), shot];
      }
      progress.failures.push({ page: page.key, at: now(), reason: e.message });
      persist(); nav.reset();
      console.error(`${page.key}: ${e.message}`);
      progress.stopReason = e.message; persist();
      break; // Stop at the first infrastructure/navigation failure; Agent diagnoses before resume.
    } finally {
      nav.cancelled = navigationCancelled;
    }
  }
}

export async function dnd({ nav, device, progress, persist, evidence, restore = false }) {
  const page = { key: 'DND', family: 'N', route: ['情景模式'] };
  try {
    const { scope } = await nav.go(page);
    const current = dndControl(scope);
    if (!restore) {
      progress.dnd = { original: current.checked, restorePending: false, at: now() }; persist();
    }
    if (restore && typeof progress.dnd?.original !== 'boolean') throw new Error('勿扰原状态未知');
    const target = restore ? progress.dnd.original : true;
    if (current.checked !== target) {
      if (!current.enabled) throw new Error('勿扰开关禁用');
      progress.dnd.restorePending = true; persist();
      device.click(current.n);
      await nav.wait('N', s => nav.isPage(s, 'N', page.route) && dndControl(s).checked === target);
    }
    const shot = evidence(restore ? 'dnd-restored' : 'dnd-ready');
    if (restore) { progress.dnd.restorePending = false; delete progress.dnd.restoreError; }
    progress.dnd[restore ? 'restored' : 'enabled'] = { at: now(), checked: target, evidence: shot };
    persist();
  } catch (e) {
    progress.dnd ??= {};
    progress.dnd[restore ? 'restoreError' : 'enableError'] = e.message;
    persist(); nav.reset();
    console.error(`勿扰${restore ? '恢复' : '准备'}: ${e.message}`);
    throw e;
  }
}
