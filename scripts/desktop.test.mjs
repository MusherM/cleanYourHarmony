import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { spawn } from 'node:child_process';
import readline from 'node:readline';
import { randomUUID } from 'node:crypto';
import { fileURLToPath } from 'node:url';
import { readCatalog, resolveSelection, publicCatalog } from './catalog.mjs';
import { plan } from './routes.mjs';
import { runPages, hash } from './runner.mjs';
import { acquireDevice, executeSession, finalStatus } from './session.mjs';
const catalog=readCatalog();
const node=(type,attrs={},children=[])=>({attributes:{type,visible:'true',enabled:'true',bounds:'[0,200][500,600]',...attrs},children});
const toggle=(label,on)=>node('Row',{},[node('Text',{text:label}),node('Toggle',{checked:String(on),id:label})]);

test('host RPC keeps stdout machine readable, rejects empty plan, and shuts down on request',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cyh-protocol 中文 '));
  const child=spawn(process.execPath,[fileURLToPath(new URL('./desktop-host.mjs',import.meta.url)),'--hdc',process.execPath,'--data-dir',root],{stdio:['pipe','pipe','pipe']});
  const lines=readline.createInterface({input:child.stdout});const replies=[];let errors='';child.stderr.on('data',s=>errors+=s);
  const finished=new Promise((resolve,reject)=>{child.on('exit',code=>code===0?resolve():reject(Error(errors)));child.on('error',reject);});
  for await(const line of lines){const message=JSON.parse(line);replies.push(message);
    if(message.event==='ready')child.stdin.write(JSON.stringify({id:'catalog',method:'catalog'})+'\n');
    if(message.id==='catalog'){assert.equal(message.result.operations.length,22);child.stdin.write(JSON.stringify({id:'full',method:'plan'})+'\n');}
    if(message.id==='full'){assert.deepEqual(message.result,plan(catalog,resolveSelection(catalog)).map(p=>({page:p.key,items:p.operations.map(o=>o.id)})));child.stdin.write(JSON.stringify({id:'plan',method:'plan',params:{selection:[]}})+'\n');}
    if(message.id==='plan'){assert.match(message.error,/至少/);child.stdin.write(JSON.stringify({id:'end',method:'shutdown'})+'\n');}
  }
  await finished;assert.ok(replies.some(m=>m.id==='end'));fs.rmSync(root,{recursive:true,force:true});
});
