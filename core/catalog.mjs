import fs from 'node:fs';
import { validateCatalog } from './validation.mjs';
import { plan } from './routes.mjs';
import { fileURLToPath } from 'node:url';

export const catalogPath = fileURLToPath(new URL('../operations.json', import.meta.url));
export function readCatalog() { return validateCatalog(JSON.parse(fs.readFileSync(catalogPath, 'utf8'))); }
export function defaultSelection(catalog) {
  return catalog.operations.filter(o => o.default_selected).map(o => ({ id: o.id, target: o.control.default }));
}
export function resolveSelection(catalog, selection = defaultSelection(catalog)) {
  if (!Array.isArray(selection) || !selection.length) throw new Error('请至少选择一个项目');
  const seen = new Set();
  const operations = selection.map(item => {
    if (!item || typeof item !== 'object') throw new Error('项目格式无效');
    const op = catalog.operations.find(o => o.id === item.id);
    if (!op || seen.has(item.id)) throw new Error('项目未知或重复：' + item.id);
    seen.add(item.id);
    if (!op.control.values.some(v => v.value === item.target)) throw new Error('目标状态无效：' + item.id);
    return { ...op, requestedTarget: item.target,
      target: { checked: op.control.type === 'choice' ? true : item.target },
      locator: op.control.type === 'choice' ? { ...op.locator, originalText: item.target } : op.locator };
  });
  return operations.sort((a, b) => catalog.operations.indexOf(catalog.operations.find(o => o.id === a.id)) - catalog.operations.indexOf(catalog.operations.find(o => o.id === b.id)));
}
export function publicCatalog(catalog) {
  return { categories: catalog.categories, operations: plan(catalog).flatMap(page => page.operations).map(o => ({
    id: o.id, name: o.display_name, category: o.category, selected: o.default_selected, control: o.control,
  })) };
}
