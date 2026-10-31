import test from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import { bool, control, state, appScope, titleIs } from './ui-tree.mjs';
import { plan } from './routes.mjs';
import { runPages, dnd } from './runner.mjs';
const n=(type, attrs={}, children=[])=>({attributes:{type,visible:'true',bounds:'[0,200][500,600]',...attrs},children});
const row=(label,checked)=>n('Row',{},[n('Text',{text:label}),n('Toggle',{checked:String(checked),enabled:'true'})]);
const dndCard=on=>n('Column',{},[n('Text',{text:'免打扰'}),n('Button',{text:on?'关闭':'立即开启',enabled:'true'})]);
const loc=label=>({type:'Toggle',anchorText:label});
function rig(values={甲:true,乙:false}) {
  let clicks=0,reentries=0,shots=0,saves=0;
  const page={key:'test',family:'B',route:['设置'],operations:Object.keys(values).map((label,i)=>({id:'B0'+i,locator:loc(label),target:{checked:false},screenshot:{group:'G'}}))};
  const tree=()=>n('Column',{},Object.entries(values).map(([label,value])=>row(label,value)));
  const nav={go:async()=>({scope:tree()}),current:async()=>({scope:tree()}),wait:async(_,p)=>{const scope=tree();assert.ok(p(scope));return{scope};},isPage:()=>true,reenter:async()=>{reentries++;return{scope:tree()};},reset:()=>{}};
  const device={click:node=>{clicks++;for(const [label,value] of Object.entries(values))if(String(value)===node.attributes.checked&&value){values[label]=false;break;}}};
  const progress={items:{},failures:[]};
  const options={pages:[page],device,nav,progress,persist:()=>saves++,evidence:()=>{shots++;return{path:'shot.png',at:'now'};}};
  return {options,values,counts:()=>({clicks,reentries,shots,saves})};
}
test('booleans never treat the string false as enabled',()=>{assert.equal(bool('false'),false);assert.throws(()=>bool(''));});
test('nearest anchor container and ambiguity rejection',()=>{const root=n('Column',{},[row('甲',true),row('乙',false)]);assert.equal(state(root,loc('乙')).checked,false);assert.throws(()=>control(n('Row',{},[n('Text',{text:'甲'}),n('Toggle'),n('Toggle')]),loc('甲')));});
test('foreground sheet excludes stale background controls',()=>{const front=n('SheetWrapper',{zIndex:'3'},[n('HdsTitleBar',{},[n('Text',{text:'前台'})]),row('甲',false)]);const root=n('',{bounds:'[0,0][500,900]'},[n('root',{bundleName:'app'},[row('甲',true),front])]);const s=appScope(root,'app');assert.ok(titleIs(s,'前台'));assert.equal(state(s,loc('甲')).checked,false);});
test('notification overlay is rejected before clicking',()=>{const root=n('',{},[n('root',{bundleName:'app'},[row('甲',true)]),n('WindowScene',{},[n('Stack',{id:'SCBBannerBuilder'})])]);assert.throws(()=>appScope(root,'app'),/横幅/);});
test('default plan includes all 22 exactly once, 17 pages',()=>{const pages=plan(JSON.parse(fs.readFileSync(new URL('../operations.json',import.meta.url))));assert.equal(pages.length,17);assert.equal(new Set(pages.flatMap(p=>p.operations.map(o=>o.id))).size,22);});
test('one changed control, one unchanged: one click and one local reentry',async()=>{const r=rig();await runPages(r.options);assert.equal(r.counts().clicks,1);assert.equal(r.counts().reentries,1);assert.equal(r.options.progress.items.B00.status,'passed');assert.equal(r.options.progress.items.B01.status,'unchanged');});
test('all satisfied: no toggle and no reentry',async()=>{const r=rig({甲:false,乙:false});await runPages(r.options);assert.equal(r.counts().clicks,0);assert.equal(r.counts().reentries,0);assert.equal(r.counts().shots,1);});
test('screenshot failure cannot mark a changed control complete or toggle it twice',async()=>{const r=rig({甲:true});r.options.evidence=()=>{throw Error('disk full');};await runPages(r.options);assert.equal(r.options.progress.items.B00.status,'failed');assert.equal(r.options.progress.items.B00.mutationPending,true);assert.equal(r.counts().clicks,1);r.options.evidence=()=>({path:'recovered.png'});await runPages(r.options);assert.equal(r.counts().clicks,1);assert.equal(r.counts().reentries,1);assert.equal(r.options.progress.items.B00.status,'passed');});
test('resume skips completed pages',async()=>{const r=rig();await runPages(r.options);const counts=r.counts();await runPages(r.options);assert.deepEqual(r.counts(),counts);});
test('two changes on same page reenter once',async()=>{const r=rig({甲:true,乙:true});await runPages(r.options);assert.equal(r.counts().clicks,2);assert.equal(r.counts().reentries,1);});
test('DND originally on is never turned off by cleanup',async()=>{let clicks=0;const progress={};const scope=dndCard(true);const options={progress,persist:()=>{},evidence:()=>({path:'dnd.png'}),nav:{go:async()=>({scope}),reset:()=>{}},device:{click:()=>clicks++}};await dnd(options);await dnd({...options,restore:true});assert.equal(clicks,0);assert.equal(progress.dnd.original,true);assert.equal(progress.dnd.restorePending,false);});
test('DND mutation intent survives screenshot failure',async()=>{const progress={};let on=false;const scope=()=>dndCard(on);const options={progress,persist:()=>{},evidence:()=>{throw Error('capture failed');},nav:{go:async()=>({scope:scope()}),wait:async(_,pred)=>assert.ok(pred(scope())),isPage:()=>true,reset:()=>{}},device:{click:()=>{on=!on;}}};await assert.rejects(dnd(options), /capture failed/);assert.equal(progress.dnd.restorePending,true);assert.equal(progress.dnd.original,false);options.evidence=()=>({path:'restored.png'});await dnd({...options,restore:true});assert.equal(on,false);assert.equal(progress.dnd.restorePending,false);});
test('anchor cannot bind an unrelated switch lower on the page',()=>{const root=n('Column',{},[n('Text',{text:'免打扰',bounds:'[0,100][300,200]'}),n('Toggle',{checked:'false',enabled:'true',bounds:'[300,700][400,800]'})]);assert.throws(()=>state(root,loc('免打扰')),/同一行/);});
test('first navigation failure stops the run before later pages',async()=>{const r=rig();let calls=0;r.options.pages.push({...r.options.pages[0],key:'second'});r.options.nav.go=async()=>{calls++;throw Error('wrong page');};await runPages(r.options);assert.equal(calls,1);assert.equal(r.counts().clicks,0);assert.equal(r.options.progress.stopReason,'wrong page');});
test('cancellation never starts a page',async()=>{const r=rig();r.options.cancelled=()=>true;await runPages(r.options);assert.equal(r.counts().clicks,0);assert.equal(r.counts().shots,0);assert.deepEqual(r.options.progress.items,{});});
test('repeated page title and provider text do not hide the unique same-row switch',()=>{const root=n('Column',{},[n('Text',{text:'内容精选',bounds:'[0,100][300,180]'}),row('内容精选',true),n('Text',{text:'内容精选',bounds:'[0,700][300,800]'})]);assert.equal(state(root,loc('内容精选')).checked,true);});
test('multiline setting label binds its compact Row switch',()=>{const root=n('Column',{bounds:'[0,0][500,2000]'},[n('Row',{bounds:'[0,200][500,650]'},[n('Column',{},[n('Text',{text:'实用工具',bounds:'[0,220][300,280]'}),n('Text',{text:'多行说明',bounds:'[0,300][300,600]'})]),n('Toggle',{checked:'false',enabled:'true',bounds:'[350,380][450,450]'})])]);assert.equal(state(root,loc('实用工具')).checked,false);});
test('off-screen controls cannot count as verified screenshot evidence',()=>{const root=n('Column',{bounds:'[0,0][500,500]'},[n('Row',{bounds:'[0,600][500,800]'},[n('Text',{text:'甲',bounds:'[0,620][300,680]'}),n('Toggle',{checked:'false',enabled:'true',bounds:'[350,620][450,680]'})])]);assert.throws(()=>state(root,loc('甲')),/视口/);});
test('disabled non-target control is a recorded business failure with no click',async()=>{const r=rig({甲:true});const view=()=>({scope:n('Column',{},[n('Row',{},[n('Text',{text:'甲'}),n('Toggle',{checked:'true',enabled:'false'})])])});r.options.nav.current=async()=>view();await runPages(r.options);assert.equal(r.options.progress.items.B00.failureKind,'disabled');assert.equal(r.options.progress.items.B00.status,'failed');assert.equal(r.counts().clicks,0);assert.equal(r.counts().reentries,0);});
import { Navigator } from './navigator.mjs';
import { notification } from '../core/adapters/notification.mjs';
test('consecutive reads reuse one current snapshot until a device action or screenshot',async()=>{let calls=0;const tree=n('',{bounds:'[0,0][500,1000]'},[n('root',{bundleName:'com.huawei.hmos.browser'},[row('甲',false)])]);const device={revision:0,tree:()=>{calls++;return tree;}};const nav=new Navigator(device);await nav.wait('B',()=>true);await nav.wait('B',()=>true);assert.equal(calls,1);device.revision++;await nav.wait('B',()=>true);assert.equal(calls,2);nav.reset();await nav.wait('B',()=>true);assert.equal(calls,3);});
test('expired snapshot forces a fresh tree even without an action',async()=>{let calls=0;const tree=n('',{bounds:'[0,0][500,1000]'},[n('root',{bundleName:'com.huawei.hmos.browser'},[])]);const nav=new Navigator({revision:0,tree:()=>{calls++;return tree;}});await nav.wait('B',()=>true);nav.view.at-=501;await nav.wait('B',()=>true);assert.equal(calls,2);});
test('notification sibling keeps search open and validates the destination',async()=>{
  const actions=[];const nav=new Navigator({back:()=>actions.push('back')});
  nav.family='N';nav.route=['通知和状态栏','视频'];
  const scope=n('Column',{},[n('SearchField')]);
  nav.wait=async(_,p)=>{assert.ok(p(scope));return{scope};};
  nav.registry={...nav.registry,settings:{...nav.registry.settings,notification:async(app,open)=>actions.push([app,open])}};
  nav.current=async page=>{actions.push(['verify',page.route[1]]);return{scope};};
  await nav.go({family:'N',route:['通知和状态栏','音乐']});
  assert.deepEqual(actions,['back',['音乐',true],['verify','音乐']]);
  assert.deepEqual(nav.route,['通知和状态栏','音乐']);
});
test('notification sibling tolerates a real return to list without assuming search',async()=>{
  const actions=[];const nav=new Navigator({back:()=>actions.push('back')});
  nav.family='N';nav.route=['通知和状态栏','视频'];
  const scope=n('Column',{},[n('HdsTitleBar',{},[n('Text',{text:'通知和状态栏'})])]);
  nav.wait=async(_,p)=>{assert.ok(p(scope));return{scope};};
  nav.registry={...nav.registry,settings:{...nav.registry.settings,notification:async(app,open)=>actions.push([app,open])}};
  nav.current=async()=>({scope});
  await nav.go({family:'N',route:['通知和状态栏','音乐']});
  assert.deepEqual(actions,['back',['音乐',false]]);
});
test('cancellation is checked before a cached snapshot can be reused',async()=>{
  let cancelled=false;
  const tree=n('',{bounds:'[0,0][500,1000]'},[n('root',{bundleName:'com.huawei.hmos.browser'},[])]);
  const nav=new Navigator({revision:0,tree:()=>tree},()=>cancelled);
  await nav.wait('B',()=>true);cancelled=true;
  await assert.rejects(nav.wait('B',()=>true),/中断/);
});
import { Device } from './device.mjs';
test('batched cleanup removes only recorded temporary trees and retains failed cleanup for retry',()=>{
  const d=new Device('test',()=>{});const files=['/data/local/tmp/cyh_a.json','/data/local/tmp/cyh_b.json'];files.forEach(f=>d.temporaryFiles.add(f));
  let calls=0;d.shell=(...args)=>{calls++;assert.deepEqual(args,['rm','-f',...files]);throw Error('cleanup failed');};
  assert.throws(()=>d.cleanup(),/cleanup failed/);assert.equal(d.temporaryFiles.size,2);
  d.shell=(...args)=>{calls++;assert.deepEqual(args,['rm','-f',...files]);};d.cleanup();d.cleanup();assert.equal(calls,2);assert.equal(d.temporaryFiles.size,0);
});
test('a ready title with a loading control refreshes the cached tree before reading state',async()=>{
  let calls=0;const page={family:'B',route:['设置']};
  const tree=children=>n('',{bounds:'[0,0][500,1000]'},[n('root',{bundleName:'com.huawei.hmos.browser',bounds:'[0,0][500,1000]'},[n('HdsTitleBar',{},[n('Text',{text:'设置'})]),...children])]);
  const nav=new Navigator({revision:0,tree:()=>{calls++;return calls===1?tree([n('Text',{text:'正在加载...'})]):tree([row('甲',false)]);}});
  await nav.current(page);const view=await nav.current(page,loc('甲'));assert.equal(calls,2);assert.equal(state(view.scope,loc('甲')).checked,false);
});

import { keyboardVisible } from './ui-tree.mjs';
const wetypeFixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/notification-wetype.json', import.meta.url)));
test('captured WeType search tree is dismissed once before scope inspection',async()=>{
  const before=wetypeFixture();
  assert.equal(keyboardVisible(before),true);
  assert.throws(()=>appScope(before,'com.huawei.hmos.settings'),/遮挡/);
  const after=structuredClone(before);
  after.children=after.children.filter(n=>n.attributes.bundleName!=='com.tencent.wetype.hmos'&&!n.attributes.id.startsWith('keyboardPanel'));
  let backs=0;
  const nav=new Navigator({revision:0,tree:()=>backs?after:before,back:()=>backs++});
  const view=await nav.wait('N',s=>find(s,{type:'SearchField'}).length===1);
  assert.equal(backs,1);assert.equal(keyboardVisible(view.tree),false);
});
test('hidden keyboard panel and unrelated foreign window cannot trigger dismissal',async()=>{
  const tree=wetypeFixture();
  tree.children.find(n=>n.attributes.id.startsWith('keyboardPanel')).attributes.visible='false';
  assert.equal(keyboardVisible(tree),false);
  let backs=0;
  const nav=new Navigator({tree:()=>tree,back:()=>backs++});
  await assert.rejects(nav.wait('N',()=>true,1),/遮挡/);assert.equal(backs,0);
});
test('persistent keyboard causes bounded failure without repeated Back',async()=>{
  let backs=0;const nav=new Navigator({tree:wetypeFixture,back:()=>backs++});
  await assert.rejects(nav.wait('N',()=>true,250),/键盘遮挡/);assert.equal(backs,1);
});
import { find } from './ui-tree.mjs';
const foldFixture = () => JSON.parse(fs.readFileSync(new URL('./fixtures/fold-settings.json', import.meta.url)));
test('expanded foldable system handle outside content is accepted and detail title wins',()=>{
  const tree=foldFixture(), scope=appScope(tree,'com.huawei.hmos.settings');
  assert.equal(titleIs(scope,'用户体验改进计划'),true);
  assert.equal(titleIs(scope,'设置'),false);
  assert.equal(new Navigator({}).isPage(scope,'N',[]),true);
  tree.children.at(-1).attributes.bounds='[1160,150][1424,238]';
  assert.throws(()=>appScope(tree,'com.huawei.hmos.settings'),/遮挡/);
});
test('foldable top-level navigation scrolls sidebar instead of larger detail',async()=>{
  const tree=foldFixture(), sidebar=find(tree,{type:'NavBar'})[0];
  sidebar.children.push(n('List',{bounds:'[44,261][990,1828]'}));
  const detail=find(tree,{type:'NavDestination'})[0];
  detail.children.push(n('Scroll',{bounds:'[1035,261][2584,1828]'}));
  let swipes=0,clicks=0;const device={revision:0,tree:()=>tree,ui:(_,x)=>{assert.ok(x<1034);swipes++;device.revision++;sidebar.children[1].children=[n('Text',{text:'情景模式',bounds:'[198,500][374,552]'})];},click:()=>clicks++};
  await new Navigator(device).entry('N','情景模式',true);
  assert.equal(swipes,1);assert.equal(clicks,1);
});
test('foldable top-level siblings reuse the visible sidebar without Back exiting Settings',async()=>{
  let backs=0;const nav=new Navigator({tree:foldFixture,back:()=>backs++});
  nav.family='N';nav.route=['情景模式'];
  await nav.parent();assert.equal(backs,0);assert.deepEqual(nav.route,[]);
});
test('browser startup waits for content instead of clicking an empty loading window',async()=>{
  let reads=0,clicks=0;
  const tree=()=>n('',{bounds:'[0,0][500,1000]'},[n('root',{bundleName:'com.huawei.hmos.browser'},reads===1?[]:[n('HdsTitleBar',{},[n('Text',{text:'我的'})])])]);
  const nav=new Navigator({launch:()=>{},tree:()=>{reads++;return tree();},click:()=>clicks++});
  await nav.root('B');assert.equal(reads,2);assert.equal(clicks,0);
});
test('transient overlay must disappear before a page can be used',async()=>{
  let reads=0;
  const nav=new Navigator({tree:()=>n('',{},[n('root',{bundleName:'com.huawei.hmos.browser'},reads++===0?[n('Popup')]:[])])});
  await nav.wait('B',()=>true);assert.equal(reads,2);
});
for(const persistent of [false,true])test(`known priority-notification tip is dismissed once, persistent=${persistent}`,async()=>{
  let backs=0;
  const text='原“置顶显示通知”功能合并到“优先通知”，可设置本应用所有消息优先显示或者通过智能识别优先显示';
  const nav=new Navigator({back:()=>backs++,tree:()=>n('',{},[n('root',{bundleName:'com.huawei.hmos.settings'},persistent||!backs?[n('Popup',{},[n('Text',{text})])]:[])])});
  if(persistent)await assert.rejects(nav.wait('N',()=>true,250),/功能提示仍未消失/);
  else await nav.wait('N',()=>true);
  assert.equal(backs,1);
});
test('notification search with no IME never backs out and waits for the requested result',async()=>{
  let typed=false,clicked=false,reads=0;
  const tree=()=>n('',{},[n('root',{bundleName:'com.huawei.hmos.settings'},[
    n('SearchField',{text:typed?'浏览器':''}),
    ...(typed?[n('List',{id:'searchResultListComponent'},reads>2?[n('Text',{text:'浏览器'})]:[])]:[])
  ])]);
  const device={revision:0,tree:()=>{reads++;return tree();},ui:()=>{typed=true;device.revision++;},back:()=>assert.fail('unexpected Back'),click:node=>{assert.equal(node.attributes.text,'浏览器');clicked=true;}};
  const nav=new Navigator(device);nav.family='N';await notification.call(nav,'浏览器',true);assert.equal(clicked,true);assert.ok(reads>=3);
});

import { NotificationNotFound } from './navigator.mjs';
test('missing notification has evidence, continues and is skipped on resume',async()=>{
  const r=rig();const missing={key:'missing',family:'N',notification:true,route:['通知和状态栏','视频'],operations:[{id:'N04'}]};
  r.options.pages.unshift(missing);const go=r.options.nav.go;
  r.options.nav.go=async p=>{if(p===missing)throw new NotificationNotFound('视频');return go(p);};
  await runPages(r.options);
  assert.equal(r.options.progress.items.N04.status,'not_found');assert.equal(r.options.progress.items.N04.evidence.length,1);
  assert.equal(r.options.progress.items.B00.status,'passed');assert.equal(r.options.progress.failures.length,0);
  const counts=r.counts();await runPages(r.options);assert.deepEqual(r.counts(),counts);
});
test('missing notification without screenshot remains an execution failure',async()=>{
  const r=rig();r.options.pages[0].notification=true;r.options.nav.go=async()=>{throw new NotificationNotFound('视频');};r.options.evidence=()=>{throw Error('disk full');};
  await runPages(r.options);assert.equal(r.options.progress.items.B00.status,'failed');assert.equal(r.options.progress.stopReason,'disk full');
});
for(const scenario of ['missing','empty','wrong-query','loading','overlay','command'])test(`notification absence classification: ${scenario}`,async()=>{
  let calls=0;
  const scope=n('Column',{},[n('SearchField',{text:scenario==='wrong-query'?'旧词':'视频'}),n('List',{id:'searchResultListComponent'},scenario==='empty'?[]:[n('Text',{text:'其他应用'})]),...(scenario==='loading'?[n('LoadingProgress')]:[])]);
  const nav=new Navigator({ui:()=>{},click:()=>{}});
  nav.wait=async()=>{calls++;if(calls===1)return{scope:n('Column',{},[n('SearchField',{text:''})])};if(calls===2)throw Error(scenario==='overlay'?'前台存在其他应用窗口或遮挡':scenario==='command'?'设备命令失败':'页面未达到预期');return{scope};};
  await assert.rejects(notification.call(nav,'视频',true),e=>['missing','empty'].includes(scenario)?e instanceof NotificationNotFound:!(e instanceof NotificationNotFound));
});
