import { setTimeout as delay } from 'node:timers/promises';
import { APPS } from './routes.mjs';
import { adapters } from './adapters/index.mjs';
export { NotificationNotFound } from './errors.mjs';
import { appScope, find, textNode, unique, titleIs, attr, bounds, walk, state, keyboardVisible } from './ui-tree.mjs';

export class Navigator {
  constructor(device, cancelled = () => false, apps = APPS, registry = adapters) { this.apps = apps; this.registry = registry; this.device = device; this.cancelled = cancelled; this.family = null; this.route = []; }
  adapter(family) { return this.registry[this.apps[family].adapter]; }
  async wait(family, predicate, timeout = 8000) {
    if (this.cancelled()) throw new Error("执行被中断");
    const revision = this.device.revision ?? 0;
    if (this.view?.family === family && this.view.revision === revision && performance.now() - this.view.at < 500) {
      try { if (predicate(this.view.scope)) return this.view; } catch { /* Refresh a snapshot whose target is not ready. */ }
    }
    const until = Date.now() + timeout;
    let last, dismissedKeyboard = false, dismissedNotificationTip = false;
    do {
      if (this.cancelled()) throw new Error('执行被中断');
      try {
        const tree = this.device.tree();
        const notificationTip = this.adapter(family).dismiss?.call(this, tree, family);
        if (notificationTip) {
          if (dismissedNotificationTip) throw new Error('优先通知功能提示仍未消失');
          this.device.back(); dismissedNotificationTip = true; await delay(200); continue;
        }
        if (keyboardVisible(tree)) {
          if (dismissedKeyboard) throw new Error('键盘遮挡仍未消失');
          this.device.back(); dismissedKeyboard = true; await delay(200); continue;
        }
        const scope = appScope(tree, this.apps[family].bundle);
        if (predicate(scope)) {
          this.view = { tree, scope, family, revision: this.device.revision ?? 0, at: performance.now() };
          return this.view;
        }
        last = new Error('页面未达到预期');
      } catch (e) {
        last = e;
        if (/弹层不唯一/.test(e.message)) throw e;
      }
      await delay(200);
    } while (Date.now() < until);
    throw last;
  }
  isPage(scope, family, route) {
    const matched = this.adapter(family).isPage?.call(this, scope, family, route);
    return matched ?? (!route.length ? attr(scope).type !== 'SheetWrapper' && titleIs(scope,this.apps[family].root) : titleIs(scope,route.at(-1)));
  }
  async current(page, locator) {
    return this.wait(page.family, scope => this.isPage(scope, page.family, page.route) && (!locator || Boolean(state(scope, locator))), locator ? 20000 : 8000);
  }
  async root(family) {
    const adapter=this.adapter(family);
    // Set the app before hooks, including notification navigation.
    this.family=family; this.route=[];
    if (adapter.root) return adapter.root.call(this,family);
    this.device.launch(this.apps[family]);
    for (let i=0;i<7;i++) {
      const {scope}=await this.wait(family,s => adapter.ready?.call(this,s) ?? true);
      if (this.isPage(scope,family,[])) return;
      if (adapter.normalizeRoot) await adapter.normalizeRoot.call(this,scope);
      else this.device.back();
    }
    throw new Error('无法归一化到应用起点；需 Agent 定位，禁止猜测坐标');
  }
  async entry(family, text, fromRoot = false) {
    // Search only this page. Scroll boundedly in both directions, never click an off-screen node.
    for (const direction of ['up', 'down']) {
      let previousSignature;
      for (let i = 0; i < 7; i++) {
        const view = await this.wait(family, () => true);
        // A settings split view keeps its sidebar alive beside the detail.
        // Top-level routes scroll the sidebar, never the larger detail pane.
        const scope = this.adapter(family).entryScope?.call(this,view.scope,fromRoot) ?? view.scope;
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
        const candidates = walk(scope).map(x => x.n).filter(n => (attr(n).scrollable === 'true' || attr(n).scrollable === true || ['Scroll','List'].includes(attr(n).type)) && (() => { try { bounds(n); return true; } catch { return false; } })());
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
  async step(family, route) {
    if (!await this.adapter(family).step?.call(this,family,route)) await this.entry(family,route.at(-1),route.length === 1);
    await this.wait(family,s => this.isPage(s,family,route));
  }
  async parent() {
    const previous=this.route.slice(0,-1), adapter=this.adapter(this.family);
    let view=await adapter.beforeParent?.call(this,this.family,previous);
    if (!view) {
      this.device.back();
      await adapter.afterBack?.call(this,this.family,previous);
      view=await this.wait(this.family,s => this.isPage(s,this.family,previous));
    }
    this.route=previous;
    this.onReturn?.({family:this.family,route:previous,...view});
  }
  async go(page) {
    if (this.family !== page.family) await this.root(page.family);
    const sibling=await this.adapter(page.family).sibling?.call(this,page);
    if (sibling) return sibling;
    let common = 0;
    while (this.route[common] && this.route[common] === page.route[common]) common++;
    while (this.route.length > common) await this.parent();
    for (let i = common; i < page.route.length; i++) {
      const next = page.route.slice(0, i+1);
      await this.step(page.family, next); this.route = next;
    }
    return this.current(page);
  }
  async changeControl(page, locator, current) {
    if (await this.adapter(page.family).changeControl?.call(this, page, locator, current)) return;
    if (locator.type === 'MenuChoice') throw new Error('应用没有菜单选择适配器');
    this.device.click(current.n);
  }
  async reenter(page) { await this.parent(); return this.go(page); }
  reset() { this.family = null; this.route = []; this.view = null; }
}
