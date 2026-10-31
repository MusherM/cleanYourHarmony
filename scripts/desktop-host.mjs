import fs from 'node:fs';
import path from 'node:path';
import readline from 'node:readline';
import { Worker } from 'node:worker_threads';
import { readCatalog, publicCatalog, resolveSelection, plan, dataRoot, discoverRuns } from '../core/index.mjs';

const args = process.argv.slice(2);
const arg = key => { const i = args.indexOf(key); return i >= 0 ? args[i + 1] : null; };
const hdc = arg('--hdc');
const root = path.resolve(arg('--data-dir') || dataRoot());
if (!hdc || !path.isAbsolute(hdc) || !fs.existsSync(hdc)) throw new Error('内置 hdc 缺失，应用安装不完整');
const catalog = readCatalog();
let active, closing = false;
const output = message => { if (!process.stdout.destroyed) process.stdout.write(JSON.stringify(message) + '\n'); };
process.stdout.on('error', () => shutdown());
function shutdown() {
  closing = true;
  if (active) Atomics.store(new Int32Array(active.cancel), 0, 1);
  else process.exit(0);
}
function startWorker(id, method, params) {
  if (active) throw new Error('设备正在处理任务，请稍后重试');
  const cancel = new SharedArrayBuffer(4);
  const worker = new Worker(new URL('./desktop-worker.mjs', import.meta.url), { workerData: { method, params, hdc, root, cancel } });
  active = { worker, cancel, method };
  let replied = false;
  worker.on('message', message => {
    if (message.done) {
      replied = true; output({ id, result: message.result, error: message.error });
    } else output(message);
  });
  worker.on('error', e => { if (!replied) { replied = true; output({ id, error: e.message }); } });
  worker.on('exit', code => {
    if (!replied) output({ id, error: `执行进程异常退出 (${code})，请检查未完成任务` });
    active = null;
    output({ event: 'idle', recoverable: discoverRuns(root) });
    if (closing) process.exit(0);
  });
}
const input = readline.createInterface({ input: process.stdin });
input.on('line', line => {
  let id;
  try {
    if (line.length > 128 * 1024) throw new Error('请求过大');
    const message = JSON.parse(line); id = message.id;
    if (typeof id !== 'string') throw new Error('请求缺少 id');
    const { method, params = {} } = message;
    if (closing) throw new Error('应用正在退出');
    if (method === 'catalog') output({ id, result: publicCatalog(catalog) });
    else if (method === 'plan') output({ id, result: plan(catalog, resolveSelection(catalog, params.selection)).map(p => ({ page: p.key, items: p.operations.map(o => o.id) })) });
    else if (method === 'devices') startWorker(id, method, {});
    else if (method === 'runs') output({ id, result: discoverRuns(root) });
    else if (method === 'cancel') {
      if (active) Atomics.store(new Int32Array(active.cancel), 0, 1);
      output({ id, result: { stopping: Boolean(active) } });
    } else if (method === 'execute' || method === 'resume' || method === 'recover') {
      let request = params.request, resume;
      if (method !== 'execute') {
        const found = discoverRuns(root).find(r => r.directory === params.directory);
        if (!found || found.deviceId !== params.deviceId) throw new Error('没有匹配当前设备的未完成任务');
        request = found.request; resume = found.directory;
      }
      if (method === 'execute') resolveSelection(catalog, request?.selection);
      startWorker(id, 'execute', { request, resume, recoveryOnly: method === 'recover' });
    } else if (method === 'shutdown') { output({ id, result: true }); shutdown(); }
    else throw new Error('未知接口：' + method);
  } catch (e) { output({ id, error: e.message }); }
});
input.on('close', shutdown);
process.on('SIGTERM', shutdown);
process.on('SIGINT', shutdown);
output({ event: 'ready', protocolVersion: 1, recoverable: discoverRuns(root) });
