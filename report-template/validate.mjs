import {readFileSync} from 'node:fs';
import {fileURLToPath} from 'node:url';
import {resolve} from 'node:path';
const schema = JSON.parse(readFileSync(new URL('./report.schema.json', import.meta.url), 'utf8'));
// Dependency-free validator for the exact keywords used by this versioned schema.
export function validate(data) {
  const errors = [];
  function visit(value, rule, path) {
    const fail = message => errors.push(`${path}: ${message}`);
    if ('const' in rule && value !== rule.const) fail(`必须为 ${rule.const}`);
    if (rule.enum && !rule.enum.includes(value)) fail(`必须为 ${rule.enum.join(', ')}`);
    const type = Array.isArray(value) ? 'array' : value === null ? 'null' : typeof value;
    if (rule.type && type !== rule.type) { fail(`需要 ${rule.type}，实际 ${type}`); return; }
    if (type === 'string') {
      if (rule.minLength && value.trim().length < rule.minLength) fail('不能为空');
      if (rule.pattern && !new RegExp(rule.pattern).test(value)) fail('格式不匹配');
    }
    if (type === 'object' && rule.properties) {
      for (const key of rule.required || []) if (!(key in value)) fail(`缺少 ${key}`);
      for (const [key, item] of Object.entries(value)) {
        if (rule.properties[key]) visit(item, rule.properties[key], `${path}.${key}`);
        else if (rule.additionalProperties === false) fail(`未知字段 ${key}`);
      }
    }
    if (type === 'array') {
      if (value.length < (rule.minItems || 0)) fail(`至少 ${rule.minItems} 项`);
      value.forEach((item, i) => visit(item, rule.items, `${path}[${i}]`));
    }
  }
  visit(data, schema, '$');
  if (errors.length) return errors;
  const date = new Date(data.generatedAt);
  if (!Number.isFinite(date.getTime()) || new Date(date.getTime() + 8 * 3600000).toISOString().slice(0,19) !== data.generatedAt.slice(0,19)) errors.push('$.generatedAt: 非法北京时间');
  const ids = new Set();
  for (const [i, check] of data.checks.entries()) {
    if (ids.has(check.id)) errors.push(`$.checks[${i}].id: 重复 ID`);
    ids.add(check.id);
    if (['passed','failed','not_found'].includes(check.status) && !check.evidence.length) errors.push(`$.checks[${i}].evidence: 已验证结论必须附证据`);
  }
  const states = data.checks.map(x => x.status);
  const expected = states.every(x => x === 'passed') ? 'passed' : states.every(x => x === 'not_tested') ? 'not_tested' : states.every(x => ['blocked','not_tested'].includes(x)) ? 'blocked' : 'partial';
  if (data.status !== expected) errors.push(`$.status: 按检查项应为 ${expected}`);
  return errors;
}
export function readReport(path) {
  const data = JSON.parse(readFileSync(path, 'utf8'));
  const errors = validate(data);
  if (errors.length) throw new Error(errors.join('\n'));
  return data;
}
if (process.argv[1] && resolve(process.argv[1]) === fileURLToPath(import.meta.url)) {
  try { if (!process.argv[2]) throw new Error('用法：node validate.mjs <report.json>'); readReport(process.argv[2]); console.log('VALID：结构及状态一致性通过；不代表证据真实性已核验。'); }
  catch (error) { console.error(error.message); process.exitCode = 1; }
}
