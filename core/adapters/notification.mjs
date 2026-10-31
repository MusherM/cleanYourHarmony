import { setTimeout as delay } from 'node:timers/promises';
import { appScope, find, textNode, unique, titleIs, attr, bounds, walk, state, keyboardVisible } from '../ui-tree.mjs';
import { NotificationNotFound } from '../errors.mjs';
export async function notification(app, searchOpen = false) {
    let scope;
    if (!searchOpen) {
      ({ scope } = await this.wait(this.family, s => titleIs(s, '通知和状态栏')));
      const header = find(scope, { type: 'HdsTitleBar' }).at(-1);
      if (!header) throw new Error('通知页面缺少标题栏');
      const [x1,,x2] = bounds(header);
      const buttons = find(header, { type: 'Button' }).filter(n => !attr(n).id && bounds(n)[0] > (x1+x2)/2);
      this.device.click(unique(buttons, '通知搜索按钮不唯一'));
    }
    ({ scope } = await this.wait(this.family, s => find(s, { type: 'SearchField' }).length === 1));
    let field = unique(find(scope, { type: 'SearchField' }));
    if (attr(field).text) {
      const clear = unique(walk(scope).map(x => x.n).filter(n => (attr(n).id ?? '').includes('CancelButton')));
      this.device.click(clear);
      ({ scope } = await this.wait(this.family, s => find(s, { type: 'SearchField' }).some(n => !attr(n).text)));
      field = unique(find(scope, { type: 'SearchField' }));
    }
    const [a,b,c,d] = bounds(field);
    this.device.ui('inputText', Math.round((a+c)/2), Math.round((b+d)/2), app);
    // wait dismisses a detected keyboard once; an unconditional Back can leave
    // search when inputText did not open an IME (for example a hardware keyboard).
    try {
      ({ scope } = await this.wait(this.family, s => find(s, { type: 'SearchField' }).some(n => attr(n).text === app) &&
        find(s, { id: 'searchResultListComponent' }).length === 1 &&
        find(unique(find(s, { id: 'searchResultListComponent' })), { text: app }).length > 0));
    } catch (e) {
      // Only a completed wait on the correct, unobscured search page can mean
      // absent. Tool errors, cancellation, loading and wrong pages remain errors.
      if (e.message !== '页面未达到预期') throw e;
      ({ scope } = await this.wait(this.family, () => true));
      const fields = find(scope, { type: 'SearchField' });
      const results = find(scope, { id: 'searchResultListComponent' });
      const loading = walk(scope).some(({n}) => /LoadingProgress|Progress/.test(attr(n).type ?? '') || /加载中|正在加载/.test(attr(n).text ?? ''));
      if (fields.length === 1 && attr(fields[0]).text === app && results.length === 1 &&
          !loading && !find(results[0], { text: app }).length) throw new NotificationNotFound(app);
      throw e;
    }
    this.device.click(textNode(unique(find(scope, { id: 'searchResultListComponent' })), app));
  }
