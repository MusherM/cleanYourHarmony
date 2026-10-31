import fs from 'node:fs';
// Default application metadata; callers may inject another validated catalog.
const defaults=JSON.parse(fs.readFileSync(new URL('../operations.json', import.meta.url)));
export const APPS = defaults.apps;
export const DND_PAGE = {key:'DND',family:defaults.dnd.app,route:defaults.dnd.route};
export function plan(catalog, selected = catalog.operations) {
  const pages = new Map();
  for (const op of selected) {
    const page = catalog.pages[op.page];
    if (!page) throw new Error('页面不存在：' + op.page);
    if (!pages.has(op.page)) pages.set(op.page, { key: op.page, family: page.app, route: [...page.route], notification: page.kind === 'notification', operations: [] });
    pages.get(op.page).operations.push(op);
  }
  return [...pages.values()].sort((a,b) => catalog.categories.findIndex(c => c.id === a.operations[0].category) - catalog.categories.findIndex(c => c.id === b.operations[0].category) || a.key.localeCompare(b.key,'zh-CN'));
}
