// UI tests only: the test runner installs this file into a disposable copy of
// the app. Production builds always package scripts/desktop-host.mjs instead.
import readline from 'node:readline';
import fs from 'node:fs';
import path from 'node:path';
import {publicCatalog, readCatalog} from './catalog.mjs';
const emit = value => process.stdout.write(JSON.stringify(value) + '\n');
const catalog = publicCatalog(readCatalog());
const capture = process.env.CYH_UI_CAPTURE ?? path.join(process.argv[process.argv.indexOf('--data-dir') + 1], 'ui-request.json');
let request, selected, items, timer;
const progress = status => ({status, ...(status!=='running'?{finishedAt:new Date().toISOString()}:{}), selected, items, currentItem:selected[0], dnd:{restorePending:status==='running', ...(status!=='running'?{restored:{checked:false}}:{})}});
function finish(cancelled) {
  clearTimeout(timer);
  if (!request) return;
  if (!cancelled) selected.forEach((id,index)=>items[id]={status:index===0?'passed':index===1?'unchanged':'failed', ...(index>1?{error:'fixture disabled control'}:{})});
  const result={directory:'',progress:progress(cancelled?'incomplete':selected.length>2?'completed_with_failures':'completed')};
  emit({event:'progress',...result}); emit({id:request.id,result}); request=null; emit({event:'idle',recoverable:[]});
}
emit({event:'ready',recoverable:[]});
process.stderr.write('UI fixture ready\n');
for await(const line of readline.createInterface({input:process.stdin})) {
  const m=JSON.parse(line);
  process.stderr.write(`UI fixture request: ${m.method}\n`);
  switch(m.method) {
    case 'catalog': emit({id:m.id,result:catalog}); break;
    case 'devices': emit({id:m.id,result:[{id:'fixture-device',status:'Connected',model:'UI TEST DEVICE',software:'fixture'}]}); emit({event:'idle',recoverable:[]}); break;
    case 'execute':
      request=m; selected=m.params.request.selection.map(s=>s.id); items={};
      fs.writeFileSync(capture,JSON.stringify(m.params.request));
      emit({event:'progress',directory:'',progress:progress('running')});
      timer=setTimeout(()=>finish(false),3000); break;
    case 'cancel': emit({id:m.id,result:{accepted:true}}); finish(true); break;
    case 'shutdown': emit({id:m.id,result:{accepted:true}}); finish(true); process.exit(0);
    default: emit({id:m.id,error:'Unsupported UI fixture request'});
  }
}
