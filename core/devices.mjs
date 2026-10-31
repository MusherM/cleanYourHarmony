import { hdcCommand } from './hdc-service.mjs';
import { spawnSync } from 'node:child_process';
import path from 'node:path';
import { Device } from './device.mjs';
import { acquireDevice } from './session.mjs';
export function discoverDevices(hdc = 'hdc', { spawn = spawnSync, DeviceClass = Device } = {}) {
  const command = hdcCommand(hdc);
  const r = spawn(command.executable, [...command.args, 'list','targets','-v'], { cwd: path.isAbsolute(command.executable) ? path.dirname(command.executable) : undefined, encoding:'utf8', timeout:15000, windowsHide:true });
  const output=(r.stdout ?? '')+(r.stderr ?? '');
  if (r.error || r.status !== 0 || /\[Fail\]|failed|error/i.test(output)) throw new Error('设备工具连接失败，请检查 hdc 或关闭冲突的开发工具');
  if (!output.trim()) throw new Error('设备枚举缺少明确结果');
  const devices=output.trim().split(/\r?\n/).filter(s=>s.trim() && s.trim()!=='[Empty]').map(line=>{
    const columns=line.trim().split(/\s+/), status=columns.find(v=>['Connected','Unauthorized','Offline','Ready','Unknown'].includes(v));
    if (!status) throw new Error('无法识别设备枚举结果');
    return { id:columns[0], status, model:'', software:'' };
  });
  for (const entry of devices.filter(d=>d.status==='Connected')) {
    let release;
    try { release=acquireDevice(entry.id); Object.assign(entry,new DeviceClass(entry.id,()=>{},hdc).identity()); }
    catch (e) { entry.error=e.message; }
    finally { release?.(); }
  }
  return devices;
}
