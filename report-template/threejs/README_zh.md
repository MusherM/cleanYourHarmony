# CleanYourHarmony — Three.js 空间报告

真实 WebGL 场景，使用锁定的 Three.js 0.180.0。与旧 CSS 透视实验分开维护，预览入口为 `index.html`。报告展示值来自 `example.json`，均为演示，不是设备验收结果。

## 实现

- `WebGLRenderer` 与 `PerspectiveCamera` 渲染整个空间；H 为带倒角的 `ExtrudeGeometry`，地面、灯带、基座、光环与展板都是三维网格。
- 报告文字经换行分页后绘制到 `CanvasTexture`，再贴到场景中的 `PlaneGeometry`。空间模式没有 HTML 报告展板，只有导航和进度 HUD。
- 下滑映射相机的 X/Y/Z 坐标，在阅读停留区后沿路径连续移动。导航按钮使用同一路径。
- 超长报告自动分页；平面报告提供原始文字阅读、复制、辅助技术和打印。减少动态效果时默认平面报告。WebGL 创建失败或上下文丢失时回退。
- 主要用于桌面横屏。窄窗口会拉远相机以保留横向空间，适合预览构图；细读文字可扩大窗口或切换平面报告。

## 构建与生成

需要 Node.js 18+ 与 npm。首次安装依赖需要网络。运行时与生成后的页面无需联网。

```sh
cd report-template/threejs
npm ci
npm run build
node validate.mjs example.json
node render.mjs example.json /tmp/harmony-three-preview.html
node --test test.mjs
```

先由 Agent 按 `report.schema.json` 生成严格 JSON，校验成功后再调用生成器。正式报告填写实际时间、提交、环境、范围、层级、观察、证据和结论边界，使用 `mode: actual`。生成器二次校验并拒绝覆盖既有报告。新报告文件名仍使用 `stage_report_YYYY-MM-DD_HH-mm.html`。

`scene.js` 是可维护源码，`scene.bundle.js` 是打包的浏览器运行时。`render.mjs` 将 bundle 内联到模板，生成独立 HTML；不要直接手改生成文件。已提交/交付 bundle 可直接用于生成，不要求用户机器预装开发依赖。修改源码后必须重新构建。

为避免与同时发生的旧模板修改冲突，本目录包含独立的模板、生成器、校验器及契约快照；此版的 Agent 使用以上命令。旧目录资料不作为本版实现和验证依据。

## 验证边界

已执行 JSON、生成、转义和覆盖保护测试；浏览器验证还需检查 WebGL canvas、滚动后的相机位置、末章导航和平面阅读。canvas 的 `data-renderer`、`data-revision`、`data-camera`、`data-triangles`、`data-frames` 提供可观察的运行证据，不能替代设备业务验收。文档参考经 Context7 查询 Three.js 官方仓库 `/mrdoob/three.js`；安装版本由 package-lock 锁定。
