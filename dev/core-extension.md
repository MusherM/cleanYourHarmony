# 共享执行内核与扩展

main 维护 core/、operations.json、CLI 和共享测试。desktop-app 单向合入 main；不能在桌面分支单独修补内核。桌面分支运行 `node scripts/check-core.mjs --pin <main提交>` 更新来源锁，随后运行 `node scripts/check-core.mjs`。校验包含共享源码、清单、测试和扩展说明；打包保留 core-source.json 中的提交、逐文件 SHA-256 和总摘要。此文件描述开发契约，不是实机验收报告。

## 接口与边界

从 core/index.mjs 导入 readCatalog、validateCatalog、resolveSelection、publicCatalog、plan、discoverDevices、executeSession、discoverRuns、dataRoot 和 finalStatus。executeSession 接受 request（deviceId、selection: [{id,target}]）、hdc、root、resume、recoveryOnly、cancelled 和 emit；测试或静态扩展可注入 catalog、registry、DeviceClass 和 NavigatorClass。返回 {directory,progress}。progress 先落盘再发事件；diagnostic 事件携带 level/message。调用方负责展示，内核不输出 stdout。

CLI 继续使用 scripts/run.mjs，默认执行全部默认勾选项。GUI 将 JSON Lines 转换为同一内核调用，工作线程只负责串行调度与取消信号。原 scripts/ 下的模块是兼容导出，不得承载业务逻辑。

## 增加普通项目

1. 在 operations.json 的 operations 中新增唯一 id、display_name、category、default_selected、page、control、locator、screenshot。复制同类型项目的既有元数据，保留历史验证范围，不伪造验证结果。
2. page 引用 pages 中的稳定键；页面声明 app、route（语义入口数组）、kind（standard 或 notification）。相同应用、相同路线只声明一个页面。同页项目属于同一分类。
3. control.type 支持 toggle / choice，default 必须在 values 中；toggle 值为布尔，choice 值为字符串。locator 分别使用 Toggle / Radio，按当前树唯一定位；path 只供人阅读，ID 前缀不决定应用或页面。
4. 同页会自动合并处理。父页合照在 overviews 声明 id、app、route、operations；只覆盖本轮选中且已通过的项目，返回该页时取证。勿扰页面单独在 dnd 声明。
5. 运行 `node scripts/run.mjs --plan` 和 `node --test scripts/runner.test.mjs scripts/session.test.mjs scripts/core.test.mjs`，确认默认清单和选中范围正确。测试中的扩展项目不进入正式清单。

## 增加应用或特殊页面

apps 声明 bundle、ability、root 和 adapter。普通层级页面使用 standard；特殊行为在 core/adapters/ 新增静态模块，并在 index.mjs 的 adapters 注册。可选钩子如下，this 均为 Navigator：

| 钩子 | 约定 |
|---|---|
| root(app) | 特殊入口，完成后位于根页；不提供时使用通用启动与返回 |
| ready(scope)、normalizeRoot(scope) | 等待启动内容及进入应用根页 |
| isPage(scope,app,route) | 返回布尔；undefined 表示用通用标题判定 |
| dismiss(tree,app) | 识别已知可正常返回关闭的说明弹层；每次等待最多处理一次 |
| entryScope(scope,fromRoot) | 选择本次语义导航可搜索/滚动的区域 |
| step(app,route) | 返回 true 表示已处理特殊入口，否则通用入口导航；随后统一核对页面 |
| beforeParent(app,previous) | 可返回已验证 view，避免错误执行 Back；否则正常返回 |
| afterBack(app,previous) | 处理返回后的临时菜单或搜索页，随后统一验证 |
| sibling(page) | 可处理相邻页快捷路线，成功返回已验证 view；否则返回空值 |

共用等待、取消检查、实时树、遮挡检查及证据流程；不得保存坐标或绕过状态验证。新适配需要保存的脱敏树 fixture、离线行为测试及实机验证范围说明。现有适配提取自历史 HarmonyOS 7 路线，不宣称覆盖所有系统或应用版本。

## 恢复与兼容

新运行使用 progress schemaVersion 3。续跑必须匹配设备、应用版本、清单及选择；待恢复勿扰先核对设备身份，再优先恢复。版本 1/2 不执行业务续跑；有待恢复标记时，核验身份后备份 progress.before-core-v3.json，只恢复勿扰并保持原 schemaVersion。未知版本拒绝。

CLI 可使用 `node scripts/run.mjs --recover --resume <原证据目录> --device <在线设备ID>` 只恢复勿扰。版本 1 缺少 deviceId 时还核对原设备/应用指纹。旧项目已删除时恢复不依赖该项目仍存在；恢复不代表业务成功。

## 验收层级

共享离线测试、GUI 协议/原生测试、打包与安装启动、手机业务验收分别报告。相同设备严禁同时运行 CLI 和 GUI。新内核包不替换正在运行的部署；实机报告只消费当次 progress.json 与现场证据。
