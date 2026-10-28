// Pure tree inspection: no device actions, no model calls.
export const attr = n => n.attributes ?? {};
export function walk(n, parent = null, out = []) {
  if (!n || typeof n !== 'object') throw new Error('无效 UI Tree');
  out.push({ n, parent });
  for (const c of n.children ?? []) walk(c, n, out);
  return out;
}
export function bounds(n) {
  const m = /^\[(-?\d+),(-?\d+)\]\[(-?\d+),(-?\d+)\]$/.exec(attr(n).bounds ?? '');
  if (!m) throw new Error('控件缺少有效 bounds');
  const b = m.slice(1).map(Number);
  if (b[2] <= b[0] || b[3] <= b[1]) throw new Error('控件 bounds 为空');
  return b;
}
export function bool(v) {
  if (v === true || v === 'true') return true;
  if (v === false || v === 'false') return false;
  throw new Error('控件状态不是明确布尔值');
}
export const visible = n => !['false', false].includes(attr(n).visible);
// SceneBoard exposes the keyboard panel even for third-party IMEs whose
// bundle names do not contain "inputmethod". Dismiss it, never ignore it.
export function keyboardVisible(tree) {
  return (tree.children ?? []).filter(visible).some(n => {
    const a = attr(n);
    return /inputmethod/.test(a.bundleName ?? '') ||
      (a.bundleName === 'com.ohos.sceneboard' && a.type === 'WindowScene' &&
        /^keyboardPanel\d+$/.test(a.id ?? ''));
  });
}
export const labels = n => ['text', 'originalText', 'description'].map(k => attr(n)[k]).filter(Boolean);
export function unique(nodes, message = '目标缺失或不唯一') {
  if (nodes.length !== 1) throw new Error(`${message} (${nodes.length})`);
  return nodes[0];
}
export function find(root, selector) {
  return walk(root).map(x => x.n).filter(n => visible(n) &&
    (!selector.text || labels(n).includes(selector.text)) &&
    (!selector.id || attr(n).id === selector.id) &&
    (!selector.type || attr(n).type === selector.type));
}
export function textNode(root, text) {
  // Containers often repeat the child label; prefer the actual Text node.
  const hits = find(root, { text });
  const texts = hits.filter(n => attr(n).type === 'Text');
  return unique(texts.length ? texts : hits, `无法唯一定位 ${text}`);
}
export function appScope(tree, bundle) {
  const all = walk(tree).map(x => x.n);
  if (all.some(n => visible(n) && (/SCBBannerBuilder|\[Banner\]/.test(attr(n).id ?? '') || /^(Dialog|Popup)$/.test(attr(n).type ?? '')))) {
    throw new Error('检测到横幅/对话框/浮层，请 Agent 处理后续跑');
  }
  const roots = (tree.children ?? []).filter(visible);
  for (const n of roots) {
    const a = attr(n);
    if (a.bundleName && a.bundleName !== bundle) {
      const statusOnly = a.bundleName === 'com.ohos.sceneboard' && find(n, { id: 'StatusBarBox' }).length &&
        bounds(n)[3] <= bounds(tree)[3] * 0.1;
      if (!statusOnly) throw new Error('前台存在其他应用窗口或遮挡');
    }
  }
  let scope = unique(roots.filter(n => attr(n).bundleName === bundle), '应用身份不匹配');
  const menus = walk(scope).map(x => x.n).filter(n => visible(n) && attr(n).type === 'MenuWrapper');
  if (menus.length) return unique(menus, '菜单层级不唯一');
  const sheets = walk(scope).map(x => x.n).filter(n => visible(n) && attr(n).type === 'SheetWrapper');
  if (sheets.length) {
    const maxZ = Math.max(...sheets.map(n => Number(attr(n).zIndex || 0)));
    scope = unique(sheets.filter(n => Number(attr(n).zIndex || 0) === maxZ), '前台弹层不唯一');
  }
  return scope;
}
export function titleIs(scope, title) {
  return find(scope, { type: 'HdsTitleBar' }).some(h => find(h, { text: title }).length > 0);
}
export function control(root, locator) {
  if (locator.originalText) {
    return unique(find(root, { type: locator.type }).filter(n => attr(n).originalText === locator.originalText));
  }
  const matches = find(root, { text: locator.anchorText });
  const texts = matches.filter(n => attr(n).type === 'Text');
  const anchors = texts.length ? texts : matches;
  const parents = new Map(walk(root).map(({ n, parent }) => [n, parent]));
  const candidates = new Set();
  for (const anchor of anchors) {
    for (let n = anchor; n; n = parents.get(n)) {
      const hits = find(n, { type: locator.type });
      if (!hits.length) continue;
      if (hits.length === 1) {
        const a = bounds(anchor), b = bounds(hits[0]);
        const c = bounds(n), page = bounds(root);
        const compactRow = ['Row','Flex','ListItem'].includes(attr(n).type) && c[3]-c[1] < (page[3]-page[1])*.4;
        if (Math.min(a[3],b[3]) > Math.max(a[1],b[1]) || compactRow) candidates.add(hits[0]);
      }
      break;
    }
  }
  return unique([...candidates], '无法唯一定位锚点同一行的开关');
}

export function state(root, locator) {
  const n = control(root, locator);
  const b = bounds(n), r = bounds(root);
  if (b[0] < r[0] || b[1] < r[1] || b[2] > r[2] || b[3] > r[3]) throw new Error('目标控件不完整位于当前视口');
  return { n, checked: bool(attr(n).checked), enabled: bool(attr(n).enabled) };
}

export function dndControl(scope) {
  const anchor = textNode(scope, '免打扰');
  const parents = new Map(walk(scope).map(({n,parent}) => [n,parent]));
  for (let n = anchor; n; n = parents.get(n)) {
    const buttons = find(n, { type: 'Button' });
    if (!buttons.length) continue;
    const button = unique(buttons, '免打扰卡片操作不唯一');
    const text = attr(button).text;
    if (!['立即开启','立即关闭','关闭'].includes(text)) throw new Error('免打扰按钮状态未知');
    return { n: button, checked: text !== '立即开启', enabled: bool(attr(button).enabled) };
  }
  throw new Error('找不到免打扰卡片操作');
}
