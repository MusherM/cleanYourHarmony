import { setTimeout as delay } from 'node:timers/promises';
import { appScope, find, textNode, unique, titleIs, attr, bounds, walk, state, keyboardVisible } from '../ui-tree.mjs';
export const browser = {
  ready(scope) { return attr(scope).type === 'SheetWrapper' || find(scope,{text:'我的'}).length > 0 || find(scope,{type:'HdsTitleBar'}).length > 0; },
  async normalizeRoot(scope) {
    if (attr(scope).type !== 'SheetWrapper' && find(scope,{text:'我的'}).length) this.device.click(textNode(scope,'我的'));
    else this.device.back();
  },
};
