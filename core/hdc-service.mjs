import { spawn } from 'node:child_process';
import net from 'node:net';
import path from 'node:path';
import { setTimeout as delay } from 'node:timers/promises';

// String commands retain CLI compatibility. Managed clients explicitly disable
// hdc's daemon auto-start so a failed service cannot leave an unowned process.
export function hdcCommand(hdc) {
  if (typeof hdc === 'string') return { executable: hdc, args: [] };
  if (!hdc || typeof hdc.executable !== 'string' || !Array.isArray(hdc.args) || !hdc.args.every(a => typeof a === 'string')) throw new Error('无效 hdc 命令');
  return hdc;
}
function listening(port) {
  return new Promise(resolve => {
    const socket = net.createConnection({ host: '127.0.0.1', port });
    const finish = value => { socket.destroy(); resolve(value); };
    socket.once('connect', () => finish(true));
    socket.once('error', () => finish(false));
    socket.setTimeout(300, () => finish(false));
  });
}
export class HdcService {
  constructor(hdc, { port = process.env.OHOS_HDC_SERVER_PORT ?? 8710, log = () => {}, timeout = 8000 } = {}) {
    this.command = hdcCommand(hdc);
    this.port = Number(port);
    if (!Number.isInteger(this.port) || this.port < 1 || this.port > 65535) throw new Error('hdc 服务端口无效');
    this.endpoint = `127.0.0.1:${this.port}`;
    this.client = { executable: this.command.executable, args: [...this.command.args, '-p', '-s', this.endpoint] };
    this.log = log; this.timeout = timeout; this.stopped = false;
  }
  start() {
    if (this.stopped) return Promise.reject(new Error('hdc 服务正在退出'));
    return this.starting ??= this.open();
  }
  async open() {
    if (await listening(this.port)) { this.log('复用已有 hdc 服务，退出时不停止外部服务'); return this.client; }
    if (this.stopped) throw new Error('hdc 服务正在退出');
    const { executable, args } = this.command;
    const child = this.child = spawn(executable, [...args, '-s', this.endpoint, '-m'], {
      cwd: path.isAbsolute(executable) ? path.dirname(executable) : undefined,
      stdio: ['ignore', 'pipe', 'pipe'], windowsHide: true,
    });
    let error;
    child.once('error', e => { error = e; });
    this.exited = new Promise(resolve => { child.once('exit', resolve); child.once('error', resolve); });
    // hdc logs must never enter the desktop JSON Lines protocol.
    child.stdout.on('data', data => this.log(data.toString().trim()));
    child.stderr.on('data', data => this.log(data.toString().trim()));
    const until = Date.now() + this.timeout;
    while (Date.now() < until && !this.stopped) {
      if (error || child.exitCode !== null || child.signalCode !== null) break;
      if (await listening(this.port)) { this.log(`应用管理 hdc 服务 pid=${child.pid}`); return this.client; }
      await delay(50);
    }
    await this.stopChild();
    throw new Error(error ? `hdc 服务启动失败：${error.message}` : 'hdc 服务未就绪或启动被取消');
  }
  async stopChild() {
    const child = this.child;
    if (!child || child.exitCode !== null || child.signalCode !== null || !child.pid) return;
    // Signal only the ChildProcess we spawned, never a shared port or pid file.
    child.kill('SIGTERM');
    let timer;
    const exited = await Promise.race([this.exited.then(() => true), new Promise(resolve => { timer = setTimeout(() => resolve(false), 3000); })]);
    clearTimeout(timer);
    if (!exited) { child.kill('SIGKILL'); await this.exited; }
    this.log(`应用管理的 hdc 服务已退出 pid=${child.pid}`);
  }
  async stop() {
    this.stopped = true;
    await this.starting?.catch(() => {});
    await this.stopChild();
  }
}
