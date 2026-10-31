import { spawnSync } from 'node:child_process';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { bounds } from './ui-tree.mjs';
import { APPS } from './routes.mjs';

export class Device {
  constructor(id, log, hdc = 'hdc', apps = APPS) { this.apps = apps; this.id = id; this.log = log; this.hdc = hdc; this.revision = 0; this.temporaryFiles = new Set(); }
  run(args, marker) {
    const start = Date.now();
    const r = spawnSync(this.hdc, ['-t', this.id, ...args], { cwd: path.isAbsolute(this.hdc) ? path.dirname(this.hdc) : undefined, encoding: 'utf8', timeout: 20000, maxBuffer: 8 * 1024 * 1024, windowsHide: true });
    const output = (r.stdout ?? '') + (r.stderr ?? '');
    this.log({ action: args[0] === 'file' ? 'file-transfer' : args[1]?.split(' ').slice(0, 2).join(' '), ms: Date.now() - start, exit: r.status });
    if (r.error || r.status !== 0 || /\[Fail\]|\berror\b(?!\s*[:=]?\s*0)|inaccessible|not found/i.test(output.replace(/No Error/gi, '')) || (marker && !marker.test(output))) {
      throw new Error(`设备命令失败或缺少成功标记 (${args[0]})`);
    }
    return output;
  }
  shell(...args) {
    const quote = s => "'" + String(s).replaceAll("'", "'\\''") + "'";
    return this.run(['shell', args.map(quote).join(' ')]);
  }
  ui(...args) {
    this.revision++;
    const output = this.shell('uitest', 'uiInput', ...args);
    if (!/No Error/i.test(output)) throw new Error('uiInput 缺少 No Error 成功标记');
  }
  click(n) {
    const [x1, y1, x2, y2] = bounds(n);
    this.ui('click', Math.round((x1 + x2) / 2), Math.round((y1 + y2) / 2));
  }
  back() { this.ui('keyEvent', 'Back'); }
  capture(kind, destination) {
    const remote = `/data/local/tmp/cyh_${randomUUID()}.${kind === 'tree' ? 'json' : 'png'}`;
    try {
      // Unique remote and local names prevent stale-file success.
      const output = this.shell('uitest', kind === 'tree' ? 'dumpLayout' : 'screenCap', '-p', remote);
      if (!/saved to\s*:?\s*/i.test(output) || !output.includes(remote)) throw new Error('采集命令缺少当前路径的 saved to 标记');
      this.run(['file', 'recv', remote, destination], /finish|success/i);
      if (!fs.existsSync(destination) || !fs.statSync(destination).size) throw new Error('采集文件为空');
      if (kind === 'tree') return JSON.parse(fs.readFileSync(destination, 'utf8'));
      validatePNG(fs.readFileSync(destination));
    } finally {
      this.temporaryFiles.add(remote);
      if (this.temporaryFiles.size >= 64) this.cleanup();
    }
  }
  cleanup() {
    if (!this.temporaryFiles.size) return;
    this.shell('rm', '-f', ...this.temporaryFiles);
    this.temporaryFiles.clear();
  }
  tree() {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'cyh-tree-'));
    try { this.lastTree = this.capture('tree', path.join(dir, 'tree.json')); return this.lastTree; }
    finally { fs.rmSync(dir, { recursive: true, force: true }); }
  }
  shot(file) { this.revision++; this.capture('shot', file); }
  identity() {
    const model = this.shell('param', 'get', 'const.product.model').trim();
    const software = this.shell('param', 'get', 'const.product.software.version').trim();
    if (!model || !software) throw new Error('设备型号或系统版本不可读取');
    return { model, software };
  }
  info(families = Object.keys(this.apps)) {
    const apps = {};
    for (const family of new Set(families)) {
      const app = this.apps[family];
      const output = this.shell('bm', 'dump', '-n', app.bundle);
      const data = JSON.parse(output.slice(output.indexOf('{')));
      if (!data.versionName) throw new Error('无法读取应用版本：' + app.bundle);
      apps[app.bundle] = data.versionName;
    }
    return { ...this.identity(), apps };
  }
  launch(app) {
    this.revision++;
    const ability = app.ability;
    if (!ability) throw new Error('路线缺少已验证应用入口');
    const output = this.shell('aa', 'start', '-a', ability, '-b', app.bundle);
    if (!/success/i.test(output)) throw new Error('启动命令缺少 success 标记');
  }
}

export function validatePNG(data) {
  if (data.length < 45 || data.subarray(0,8).toString('hex') !== '89504e470d0a1a0a' || data.subarray(12,16).toString() !== 'IHDR' || !data.readUInt32BE(16) || !data.readUInt32BE(20) || data.subarray(-12).toString('hex') !== '0000000049454e44ae426082') throw new Error('截图不是完整 PNG');
}
