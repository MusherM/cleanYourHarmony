#!/usr/bin/env node
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { plan, discoverDevices, readCatalog, resolveSelection, executeSession } from '../core/index.mjs';

const args = process.argv.slice(2);
const valued = new Set(['--resume','--device','--hdc','--request','--output']);
for (let i=0;i<args.length;i++) {
  if (valued.has(args[i])) { if (!args[++i] || args[i].startsWith('--')) throw new Error('参数缺少值'); }
  else if (!['--plan','--execute','--recover'].includes(args[i])) throw new Error('未知参数：' + args[i]);
}
const value = key => { const i=args.indexOf(key); return i<0 ? undefined : args[i+1]; };
const catalog=readCatalog();
let request = value('--request') ? JSON.parse(fs.readFileSync(value('--request'))) : {};
if (value('--resume') && !value('--request')) request=JSON.parse(fs.readFileSync(path.join(value('--resume'),'progress.json'))).request ?? request;
const selection=resolveSelection(catalog,request.selection);
if ((!args.includes('--execute') && !args.includes('--recover')) || args.includes('--plan')) {
  const pages=plan(catalog,selection);
  console.log(JSON.stringify({mode:'plan',deviceActions:false,operations:selection.length,pages:pages.map(p=>({page:p.key,operations:p.operations.map(o=>o.id)}))},null,2));
} else {
  let interrupted=false;
  process.on('SIGINT',()=>{interrupted=true;});process.on('SIGTERM',()=>{interrupted=true;});
  try {
    const hdc=value('--hdc')??'hdc';
    const devices=discoverDevices(hdc);
    const ids=devices.filter(d=>d.status==='Connected').map(d=>d.id);
    request.deviceId=value('--device')??request.deviceId??(ids.length===1?ids[0]:undefined);
    if (!request.deviceId || !ids.includes(request.deviceId)) throw new Error(ids.length?'请用 --device 选择在线设备':devices.some(d=>d.status==='Unauthorized')?'设备未授权，请在手机确认 USB 调试授权':'未检测到在线设备，请检查 USB 调试及电脑授权');
    if (args.includes('--recover') && !value('--resume')) throw new Error('--recover 需要 --resume 指定原证据目录');
    const root=value('--output')??fileURLToPath(new URL('../dev/device-run',import.meta.url));
    const result=await executeSession({request,hdc,root,resume:value('--resume'),cancelled:()=>interrupted,recoveryOnly:args.includes('--recover'),emit:event=>{if(event.event==='diagnostic')console.error(event.message);}});
    console.log(`结果：${result.progress.status}；进度：${path.join(result.directory,'progress.json')}`);
    process.exitCode=['completed','completed_with_missing'].includes(result.progress.status)?0:2;
  } catch(e) {console.error(e.message);process.exitCode=2;}
}
