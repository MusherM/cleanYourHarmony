import { setTimeout as delay } from 'node:timers/promises';
import { appScope, find, textNode, unique, titleIs, attr, bounds, walk, state, keyboardVisible } from '../ui-tree.mjs';
export const assistant = {
  async root(family) {
      this.device.ui('keyEvent', 'Home');
      for (let i = 0; i < 4; i++) {
        const tree = this.device.tree();
        if (walk(tree).some(({n}) => /SCBBannerBuilder|\[Banner\]/.test(attr(n).id ?? ''))) throw new Error('负一屏头像被横幅遮挡');
        if ((tree.children ?? []).some(n => attr(n).bundleName && attr(n).bundleName !== 'com.ohos.sceneboard')) throw new Error('尚未到达桌面');
        if (find(tree, { id: 'NegativeScreen-Intelligent_Stack_NegativeScreen' }).length) {
          this.device.click(unique(find(tree, { id: 'Intelligent_Me_12345' }), '负一屏头像入口缺失或不唯一'));
          await this.wait(family, scope => this.isPage(scope, family, []));
          this.family = family; this.route = []; return;
        }
        const [,,w,h] = bounds(tree);
        this.device.ui('swipe', Math.round(w*.15), Math.round(h*.5), Math.round(w*.85), Math.round(h*.5), 1200);
        await delay(200);
      }
      throw new Error('无法到达负一屏');

  },
  isPage(scope, family, route) { if (route.at(-1) === '更多') return attr(scope).type === 'MenuWrapper'; },
  async step(family, route) {
    if (route.at(-1) !== '更多') return false;
    const {scope} = await this.wait(family,s => titleIs(s,'我的'));
    this.device.click(unique(find(scope,{id:'hdsMoreMenuId'}))); return true;
  },
  async afterBack(family, previous) {
    if (previous.length !== 1 || previous[0] !== '更多') return;
    const {scope} = await this.wait(family,s => titleIs(s,'我的'));
    this.device.click(unique(find(scope,{id:'hdsMoreMenuId'})));
  },
};
