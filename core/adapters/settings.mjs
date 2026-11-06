import { setTimeout as delay } from 'node:timers/promises';
import { appScope, find, textNode, unique, titleIs, attr, bounds, walk, state, keyboardVisible } from '../ui-tree.mjs';
import { notification } from './notification.mjs';
const notificationRoute = route => route[0] === '通知和状态栏' && route.length === 2;
const sidebar = scope => find(scope,{type:'NavBar'}).find(n => titleIs(n,'设置'));
export const settings = {
  notification,
  dismiss(tree, family) {
    const scope=(tree.children ?? []).find(n => attr(n).bundleName === this.apps[family].bundle);
    return scope && find(scope,{type:'Popup'}).some(n => find(n,{text:'原“置顶显示通知”功能合并到“优先通知”，可设置本应用所有消息优先显示或者通过智能识别优先显示'}).length);
  },
  isPage(scope, family, route) {
    if (!route.length) return attr(scope).type !== 'SheetWrapper' && (titleIs(scope,this.apps[family].root) || Boolean(sidebar(scope)));
    if (route.length === 1 && route[0] === '搜索') return find(scope,{id:'searchComponent',type:'Search'}).length === 1 && find(scope,{type:'SearchField'}).length === 1;
    if (notificationRoute(route)) return titleIs(scope,'通知管理') && find(scope,{text:route[1]}).length > 0;
  },
  entryScope(scope, fromRoot) { return fromRoot ? sidebar(scope) ?? scope : scope; },
  async step(family, route) {
    if (route[0] === '搜索') {
      if (route.length === 1) {
        const {scope}=await this.wait(family,s=>this.isPage(s,family,[]));
        const rootScope=this.adapter(family).entryScope.call(this,scope,true);
        const fields=find(rootScope,{id:'homPageSearchInput',type:'Search'});
        this.device.click(unique(fields.length ? fields : find(rootScope,{id:'searchMenuButton',type:'Button'})));
      } else if (route.length === 2) {
        let {scope}=await this.wait(family,s=>this.isPage(s,family,['搜索']));
        const query=route[1];
        let field=unique(find(scope,{type:'SearchField'}));
        if (attr(field).text !== query) {
          if (attr(field).text) {
            this.device.click(unique(walk(scope).map(x=>x.n).filter(n=>(attr(n).id??'').includes('CancelButton'))));
            ({scope}=await this.wait(family,s=>find(s,{type:'SearchField'}).some(n=>!attr(n).text)));
            field=unique(find(scope,{type:'SearchField'}));
          }
          const [a,b,c,d]=bounds(field);
          this.device.ui('inputText',Math.round((a+c)/2),Math.round((b+d)/2),query);
        }
        ({scope}=await this.wait(family,s=>find(s,{type:'SearchField',text:query}).length===1 && find(s,{id:'searchResultItem',type:'Text',text:query}).length===1));
        this.device.click(unique(find(scope,{id:'searchResultItem',type:'Text',text:query})));
      } else return false;
      return true;
    }
    if (!notificationRoute(route)) return false;
    await this.adapter(this.family).notification.call(this,route[1]); return true;
  },
  async beforeParent(family, previous) {
    if (previous.length) return null;
    const view=await this.wait(family,()=>true);
    return sidebar(view.scope) ? view : null;
  },
  async afterBack(family) {
    if (!notificationRoute(this.route)) return;
    const {scope}=await this.wait(family,s => find(s,{type:'SearchField'}).length === 1 || titleIs(s,'通知和状态栏'));
    if (find(scope,{type:'SearchField'}).length) this.device.back();
  },
  async sibling(page) {
    if (!notificationRoute(this.route) || !notificationRoute(page.route) || this.route[1] === page.route[1]) return null;
    this.device.back();
    const {scope}=await this.wait(page.family,s => find(s,{type:'SearchField'}).length === 1 || titleIs(s,'通知和状态栏'));
    this.route=['通知和状态栏'];
    await this.adapter(this.family).notification.call(this,page.route[1],find(scope,{type:'SearchField'}).length === 1);
    const view=await this.current(page); this.route=[...page.route]; return view;
  },
};
