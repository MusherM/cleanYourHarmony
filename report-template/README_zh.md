# CleanYourHarmony 报告模板

首屏是 CleanYourHarmony 的 **CSS 3D 铬金属 H 标识**与巨型字标，向下是统一的验收报告，只呈现主体内容。整页单文件、无外部模型或运行时依赖，可离线打开；使用 Node.js 18 或更新版本。

最终报告设计维护在 `template.html`，`index.html` 为 `example.json` 渲染的当前预览。已移除装饰性角标、口号、执行协议和页脚。版本 1 JSON 契约不变：内容字段完整展示，版本用于校验，模式控制演示提示，状态和数量对应检查项。旧版 2D 海报式预览保留为 `index_2026-10-26_legacy.html`，仅作历史对照。`alternate_3d_2026-10-27/` 保留了并行写入的另一套 3D 滚动实现，不参与当前入口。

## 视觉结构

- **3D Hero**：墨黑底、暖白铬金属、信号橙。用 42 层 H 形切片沿 Z 轴挤出 38px 厚度，正面为动态铬渐变，背面封闭，边缘透出橙色轮廓光；四周是 CSS 3D 陀螺环、透视网格地面与漂浮微粒。
- **交互**：指针移动会让整个场景轻微视差倾斜；H 自身缓慢摆动、浮动并扫过一道高光。所有效果由 CSS 3D / transform / clip-path 完成，不使用 WebGL、Three.js 或外部模型。
- **验收报告**：暖白纸张、宋体标题、等宽标签、状态色统计、可展开逐项核验、黑色结论边界面板。
- **响应式 / 动效**：`100svh` 首屏，窄屏与横屏自动重排；`prefers-reduced-motion` 下关闭 3D 动画与滚动显现。
- **打印**：隐藏 3D 场景，展开全部核验项，用平面 H 标识输出可读报告。

旧版三套主题切换已移除；`?style=` 参数不再改变页面。需要视觉变体时，复制 `template.html` 另立文件，不覆盖历史报告。

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

- `template.html`：最终 3D Hero 与报告模板、响应式、动效与打印样式。
- `report.schema.json`：版本 1 数据契约。
- `validate.mjs`：支持当前契约所用关键字的零依赖校验器，不是通用 JSON Schema 引擎；扩展契约时同步扩展校验和测试。
- `render.mjs`：转义内容后填充模板，并输出 `data-status`、核验项数量等展示钩子；无外部资源依赖。
- `example.json` / `index.html`：明确标识的演示源和当前入口页，时间不是实际设备验收时间。
- `landing_2026-10-27_hero.png` / `landing_2026-10-27_mobile.png` / `landing_2026-10-27_full.png`：清理文案前的历史截图，不代表当前预览的验证结果。
- `index_2026-10-26_legacy.html`：旧版 2D 预览，保留用于对照。
- `alternate_3d_2026-10-27/`：并行写入的另一套 3D 滚动实现，原样保留，仅用于对照。

运行 `node --test report-template/test.mjs` 检查错误拒绝、状态一致性、内容转义和文件保护。结构校验、页面展示检查、设备业务验收是不同层级，互不替代。此目录不含设备执行工具；历史报告仍在 `dev/clean-settings/`。
