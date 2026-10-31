import { parentPort, workerData } from 'node:worker_threads';
import { discoverDevices, executeSession } from '../core/index.mjs';

const { method, params, hdc, root, cancel } = workerData;
try {
  let result;
  if (method === 'devices') {
    result = discoverDevices(hdc);
  } else if (method === 'execute') {
    result = await executeSession({ ...params, hdc, root, cancelled: () => Atomics.load(new Int32Array(cancel), 0) === 1,
      emit: event => parentPort.postMessage(event) });
  } else throw new Error('未知工作任务');
  parentPort.postMessage({ done: true, result });
} catch (e) { parentPort.postMessage({ done: true, error: e.message }); }
