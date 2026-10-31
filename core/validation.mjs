import { adapters } from './adapters/index.mjs';
export function validateCatalog(catalog, registry = adapters) {
  const require = (condition, label) => { if (!condition) throw new Error('清单无效：' + label); };
  const text = v => typeof v === 'string' && v.length > 0;
  const route = v => Array.isArray(v) && v.every(text);
  const unique = (items, label) => { require(Array.isArray(items),label); const ids=items.map(i=>i.id); require(ids.every(text) && new Set(ids).size === ids.length,label); return new Set(ids); };
  require(catalog?.schema_version === 3,'schema_version');
  const categories=unique(catalog.categories,'categories'), ids=unique(catalog.operations,'operations');
  require(catalog.apps && Object.keys(catalog.apps).length,'apps');
  for (const [id,app] of Object.entries(catalog.apps)) require(text(id) && text(app.bundle) && text(app.ability) && text(app.root) && Object.hasOwn(registry,app.adapter),'app ' + id);
  require(catalog.pages && Object.keys(catalog.pages).length,'pages');
  const destinations=new Set();
  for (const [id,page] of Object.entries(catalog.pages)) {
    require(text(id) && Object.hasOwn(catalog.apps,page.app) && route(page.route) && ['standard','notification'].includes(page.kind),'page ' + id);
    const destination=JSON.stringify([page.app,page.route]); require(!destinations.has(destination),'重复页面 ' + id); destinations.add(destination);
  }
  const pageCategories=new Map();
  for (const op of catalog.operations) {
    require(Object.hasOwn(catalog.pages,op.page) && categories.has(op.category),'项目引用 ' + op.id);
    require(!pageCategories.has(op.page) || pageCategories.get(op.page) === op.category,'同页分类冲突 ' + op.id); pageCategories.set(op.page,op.category);
    require(text(op.display_name) && typeof op.default_selected === 'boolean','项目显示 ' + op.id);
    const c=op.control; require(c && ['toggle','choice'].includes(c.type) && Array.isArray(c.values) && c.values.length,'control ' + op.id);
    const values=c.values.map(v=>v.value);
    require(new Set(values).size===values.length && values.includes(c.default) && values.every(v => c.type==='toggle' ? typeof v==='boolean' : text(v)), '目标 ' + op.id);
    require(op.locator && (c.type === 'toggle' ? op.locator.type === 'Toggle' : ['Radio','MenuChoice'].includes(op.locator.type)) && (text(op.locator.anchorText) || text(op.locator.originalText) || text(op.locator.id)),'locator ' + op.id);
    if (op.locator.type === 'MenuChoice') {
      require(text(op.locator.id) && text(op.locator.anchorText) && Array.isArray(op.locator.values) && op.locator.values.every(text) && values.every(v => op.locator.values.includes(v)), '菜单目标 ' + op.id);
      require(typeof registry[catalog.apps[catalog.pages[op.page].app].adapter].changeControl === 'function', '菜单适配器 ' + op.id);
    }
    require(text(op.screenshot?.group),'screenshot ' + op.id);
  }
  require(catalog.dnd && Object.hasOwn(catalog.apps,catalog.dnd.app) && route(catalog.dnd.route),'dnd');
  unique(catalog.overviews ?? [],'overviews');
  for (const rule of catalog.overviews ?? []) require(Object.hasOwn(catalog.apps,rule.app) && route(rule.route) && Array.isArray(rule.operations) && rule.operations.length && new Set(rule.operations).size===rule.operations.length && rule.operations.every(id=>ids.has(id)),'overview ' + rule.id);
  return catalog;
}
