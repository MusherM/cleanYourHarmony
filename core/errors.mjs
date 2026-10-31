export class NotificationNotFound extends Error {
  constructor(app) { super('未找到通知应用：' + app); this.app = app; }
}
