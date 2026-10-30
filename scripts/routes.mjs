// Semantic route profile from the catalog and historical HarmonyOS 7 traces.
// These routes still require device acceptance; no saved coordinates or device IDs.
export const APPS = {
  B: { bundle: 'com.huawei.hmos.browser', ability: 'MainAbility', root: '我的' },
  N: { bundle: 'com.huawei.hmos.settings', ability: 'com.huawei.hmos.settings.MainAbility', root: '设置' },
  F: { bundle: 'com.huawei.hmsapp.intelligent', ability: 'MainAbility', root: '我的' },
};
export function plan(catalog, selected = catalog.operations) {
  const pages = new Map();
  for (const op of selected) {
    const family = op.id[0] === 'P' ? 'N' : op.id[0];
    const parts = op.path.split(' → ');
    const route = family === 'B' ? parts.slice(2) : family === 'F' ? parts.slice(2) : parts.slice(1);
    const key = family + ':' + route.join('/');
    if (!pages.has(key)) pages.set(key, { key, family, route, notification: op.id.startsWith('N'), operations: [] });
    pages.get(key).operations.push(op);
  }
  // Match list categories, then keep common route prefixes adjacent within each category.
  return [...pages.values()].sort((a, b) => catalog.categories.findIndex(c => c.id === a.operations[0].category) - catalog.categories.findIndex(c => c.id === b.operations[0].category) || a.key.localeCompare(b.key, 'zh-CN'));
}
