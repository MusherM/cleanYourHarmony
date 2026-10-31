import { attr, find, unique, textNode, titleIs, bool, bounds } from '../ui-tree.mjs';

export const calendar = {
  isPage(scope, family, route) {
    if (!route.length) return attr(scope).type !== 'MenuWrapper' && find(scope, { id: 'more_menu', type: 'Button' }).length === 1 && find(scope, { id: 'tabs_month' }).length === 1;
    return titleIs(scope, route.at(-1));
  },
  async step(family, route) {
    if (route.length !== 1 || route[0] !== '设置') return false;
    const { scope } = await this.wait(family, s => this.isPage(s, family, []));
    this.device.click(unique(find(scope, { id: 'more_menu', type: 'Button' })));
    const menu = await this.wait(family, s => attr(s).type === 'MenuWrapper' && find(s, { id: 'menu_preferences', text: '设置' }).length === 1);
    this.device.click(unique(find(menu.scope, { id: 'menu_preferences', text: '设置' })));
    return true;
  },
  async changeControl(page, locator, current) {
    if (locator.type !== 'MenuChoice') return false;
    this.device.click(current.n);
    const { scope } = await this.wait(page.family, s => attr(s).type === 'MenuWrapper' && find(s, { text: '区域默认' }).length > 0 && find(s, { text: locator.originalText }).length > 0);
    const option = textNode(scope, locator.originalText);
    const b = bounds(option), menu = bounds(unique(find(scope, { type: 'Menu' })));
    if (!bool(attr(option).enabled) || b[0] < menu[0] || b[1] < menu[1] || b[2] > menu[2] || b[3] > menu[3]) throw new Error('菜单目标禁用或不完整可见');
    this.device.click(option);
    return true;
  },
};
