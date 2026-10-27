# 项目报告交付契约

- 本项目验收报告必须复用 `dev/report-template/template.html`；先阅读 `dev/report-template/README_zh.md`。
- Agent 先输出严格 JSON，字段契约见 `dev/report-template/report.schema.json`，格式参考 `example.json`。不得手写最终 HTML 或将 Markdown 代码围栏写入 JSON 文件。
- 正式内容写入 `dev/<主题>/report_YYYY-MM-DD_HH-mm.json`；只填写实际记录。示例的时间与状态不可照搬。实际报告设 `mode: actual`。
- 必须先运行 `node dev/report-template/validate.mjs <json路径>`，退出码为 0 且输出 VALID 后，再运行 `node dev/report-template/render.mjs <json路径> dev/<主题>/stage_report_YYYY-MM-DD_HH-mm.html`。生成器内置二次校验，且拒绝覆盖已有报告。
- 时间、文件名、页面标题均使用北京时间；填写实际提交 SHA，没有 Git 仓库时写 `N/A：原因`。明确验证范围、环境、状态和未覆盖项，历史结果必须标明记录时间。
- 构建、安装、启动、业务功能及回归分层记录；不得把上一级成功当作业务成功。通过和失败必须附可追溯证据说明（持久证据路径、采集时间，适用时附 SHA-256）。临时日志放 `/tmp`，不能将临时日志作为唯一持久证据。
- 校验器只验证结构和状态一致性，不证明证据真实；交付前还须人工或工具核对证据内容，并打开生成页面检查展示。
- 报告相关实现和文档位于 `dev/report-template/`；保留原有历史报告。模板变更后运行 `node --test dev/report-template/test.mjs`，并用新的输出路径生成预览。

# 实机验证

- 遇到设备锁屏，先尝试正常唤醒和上滑；无密码时可自行解锁。出现密码或其他凭据要求时再请用户介入，不修改锁屏配置。

- Agent 执行前若设备列表为空或未授权，先区分 hdc 工具故障与连接问题，按 README_zh.md 的连接指引逐步指导用户开启开发者模式、USB 调试及授权电脑；用户完成后重新枚举并读取新 UI Tree，不能直接将全部项目跳过。
