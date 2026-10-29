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

test('desktop catalog covers 20 settings in four categories with typed defaults',()=>{
  const data=publicCatalog(catalog);assert.equal(data.operations.length,20);
  assert.deepEqual(data.categories.map(c=>data.operations.filter(o=>o.category===c.id).length),[3,9,7,1]);
  assert.equal(resolveSelection(catalog).length,20);
});
test('selection is strict, excludes unchecked items, supports mixed targets without mutating catalog',()=>{
  const selected=resolveSelection(catalog,[{id:'B02',target:true},{id:'F01',target:false}]);
  assert.deepEqual(selected.map(o=>[o.id,o.target.checked]),[['B02',true],['F01',false]]);
  assert.equal(catalog.operations.find(o=>o.id==='B02').target.checked,false);
  assert.equal(plan(catalog,selected).flatMap(p=>p.operations).length,2);
  for(const selection of [[],[{id:'bad',target:false}],[{id:'B02',target:'false'}],[{id:'B02',target:false},{id:'B02',target:true}]]) assert.throws(()=>resolveSelection(catalog,selection));
});
test('homepage picks the requested radio, never unchecks the simple radio',()=>{
  for(const mode of ['simple','default']) {const [op]=resolveSelection(catalog,[{id:'B01',target:mode}]);assert.equal(op.locator.originalText,mode);assert.equal(op.target.checked,true);}
  assert.throws(()=>resolveSelection(catalog,[{id:'B01',target:false}]));
});
test('stop after first mutation still verifies that page but never starts another item',async()=>{
  let stopped=false,reentries=0;const values={榜单:false,热词:false};
  const operations=resolveSelection(catalog,[{id:'B02',target:true},{id:'B03',target:true}]);
  const tree=()=>node('Column',{},Object.entries(values).map(([k,v])=>toggle(k,v)));
  const nav={cancelled:()=>stopped,go:async()=>({scope:tree()}),current:async()=>({scope:tree()}),wait:async(_,predicate)=>{assert.equal(nav.cancelled(),false);assert.ok(predicate(tree()));return{scope:tree()};},isPage:()=>true,reenter:async()=>{reentries++;return{scope:tree()};},reset:()=>{}};
  const progress={items:{},failures:[]};
  await runPages({pages:plan(catalog,operations),nav,device:{click:n=>{values[n.attributes.id]=true;stopped=true;}},progress,persist:()=>{},evidence:()=>({path:'shot.png'}),cancelled:()=>stopped});
  assert.equal(values.榜单,true);assert.equal(values.热词,false);assert.equal(progress.items.B02.status,'passed');assert.equal(progress.items.B03,undefined);assert.equal(reentries,1);assert.equal(nav.cancelled(),true);
});
test('business status cannot hide missing, failure or pending DND behind process success',()=>{
  const p={selected:['B02'],items:{B02:{status:'unchanged'}},dnd:{restorePending:false}};
  assert.equal(finalStatus(p,false),'completed');p.items.B02.status='not_found';assert.equal(finalStatus(p,false),'completed_with_missing');
  p.items.B02={status:'failed',failureKind:'disabled'};assert.equal(finalStatus(p,false),'completed_with_failures');p.dnd.restorePending=true;assert.equal(finalStatus(p,false),'incomplete');
});
test('device leases prevent concurrent sessions and release only their own lease',()=>{
  const id='test-'+randomUUID(),release=acquireDevice(id);assert.throws(()=>acquireDevice(id),/占用/);release();acquireDevice(id)();
});
test('a confirmed dead process lease is reclaimed without stealing a live lease',()=>{
  const id='test-'+randomUUID(),lock=path.join(os.tmpdir(),`cyh-device-${hash(id).slice(0,16)}.lock`);
  fs.mkdirSync(lock);fs.writeFileSync(path.join(lock,'owner.json'),JSON.stringify({pid:2147483647,token:'dead'}));
  const release=acquireDevice(id);assert.equal(JSON.parse(fs.readFileSync(path.join(lock,'owner.json'))).pid,process.pid);release();
});
function fakeSession() {
  let dnd=false,setting=true,clicks=0;
  const scope=page=>page==='DND'?node('Column',{},[node('Text',{text:'免打扰'}),node('Button',{text:dnd?'关闭':'立即开启',id:'dnd'})]):node('Column',{},[toggle('榜单',setting)]);
  class FakeDevice {info(){return{model:'test',software:'7',apps:{}};}click(n){clicks++;if(n.attributes.id==='dnd')dnd=!dnd;else setting=!setting;}shot(file){fs.writeFileSync(file,'fresh evidence');}cleanup(){} }
  class FakeNav {constructor(device,cancelled){this.cancelled=cancelled;}async go(p){this.page=p.key;return{scope:scope(this.page)};}async current(){return{scope:scope(this.page)};}async wait(_,p){assert.ok(p(scope(this.page)));return{scope:scope(this.page)};}isPage(){return true;}async reenter(){return this.current();}reset(){} }
  return {DeviceClass:FakeDevice,NavigatorClass:FakeNav,state:()=>({dnd,setting,clicks})};
}
test('session persists evidence and restores DND; completed resume does not replay settings',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cyh-session-test-')),rig=fakeSession(),request={deviceId:'test-'+randomUUID(),selection:[{id:'B02',target:false}]};
  try {
    const first=await executeSession({request,root,...rig});assert.equal(first.progress.status,'completed');assert.equal(rig.state().dnd,false);assert.equal(first.progress.dnd.restored.checked,false);
    const second=await executeSession({request,root,resume:first.directory,...rig});assert.equal(second.progress.items.B02.status,'passed');assert.equal(rig.state().setting,false);assert.equal(rig.state().clicks,5);
    const changed=await executeSession({request:{...request,selection:[{id:'B02',target:true}]},root,resume:first.directory,...rig});assert.equal(changed.progress.status,'incomplete');assert.match(changed.progress.stopReason,/目标或清单/);assert.equal(rig.state().setting,false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('host RPC keeps stdout machine readable, rejects empty plan, and shuts down on request',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cyh-protocol 中文 '));
  const child=spawn(process.execPath,[fileURLToPath(new URL('./desktop-host.mjs',import.meta.url)),'--hdc',process.execPath,'--data-dir',root],{stdio:['pipe','pipe','pipe']});
  const lines=readline.createInterface({input:child.stdout});const replies=[];let errors='';child.stderr.on('data',s=>errors+=s);
  const finished=new Promise((resolve,reject)=>{child.on('exit',code=>code===0?resolve():reject(Error(errors)));child.on('error',reject);});
  for await(const line of lines){const message=JSON.parse(line);replies.push(message);
    if(message.event==='ready')child.stdin.write(JSON.stringify({id:'catalog',method:'catalog'})+'\n');
    if(message.id==='catalog'){assert.equal(message.result.operations.length,20);child.stdin.write(JSON.stringify({id:'plan',method:'plan',params:{selection:[]}})+'\n');}
    if(message.id==='plan'){assert.match(message.error,/至少/);child.stdin.write(JSON.stringify({id:'end',method:'shutdown'})+'\n');}
  }
  await finished;assert.ok(replies.some(m=>m.id==='end'));fs.rmSync(root,{recursive:true,force:true});
});
test('DND is restored when the setting cannot be reached, and success is not reported',async()=>{
  const root=fs.mkdtempSync(path.join(os.tmpdir(),'cyh-failure-test-')),rig=fakeSession();
  class BrokenNav extends rig.NavigatorClass {async go(page){if(page.key!=='DND')throw Error('unknown page');return super.go(page);}}
  try {
    const result=await executeSession({request:{deviceId:'test-'+randomUUID(),selection:[{id:'B02',target:false}]},root,...rig,NavigatorClass:BrokenNav});
    assert.equal(result.progress.status,'incomplete');assert.equal(result.progress.items.B02.status,'failed');assert.equal(rig.state().dnd,false);assert.equal(result.progress.dnd.restorePending,false);
  } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('invalid target fails before any device work or result directory is created',async()=>{
  let calls=0;class ForbiddenDevice {constructor(){calls++;}}
  const root=path.join(os.tmpdir(),'cyh-no-side-effects-'+randomUUID());
  await assert.rejects(executeSession({request:{deviceId:'unused',selection:[{id:'B02',target:'on'}]},root,DeviceClass:ForbiddenDevice}),/目标/);
  assert.equal(calls,0);assert.equal(fs.existsSync(root),false);
});
