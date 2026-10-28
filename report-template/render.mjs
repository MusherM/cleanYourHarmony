import {readFileSync, writeFileSync, mkdirSync} from 'node:fs';
import {dirname, resolve} from 'node:path';
import {fileURLToPath} from 'node:url';
import {readReport} from './validate.mjs';
const esc = value => String(value).replace(/[&<>"']/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;'}[c]));
const labels = {passed:'已通过',failed:'未通过',partial:'部分完成',blocked:'受阻',not_found:'未找到',not_tested:'未验证',build:'构建',install:'安装',launch:'启动',functional:'业务功能',regression:'回归'};
const list = items => `<ul>${items.map(x=>`<li>${esc(x)}</li>`).join('')}</ul>`;
export function render(data) {
  const time = data.generatedAt.slice(0,16).replace('T',' ') + ' 北京时间';
  const stats = ['passed','failed','blocked','not_tested','not_found'].map(s=>`<div class="stat" data-status="${s}"><strong>${data.checks.filter(c=>c.status===s).length}</strong><span>${labels[s]}</span></div>`).join('');
  const checks = data.checks.map((c,i)=>`<details class="check"${i===0?' open':''} data-status="${c.status}"><summary><span class="check-id">${esc(c.id)}</span><span class="check-name">${esc(c.name)}<small>${labels[c.level]}验收</small></span><span class="status" data-status="${c.status}">${labels[c.status]}</span></summary><div class="check-body"><div><b>预期结果</b><p>${esc(c.expected)}</p></div><div><b>实际观察</b><p>${esc(c.observed)}</p></div><div class="evidence"><b>证据记录</b>${c.evidence.length?list(c.evidence):'<p>暂无证据；本项未形成已验证结论。</p>'}</div></div></details>`).join('');
  const body = `<div class="section-head"><span>${data.mode==='demo'?'模板预览':'验收报告'}</span><span class="status" data-status="${data.status}">${labels[data.status]}</span></div><h2>${esc(data.title)}</h2><p class="summary">${esc(data.summary)}</p><p class="meta">${esc(time)}<br>对应提交：${esc(data.commit)}</p>${data.mode==='demo'?'<div class="demo">演示报告 · 以下内容仅用于展示模板，未执行实际设备验收。</div>':''}<div class="stats">${stats}</div><div class="overview"><section><h3>本次验证范围</h3>${list(data.scope)}</section><section><h3>执行环境</h3><p>${esc(data.environment)}</p></section></div><section class="checks"><h3>逐项核验<span>${data.checks.length} 项</span></h3>${checks}</section><section class="limits"><div class="limits-head"><h3>结论边界</h3></div>${list(data.limitations)}</section><section class="handoff"><h3>下一步</h3>${data.nextSteps.length?list(data.nextSteps):'<p>无后续步骤。</p>'}</section>`;
  return readFileSync(new URL('./template.html',import.meta.url),'utf8').replace('@@TITLE@@',()=>esc(`CleanYourHarmony · ${data.title} | ${time}`)).replace('@@REPORT@@',()=>body);
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
 try {
  const [input,output] = process.argv.slice(2);
  if(!input||!output) throw new Error('用法：node render.mjs <report.json> <output.html>');
  const data=readReport(input); // Always validate before opening the output file.
  const html=render(data);
  mkdirSync(dirname(resolve(output)),{recursive:true});
  writeFileSync(output,html,{flag:'wx'}); // Historical reports must never be silently replaced.
  console.log(`GENERATED：${resolve(output)}`);
 } catch(error){console.error(error.message);process.exitCode=1;}
}
