# 本地执行协议 v1

原生应用以绝对路径启动内置 Node.js：

```text
node desktop-host.mjs --hdc <内置 hdc 绝对路径> --data-dir <可写用户数据目录>
```

UTF-8 JSON Lines，stdout 只输出协议，stderr 为诊断日志。不开放网络端口。请求必须带字符串 `id`，响应使用同一 `id`，包含 `result` 或 `error`。主线程保持响应，设备命令在工作线程执行。收到 `idle` 后才允许下一项设备任务；`cancel`、`catalog`、`plan`、`runs` 不需要等待任务结束。

| method | params | 返回结果 |
|---|---|---|
| catalog | 无 | categories、operations；目标类型、默认值和合法枚举来自 operations.json |
| devices | 无 | id、status、model、software、可选 error；读取元信息，不遍历设置 |
| plan | selection: [{id,target}] | 按页面合并的项目列表；空选择报错 |
| execute | request: {deviceId,selection:[{id,target}]} | {directory,progress}，执行收尾完成后返回 |
| runs | 无 | 当前数据目录中的未完成任务和待恢复勿扰任务 |
| resume | directory、deviceId | 使用该运行已冻结的 request 继续；不接受替换目标 |
| recover | directory、deviceId | 只恢复该任务的勿扰，不继续业务操作 |
| cancel | 无 | {stopping}；只请求停止，最终以结果和 idle 为准 |
| shutdown | 无 | 先协作停止、恢复勿扰，再退出 |

目标值：19 个开关使用 JSON boolean；B01 使用 `"simple"` 或 `"default"`。省略 CLI selection 时沿用默认全部选择；GUI 必须显式提交勾选项。未知项目、重复 ID、错误类型和非法目标均拒绝。

事件：

- `ready`：protocolVersion 与 recoverable。
- `progress`：directory 和完整 progress；必须持久化成功后才发送。
- `idle`：工作线程退出、设备不再执行命令；携带最新 recoverable。

每次运行冻结设备与目标，将 catalogHash、requestHash、设备及应用版本指纹写入 schemaVersion 2 的 progress.json。结果目录由内核生成。GUI 续跑只能引用当前数据目录中发现的任务，且 deviceId 必须匹配。恢复待处理勿扰优先于版本／清单兼容性检查；恢复成功不意味着可以继续旧业务操作。

业务状态为 passed、unchanged、failed、not_found、pending、incomplete。总状态 completed、completed_with_missing、completed_with_failures、incomplete 与进程退出码分开判断。证据路径为结果目录内的相对路径；本机界面仅打开该目录下的文件。

取消时不启动下一项目；已发生的修改先完成当前页核验和证据保存，再恢复勿扰。设备断开导致无法恢复时保留 restorePending，后续连接同一设备后优先处理。不承诺崩溃时撤销已完成的业务修改。

GUI 使用系统用户数据目录；CLI 可用 `--request <JSON>` 提交相同 request、`--output <目录>` 更换运行根目录，或 `--resume <结果目录>` 继续 schemaVersion 2 任务。旧版进度不能直接迁移；有遗留勿扰义务应先用原版本恢复。

## 共享内核

主机和 worker 调用 core/index.mjs，设备发现及执行不在桌面适配层重复实现。JSON Lines 协议保持 v1；进度 schemaVersion 为 3。新增 diagnostic 事件包含 level/message，可供日志展示；未知事件可忽略。progress 保持先持久化后通知。

版本 1/2 进度不能执行业务续跑；待恢复勿扰须先核对设备身份，备份原进度后仅恢复勿扰，保留原 schemaVersion。recover 不依赖旧选择仍存在于当前清单。业务成功、命令退出及勿扰恢复分别判断。桌面包携带 core-source.json，锁定 main 提交及内核内容摘要。
