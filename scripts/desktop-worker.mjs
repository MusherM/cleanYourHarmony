import { parentPort, workerData } from 'node:worker_threads';
import { spawnSync } from 'node:child_process';
import { Device } from './device.mjs';
import { acquireDevice, executeSession } from './session.mjs';

console.log = (...args) => console.error(...args);
const { method, params, hdc, root, cancel } = workerData;
try {
  let result;
  if (method === 'devices') {
    const r = spawnSync(hdc, ['list', 'targets', '-v'], { encoding: 'utf8', timeout: 15000, windowsHide: true });
    const output = (r.stdout ?? '') + (r.stderr ?? '');
    if (r.error || r.status !== 0 || /\[Fail\]|failed|error/i.test(output)) throw new Error('设备工具连接失败，请检查内置 hdc 或关闭冲突的开发工具');
    result = output.trim().split(/\r?\n/).filter(s => s && s !== '[Empty]').map(line => {
      const columns = line.trim().split(/\s+/);
      const status = columns.find(v => ['Connected','Unauthorized','Offline','Ready','Unknown'].includes(v));
      if (!status) throw new Error('无法识别设备枚举结果');
      return { id: columns[0], status, model: '', software: '' };
    });
    for (const entry of result.filter(d => d.status === 'Connected')) {
      let release;
      try { release = acquireDevice(entry.id); Object.assign(entry, new Device(entry.id, () => {}, hdc).identity()); }
      catch (e) { entry.error = e.message; }
      finally { release?.(); }
    }
  } else if (method === 'execute') {
    result = await executeSession({ ...params, hdc, root, cancelled: () => Atomics.load(new Int32Array(cancel), 0) === 1,
      emit: event => parentPort.postMessage(event) });
  } else throw new Error('未知工作任务');
  parentPort.postMessage({ done: true, result });
} catch (e) { parentPort.postMessage({ done: true, error: e.message }); }
