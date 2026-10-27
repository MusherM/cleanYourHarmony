# CleanYourHarmony 报告模板

立体 H 标识、验收报告与执行协议置于同一个纵深空间，下滑驱动镜头前进。整页单文件、无外部资源依赖，可离线打开；使用 Node.js 18 或更新版本。

当前入口为 `index.html`，由 `example.json` 渲染；旧版海报式预览保留为 `index_2026-10-26_legacy.html`，仅作历史对照。

## 视觉结构

- **连续 3D 空间**：CSS perspective / preserve-3d 构成立体 H、光环与纵深廊道，无外部模型和运行时依赖。
- **滚动映射**：原生滚动位置直接映射镜头 Z 位移，镜头连续经过首屏、概览、范围、每个核验项、结论与协议。检查项数量决定路径长度。
- **导航**：右侧章节按钮沿同一镜头路径定位；底部显示深度与进度。
- **桌面优先**：横向场景根据窗口等比缩放，正文节点适配可用高度。窄侧栏或超长内容建议用右上角“平面阅读”。
- **可访问性**：未到达的节点不进入键盘焦点；减少动态效果偏好默认平面阅读；无 JavaScript 时也可阅读原始报告。
- **打印**：输出平面报告并展开检查项，不打印空间装饰。

当前 3D 预览为 `index_3d.html`，`index.html` 同步为当前入口。旧截图与 legacy 页面仅代表历史版本。没有主题切换。

## Agent 工作流

1. 读取 `report.schema.json`；参考 `example.json` 输出纯 JSON，不带代码围栏。保存到 `dev/<主题>/report_YYYY-MM-DD_HH-mm.json`。正式报告用 `actual`；仅演示用 `demo`。
2. 填写实际北京时间（带 `+08:00`）、40 位提交 SHA 或 `N/A：原因`、执行环境、验证范围、边界及后续事项。每项包含目标、观察、层级、状态和证据；未验证不能填通过。
3. 必须执行校验，成功后生成报告：

```sh
node report-template/validate.mjs dev/<主题>/report_YYYY-MM-DD_HH-mm.json
node report-template/render.mjs dev/<主题>/report_YYYY-MM-DD_HH-mm.json dev/<主题>/stage_report_YYYY-MM-DD_HH-mm.html
```

校验失败退出码为 1，并显示字段路径。修正源 JSON 后重新校验；不要绕过校验手改 HTML。生成器再次校验，拒绝覆盖现有文件。每个生成页面均内联样式和脚本，可独立离线打开。

总状态规则：全通过为 `passed`；全未验证为 `not_tested`；只含受阻和未验证且至少一个受阻为 `blocked`；其余为 `partial`。通过和失败必须有证据。统计由检查项计算，不允许 Agent 手填。

证据数组存文本引用（推荐项目相对路径、采集时间、SHA-256 和关键观察），按纯文本显示，不自动加载附件或执行链接。校验器不检查证据存在性或真实性；必须单独复核。避免填写设备账号、令牌等敏感内容。

## 维护与验证

- `template.html`：Hero、报告皮肤、协议、页脚、响应式、动效与打印样式。
- `report.schema.json`：版本 1 数据契约。
- `validate.mjs`：支持当前契约所用关键字的零依赖校验器，不是通用 JSON Schema 引擎；扩展契约时同步扩展校验和测试。
- `render.mjs`：转义内容后填充模板，并输出 `data-status`、核验项数量等展示钩子；无外部资源依赖。
- `example.json` / `index.html`：明确标识的演示源和当前入口页，时间不是实际设备验收时间。
- `landing_2026-10-27_hero.png` / `landing_2026-10-27_mobile.png` / `landing_2026-10-27_full.png`：页面视觉检查截图。
- `index_2026-10-26_legacy.html`：旧版预览，保留用于对照。

运行 `node --test report-template/test.mjs` 检查错误拒绝、状态一致性、内容转义和文件保护。结构校验、页面展示检查、设备业务验收是不同层级，互不替代。此目录不含设备执行工具；历史报告仍在 `dev/clean-settings/`。
