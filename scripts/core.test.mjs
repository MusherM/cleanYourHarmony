import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import { readCatalog, resolveSelection, plan, validateCatalog, executeSession, discoverDevices } from '../core/index.mjs';
import { Navigator } from '../core/navigator.mjs';
import { adapters } from '../core/adapters/index.mjs';
const catalog=readCatalog();
const n=(type,attrs={},children=[])=>({attributes:{type,visible:'true',enabled:'true',bounds:'[0,200][500,600]',...attrs},children});
const row=(on)=>n('Row',{},[n('Text',{text:'新增开关'}),n('Toggle',{id:'setting',checked:String(on)})]);
function extension() {
 const c=structuredClone(catalog), op=structuredClone(c.operations.find(o=>o.id==='B02'));
 c.apps.extra={bundle:'test.app',ability:'Main',root:'入口',adapter:'test'};
 c.pages.extra={app:'extra',route:['新页'],kind:'standard'};
 Object.assign(op,{id:'any-id',page:'extra',path:'仅展示文案，不是路线',locator:{type:'Toggle',anchorText:'新增开关'}});c.operations.push(op);
 return c;
}
test('new ordinary item uses declared page, never ID prefixes or display path',()=>{
 const c=extension(); c.apps.extra.adapter='standard';validateCatalog(c);
 const pages=plan(c,resolveSelection(c,[{id:'any-id',target:false}]));
 assert.deepEqual(pages.map(p=>[p.family,p.route,p.operations[0].id]),[['extra',['新页'],'any-id']]);
});
test('new application adapter executes and verifies a setting through the unchanged session',async()=>{
 const c=extension(),root=fs.mkdtempSync(path.join(os.tmpdir(),'cyh-extension-'));let on=true, dnd=false, active='root', changes=0, entries=0;
 const scope=()=>active==='dnd'?n('Column',{},[n('Text',{text:'免打扰'}),n('Button',{text:dnd?'关闭':'立即开启',id:'dnd'})]):n('Column',{},[row(on)]);
 class Device {info(){return{model:'fixture',software:'7',apps:{}};}click(node){if(node.attributes.id==='dnd')dnd=!dnd;else{on=!on;changes++;}}back(){active='root';}shot(file){fs.writeFileSync(file,'fresh fixture screenshot');}cleanup(){} }
 const registry={...adapters,test:{async root(){active='root';},async step(){entries++;active='setting';return true;},isPage(){return true;}}};
 class FixtureNav extends Navigator {
  isPage(scope,family,route){return family===c.dnd.app ? true : super.isPage(scope,family,route);}
  async wait(family,predicate){const view={scope:scope()};assert.ok(predicate(view.scope));return view;}
  async go(page){if(page.key==='DND'){active='dnd';return{scope:scope()};}return super.go(page);}
 }
 const events=[];
 try {
  const result=await executeSession({catalog:c,registry,request:{deviceId:'test-'+randomUUID(),selection:[{id:'any-id',target:false}]},root,DeviceClass:Device,NavigatorClass:FixtureNav,emit:e=>events.push(e)});
  assert.equal(result.progress.status,'completed',result.progress.stopReason);assert.equal(changes,1);assert.equal(entries,2);assert.equal(dnd,false);assert.equal(result.progress.items['any-id'].status,'passed');
  assert.ok(events.some(e=>e.event==='diagnostic'));assert.ok(events.some(e=>e.event==='progress'));
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});
test('invalid references and controls reject before any device interaction',async()=>{
 for(const mutate of [c=>c.operations[0].page='absent',c=>c.apps.B.adapter='unknown',c=>c.operations[0].control.default='unknown',c=>c.operations.push(c.operations[0]),c=>c.overviews[0].operations=['absent']]) {
  const c=structuredClone(catalog);mutate(c);let calls=0;
  await assert.rejects(executeSession({catalog:c,request:{deviceId:'unused'},DeviceClass:class {constructor(){calls++;}}}),/清单无效/);assert.equal(calls,0);
 }
});
test('device discovery distinguishes empty, unauthorized and tool failures',()=>{
 const read=stdout=>discoverDevices('hdc',{spawn:()=>({status:0,stdout})});
 assert.throws(()=>read(''),/缺少明确结果/);assert.throws(()=>read('[W] path warning\n[Empty]'),/无法识别/);
 assert.deepEqual(read('[Empty]\n'),[]);assert.deepEqual(read('[Empty]\r\thdc\r\n'),[]);
 assert.throws(()=>read('[Empty]\r\tunexpected\r\n'),/无法识别/);
 assert.equal(read('test USB Unauthorized\n')[0].status,'Unauthorized');
 assert.throws(()=>read('[Fail] connection error'),/连接失败/);assert.throws(()=>read('garbage'),/无法识别/);
});
test('CLI plan matches the shared planner without device access',()=>{
 const r=spawnSync(process.execPath,[fileURLToPath(new URL('./run.mjs',import.meta.url)),'--plan'],{encoding:'utf8'});
 assert.equal(r.status,0,r.stderr);const out=JSON.parse(r.stdout);
 assert.deepEqual(out.pages,plan(catalog,resolveSelection(catalog)).map(p=>({page:p.key,operations:p.operations.map(o=>o.id)})));assert.equal(out.deviceActions,false);
});
test('legacy progress never replays operations; recovery checks identity and preserves a backup',async()=>{
 const root=fs.mkdtempSync(path.join(os.tmpdir(),'cyh-legacy-')),directory=path.join(root,'runs','old');fs.mkdirSync(directory,{recursive:true});
 const request={deviceId:'test-'+randomUUID(),selection:[{id:'B02',target:false}]};let on=true, clicks=0;
 const progress={schemaVersion:2,deviceId:request.deviceId,device:{model:'old',software:'7'},request,selected:['B02'],items:{},failures:[],dnd:{original:false,restorePending:true}};
 const file=path.join(directory,'progress.json'),raw=JSON.stringify(progress);fs.writeFileSync(file,raw);
 const scope=()=>n('Column',{},[n('Text',{text:'免打扰'}),n('Button',{id:'dnd',text:on?'关闭':'立即开启'})]);
 class Device {identity(){return{model:'old',software:'7'};}click(){on=!on;clicks++;}shot(f){fs.writeFileSync(f,'new evidence');}cleanup(){} }
 class Nav {async go(page){assert.equal(page.key,'DND');return{scope:scope()};}async wait(_,p){assert.ok(p(scope()));return{scope:scope()};}isPage(){return true;}reset(){} }
 try {
  class WrongDevice extends Device {identity(){return{model:'different',software:'7'};}}
  await assert.rejects(executeSession({request,root,resume:directory,DeviceClass:WrongDevice,NavigatorClass:Nav}),/身份/);
  assert.equal(fs.readFileSync(file,'utf8'),raw);assert.equal(clicks,0);
  const result=await executeSession({request,root,resume:directory,DeviceClass:Device,NavigatorClass:Nav});
  assert.equal(result.progress.schemaVersion,2);assert.equal(result.progress.status,'incomplete');assert.equal(result.progress.dnd.restorePending,false);assert.equal(clicks,1);assert.equal(on,false);assert.equal(fs.readFileSync(path.join(directory,'progress.before-core-v3.json'),'utf8'),raw);
  const after=fs.readFileSync(file,'utf8');await assert.rejects(executeSession({request,root,resume:directory,DeviceClass:Device,NavigatorClass:Nav}),/旧进度/);assert.equal(fs.readFileSync(file,'utf8'),after);
 } finally {fs.rmSync(root,{recursive:true,force:true});}
});

import { appScope, state, find, attr } from '../core/ui-tree.mjs';
const calendarFixtures=JSON.parse(fs.readFileSync(new URL('./fixtures/calendar.json',import.meta.url)));
test('calendar fixtures verify the anchored subscription and week value, rejecting unknown values',()=>{
 const [subscription,week]=resolveSelection(catalog,[{id:'C01',target:false},{id:'C02',target:'星期一'}]);
 const scope=tag=>appScope(calendarFixtures[tag],catalog.apps.C.bundle);
 assert.equal(state(scope('settings-before'),subscription.locator).checked,true);
 assert.equal(state(scope('settings-before'),week.locator).checked,false);
 assert.equal(state(scope('week-after'),week.locator).checked,true);
 const bad=structuredClone(scope('week-after'));
 find(bad,{text:'星期一'})[0].attributes.text='unknown';
 assert.throws(()=>state(bad,week.locator),/未知/);
});
test('calendar menu choice runs through the shared page transaction and reenters once',async()=>{
 const [op]=resolveSelection(catalog,[{id:'C02',target:'星期一'}]);
 const page=plan(catalog,[op])[0];let screen='root',choiceClicks=0,entries=0;
 const device={revision:0,tree:()=>calendarFixtures[screen],launch(){screen='root';this.revision++;},back(){screen='root';this.revision++;},click(n){
  this.revision++;
  if(attr(n).id==='more_menu')screen='menu';
  else if(attr(n).id==='menu_preferences'){entries++;screen=choiceClicks?'week-after':'settings-before';}
  else if(attr(n).id==='settings_start_of_week')screen='week-before';
  else if(attr(n).text==='星期一'){choiceClicks++;screen='week-after';}
  else throw Error('unexpected click');
 }};
 const nav=new Navigator(device), progress={items:{},failures:[]};let shots=0;
 const {runPages}=await import('../core/runner.mjs');
 await runPages({pages:[page],device,nav,progress,persist(){},evidence(){shots++;return{path:'fresh-'+shots};}});
 assert.equal(progress.items.C02.status,'passed',progress.items.C02.error);assert.equal(choiceClicks,1);assert.equal(entries,2);assert.equal(shots,3);
 await runPages({pages:[page],device,nav,progress:{items:{},failures:[]},persist(){},evidence(){return{path:'unchanged'};}});
 assert.equal(choiceClicks,1);assert.equal(entries,2);
});

import net from 'node:net';
import { HdcService } from '../core/hdc-service.mjs';
import { Device as HdcDevice } from '../core/device.mjs';
const fixtureHdc={executable:process.execPath,args:[fileURLToPath(new URL('./fixtures/hdc-service.mjs',import.meta.url))]};
async function freePort() {
 const server=net.createServer();await new Promise(resolve=>server.listen(0,'127.0.0.1',resolve));
 const port=server.address().port;await new Promise(resolve=>server.close(resolve));return port;
}
test('managed hdc exits with its owner; all device clients disable daemon auto-start',async()=>{
 const service=new HdcService(fixtureHdc,{port:await freePort()});
 try {
  const client=await service.start();assert.deepEqual(discoverDevices(client),[]);
  const device=new HdcDevice('fixture',()=>{},client);assert.match(device.shell('ignored'),/Empty/);
  assert.ok(service.child.pid);const child=service.child;
  await service.stop();assert.ok(child.exitCode!==null||child.signalCode!==null);
  await service.stop();await assert.rejects(service.start(),/退出/);
 } finally {await service.stop();}
});
test('borrowed hdc stays alive when another client exits',async()=>{
 const owner=new HdcService(fixtureHdc,{port:await freePort()});
 try {
  await owner.start();const borrower=new HdcService(fixtureHdc,{port:owner.port});
  await borrower.start();assert.equal(borrower.child,undefined);await borrower.stop();
  assert.equal(owner.child.exitCode,null);assert.deepEqual(discoverDevices(owner.client),[]);
 } finally {await owner.stop();}
});
test('shutdown during hdc startup leaves no process and failed startup cannot auto-spawn',async()=>{
 const service=new HdcService(fixtureHdc,{port:await freePort()});
 const pending=service.start();await service.stop();await assert.rejects(pending,/退出|取消/);
 assert.ok(!service.child || service.child.exitCode!==null || service.child.signalCode!==null);
 const broken=new HdcService({executable:process.execPath,args:['--not-a-real-node-option']},{port:await freePort(),timeout:1000});
 await assert.rejects(broken.start(),/未就绪/);await broken.stop();
});
