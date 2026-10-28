import { setTimeout as delay } from 'node:timers/promises';
import { APPS } from './routes.mjs';
import { appScope, find, textNode, unique, titleIs, attr, bounds, walk, state, keyboardVisible } from './ui-tree.mjs';

export class NotificationNotFound extends Error {
  constructor(app) { super(`未找到通知应用：${app}`); this.app = app; }
}

export class Navigator {
  constructor(device, cancelled = () => false) { this.device = device; this.cancelled = cancelled; this.family = null; this.route = []; }
  async wait(family, predicate, timeout = 8000) {
    if (this.cancelled()) throw new Error("执行被中断");
    const revision = this.device.revision ?? 0;
    if (this.view?.family === family && this.view.revision === revision && performance.now() - this.view.at < 500) {
      try { if (predicate(this.view.scope)) return this.view; } catch { /* Refresh a snapshot whose target is not ready. */ }
    }
    const until = Date.now() + timeout;
    let last, dismissedKeyboard = false;
    do {
      if (this.cancelled()) throw new Error('执行被中断');
      try {
        const tree = this.device.tree();
        if (keyboardVisible(tree)) {
          if (dismissedKeyboard) throw new Error('键盘遮挡仍未消失');
          this.device.back(); dismissedKeyboard = true; await delay(200); continue;
        }
        const scope = appScope(tree, APPS[family].bundle);
        if (predicate(scope)) {
          this.view = { tree, scope, family, revision: this.device.revision ?? 0, at: performance.now() };
          return this.view;
        }
        last = new Error('页面未达到预期');
      } catch (e) {
        last = e;
        if (/横幅|弹层不唯一/.test(e.message)) throw e;
      }
      await delay(200);
    } while (Date.now() < until);
    throw last;
  }
  isPage(scope, family, route) {
    if (!route.length) return titleIs(scope, APPS[family].root) && attr(scope).type !== 'SheetWrapper';
    if (family === 'F' && route.at(-1) === '更多') return attr(scope).type === 'MenuWrapper';
    if (family === 'N' && route[0] === '通知和状态栏' && route.length === 2) {
      return titleIs(scope, '通知管理') && find(scope, { text: route[1] }).length > 0;
    }
    return titleIs(scope, route.at(-1));
  }
  async current(page, locator) {
    return this.wait(page.family, scope => this.isPage(scope, page.family, page.route) && (!locator || Boolean(state(scope, locator))));
  }
  async root(family) {
    if (family === 'F') {
      this.device.ui('keyEvent', 'Home');
      for (let i = 0; i < 4; i++) {
        const tree = this.device.tree();
        if (walk(tree).some(({n}) => /SCBBannerBuilder|\[Banner\]/.test(attr(n).id ?? ''))) throw new Error('负一屏头像被横幅遮挡');
        if ((tree.children ?? []).some(n => attr(n).bundleName && attr(n).bundleName !== 'com.ohos.sceneboard')) throw new Error('尚未到达桌面');
        if (find(tree, { id: 'NegativeScreen-Intelligent_Stack_NegativeScreen' }).length) {
          this.device.click(unique(find(tree, { id: 'Intelligent_Me_12345' }), '负一屏头像入口缺失或不唯一'));
          await this.wait('F', scope => this.isPage(scope, 'F', []));
          this.family = 'F'; this.route = []; return;
        }
        const [,,w,h] = bounds(tree);
        this.device.ui('swipe', Math.round(w*.15), Math.round(h*.5), Math.round(w*.85), Math.round(h*.5), 1200);
        await delay(200);
      }
      throw new Error('无法到达负一屏');
    }
    this.device.launch(APPS[family]);
    for (let i = 0; i < 7; i++) {
      const { scope } = await this.wait(family, () => true);
      if (this.isPage(scope, family, [])) { this.family = family; this.route = []; return; }
      if (family === 'B' && attr(scope).type !== 'SheetWrapper') {
        this.device.click(textNode(scope, '我的'));
      } else { this.device.back(); }
    }
    throw new Error('无法归一化到应用起点；需 Agent 定位，禁止猜测坐标');
  }
  async entry(family, text) {
    // Search only this page. Scroll boundedly in both directions, never click an off-screen node.
    for (const direction of ['up', 'down']) {
      let previousSignature;
      for (let i = 0; i < 7; i++) {
        const { scope, tree } = await this.wait(family, () => true);
        let n;
        try { n = textNode(scope, text); } catch (e) { if (!/\(0\)/.test(e.message)) throw e; }
        const [sx, sy, ex, ey] = bounds(scope);
        if (n) {
          const [x1, y1, x2, y2] = bounds(n);
          // Keep targets inside page content, away from navigation/status bars.
          if (x1 >= sx && x2 <= ex && y1 > sy + (ey - sy) * 0.08 && y2 < ey - 40) { this.device.click(n); return; }
        }
        const signature = JSON.stringify(walk(scope).map(({n}) => [attr(n).type, attr(n).id, attr(n).text, attr(n).bounds]));
        if (signature === previousSignature) break;
        previousSignature = signature;
        const candidates = walk(scope).map(x => x.n).filter(n => attr(n).scrollable === 'true' || attr(n).scrollable === true || ['Scroll','List'].includes(attr(n).type));
        const scroll = candidates.sort((a, b) => { const x = bounds(a), y = bounds(b); return (y[2]-y[0])*(y[3]-y[1]) - (x[2]-x[0])*(x[3]-x[1]); })[0];
        if (!scroll) throw new Error(`当前页面没有可滚动区域：${text}`);
        const [x1,y1,x2,y2] = bounds(scroll), x = Math.round((x1+x2)/2);
        const top = Math.round(Math.max(y1, sy + 200) + (y2-y1)*0.2), bottom = Math.round(Math.min(y2, ey-80) - (y2-y1)*0.15);
        if (bottom <= top) throw new Error('滚动区域无效');
        this.device.ui('swipe', x, direction === 'up' ? bottom : top, x, direction === 'up' ? top : bottom, 1200);
      }
    }
    throw new Error(`预设入口不可达：${text}`);
  }
  async notification(app, searchOpen = false) {
    let scope;
    if (!searchOpen) {
      ({ scope } = await this.wait('N', s => titleIs(s, '通知和状态栏')));
      const header = unique(find(scope, { type: 'HdsTitleBar' }));
      const [x1,,x2] = bounds(header);
      const buttons = find(header, { type: 'Button' }).filter(n => !attr(n).id && bounds(n)[0] > (x1+x2)/2);
      this.device.click(unique(buttons, '通知搜索按钮不唯一'));
    }
    ({ scope } = await this.wait('N', s => find(s, { type: 'SearchField' }).length === 1));
    let field = unique(find(scope, { type: 'SearchField' }));
    if (attr(field).text) {
      const clear = unique(walk(scope).map(x => x.n).filter(n => (attr(n).id ?? '').includes('CancelButton')));
      this.device.click(clear);
      ({ scope } = await this.wait('N', s => find(s, { type: 'SearchField' }).some(n => !attr(n).text)));
      field = unique(find(scope, { type: 'SearchField' }));
    }
    const [a,b,c,d] = bounds(field);
    this.device.ui('inputText', Math.round((a+c)/2), Math.round((b+d)/2), app);
    // wait dismisses a detected keyboard once; an unconditional Back can leave
    // search when inputText did not open an IME (for example a hardware keyboard).
    try {
      ({ scope } = await this.wait('N', s => find(s, { type: 'SearchField' }).some(n => attr(n).text === app) &&
        find(s, { id: 'searchResultListComponent' }).length === 1 &&
        find(unique(find(s, { id: 'searchResultListComponent' })), { text: app }).length > 0));
    } catch (e) {
      // Only a completed wait on the correct, unobscured search page can mean
      // absent. Tool errors, cancellation, loading and wrong pages remain errors.
      if (e.message !== '页面未达到预期') throw e;
      ({ scope } = await this.wait('N', () => true));
      const fields = find(scope, { type: 'SearchField' });
      const results = find(scope, { id: 'searchResultListComponent' });
      const loading = walk(scope).some(({n}) => /LoadingProgress|Progress/.test(attr(n).type ?? '') || /加载中|正在加载/.test(attr(n).text ?? ''));
      if (fields.length === 1 && attr(fields[0]).text === app && results.length === 1 &&
          !loading && !find(results[0], { text: app }).length) throw new NotificationNotFound(app);
      throw e;
    }
    this.device.click(textNode(unique(find(scope, { id: 'searchResultListComponent' })), app));
  }
  async step(family, route) {
    const name = route.at(-1);
    if (family === 'F' && name === '更多') {
      const { scope } = await this.wait(family, s => titleIs(s, '我的'));
      this.device.click(unique(find(scope, { id: 'hdsMoreMenuId' })));
    } else if (family === 'N' && route[0] === '通知和状态栏' && route.length === 2) {
      await this.notification(name);
    } else { await this.entry(family, name); }
    await this.wait(family, s => this.isPage(s, family, route));
  }
  async parent() {
    const previous = this.route.slice(0, -1);
    this.device.back();
    if (this.family === 'F' && previous.length === 1 && previous[0] === '更多') {
      // The menu is transient: leaving a selected destination returns to 我的.
      const { scope } = await this.wait('F', s => titleIs(s, '我的'));
      this.device.click(unique(find(scope, { id: 'hdsMoreMenuId' })));
    }
    if (this.family === 'N' && this.route[0] === '通知和状态栏' && this.route.length === 2) {
      // Detail returns to its search page; close search to reuse the list route.
      await this.wait('N', s => find(s, { type: 'SearchField' }).length === 1 || titleIs(s, '通知和状态栏'));
      const { scope } = await this.wait('N', () => true);
      if (find(scope, { type: 'SearchField' }).length) this.device.back();
    }
    const view = await this.wait(this.family, s => this.isPage(s, this.family, previous));
    this.route = previous;
    if (this.onReturn) this.onReturn({ family: this.family, route: previous, ...view });
  }
  async go(page) {
    if (this.family !== page.family) await this.root(page.family);
    // Notification details share one search screen. Keep it between sibling apps.
    if (page.family === 'N' && this.route.length === 2 && page.route.length === 2 &&
        this.route[0] === '通知和状态栏' && page.route[0] === this.route[0] && this.route[1] !== page.route[1]) {
      this.device.back();
      const { scope } = await this.wait('N', s => find(s, { type: 'SearchField' }).length === 1 || titleIs(s, '通知和状态栏'));
      this.route = ['通知和状态栏'];
      await this.notification(page.route[1], find(scope, { type: 'SearchField' }).length === 1);
      const view = await this.current(page);
      this.route = [...page.route];
      return view;
    }
    let common = 0;
    while (this.route[common] && this.route[common] === page.route[common]) common++;
    while (this.route.length > common) await this.parent();
    for (let i = common; i < page.route.length; i++) {
      const next = page.route.slice(0, i+1);
      await this.step(page.family, next); this.route = next;
    }
    return this.current(page);
  }
  async reenter(page) { await this.parent(); return this.go(page); }
  reset() { this.family = null; this.route = []; this.view = null; }
}
