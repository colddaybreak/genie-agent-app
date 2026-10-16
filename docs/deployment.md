# Genie Agent App — 部署方案（已核实）

> 版本：v0.1（2026-10-16）
> 依据：官方 AppKit 部署文档（`npx appkit docs ./docs/app-management.md` / `./docs/configuration.md`）、Databricks Apps 官方文档（Deploy / app-runtime / auth / genie resources）、AppKit 0.88.0 源码（`dist/schemas/manifest.js` 的 `SCOPE_BY_TYPE` 与 `DABS_BINDING_BY_TYPE`）、Databricks CLI v0.298.0（`databricks apps deploy --help` 实测）、同工作区此前 chatbot 应用（官方 Chat UI 模板）的实际部署产物。
> 与指南的对应：§13 部署、发布与回滚；§5.2 app.yaml；§12 验收清单。

---

## 1. 部署模型（官方增强部署管道）

一条命令，在项目目录内执行（CLI 检测到 `databricks.yml` 且不带 APP_NAME 时走增强管道，本机 v0.298.0 已支持）：

```bash
databricks apps deploy
```

管道步骤（官方 `app-management.md`）：

1. 验证项目（Node.js 项目：build / typecheck / lint）
2. 构建前端（`npm run build`）并部署 bundle 到工作区
3. 启动 app

平台侧行为（官方 Apps Deploy 文档）：

- Node.js 应用：平台执行 `npm install`，若 `package.json` 定义了 `build` 脚本则再执行 `npm run build`
- 以 `app.yaml` 的 `command` 启动：`['npm', 'run', 'start']` → `node ./dist/server.js`
- `DATABRICKS_APP_PORT` 由平台注入，server 监听该端口（`0.0.0.0`）
- 资源绑定：`databricks.yml` 的 `resources.apps.app.resources` 声明，`app.yaml` 通过 `env.valueFrom` 注入

## 2. 部署前检查清单

- [ ] Databricks CLI 可用且已登录目标工作区：`databricks auth login --host <workspace-host>`；`databricks.yml` 的 `targets.default.workspace.host` 已替换为实际工作区地址
- [ ] 工作区已开放 Genie Agent 功能（open-questions Q1）
- [ ] 已取得 Genie Agent（space）ID 与显示名（open-questions Q2；ID 即 API 的 `agent_id`）
- [ ] `npm run typecheck && npm run lint && npm run build` 全绿（2026-10-16 本机已验证）
- [ ] `.env` 不入部署（`.gitignore` + `databricks.yml` 的 `sync.exclude` 双保险）；生产环境不设置 `GENIE_AGENT_MOCK`
- [ ] 可选预检：`npx appkit doctor [-p <profile>]`（检查认证、配置与资源可达性）

## 3. 部署配置清单（已就位）

| 文件 | 字段 | 值 | 状态 |
|---|---|---|---|
| databricks.yml | `user_api_scopes` | `[genie]` | ✅ 已修正（`dashboards.genie` 为 deprecated 别名，官方 auth 文档明确映射到 `genie`；AppKit `SCOPE_BY_TYPE` 亦将 `genie_space` 解析为 `genie`） |
| databricks.yml | `resources.apps.app.resources` | `genie_space: { name, space_id, permission: CAN_RUN }` | ✅ 与 AppKit `DABS_BINDING_BY_TYPE` 契约一致（yamlKey `genie_space`；`name→name`、`id→space_id`；权限枚举含 CAN_RUN） |
| databricks.yml | `sync.exclude` | `.env` / `node_modules` / 测试产物 | ✅ 新增（防止 `GENIE_AGENT_MOCK=true` 泄漏进生产） |
| databricks.yml | `targets.default.workspace.host` | 占位符（模板默认 `https://your-workspace.cloud.databricks.com`） | ⚠️ 部署前替换为实际工作区地址 |
| databricks.yml | `variables.genie_space_id / genie_space_name` | 无默认值 | ⚠️ 部署时必须提供（见 §4） |
| app.yaml | `env.DATABRICKS_GENIE_AGENT_ID` | `valueFrom: genie-space` | ✅ 已配置 |
| manifest.yaml | `resource_specs` / `user_api_scopes` | `CAN_RUN` / `[genie]` | ✅ 已对齐 |

## 4. 部署步骤

```bash
cd genie-agent-app

# 0) 配置工作区：将 databricks.yml 的 targets.default.workspace.host 替换为你的工作区地址
databricks auth login --host https://<your-workspace>.cloud.databricks.com

# 1) 部署（二选一提供 Genie Agent 参数）
#    a) 命令行传参：
databricks apps deploy --var="genie_space_id=<SPACE_ID>" --var="genie_space_name=<Display Name>"
#    b) 或在 databricks.yml 的 targets.default.variables 中写实（推荐提交前确认）

# 2) 查看状态与 URL
databricks apps get genie-agent-app

# 3) 实时日志
databricks apps logs genie-agent-app --follow
```

首次部署由 bundle 自动创建 app「genie-agent-app」、绑定 genie-space 资源并启动（`lifecycle.started: true`）。

常用选项（CLI 帮助实测）：`--skip-validation`（跳过本地 build/typecheck/lint，快速迭代）、`--target <t>`（切换 target）、`--auto-approve`、`--force`（覆盖 Git 分支校验）。

## 5. 授权与权限

- **用户（OBO）**：genieAgent 全部路由经 `_asUserScoped(req)` 运行，平台代理注入用户令牌；`user_api_scopes: [genie]` 声明后由平台完成授权流程。Genie Agents API 的必需 scope 即 `genie`（官方 API Reference）。
- **服务主体（SP）**：资源绑定授予 SP `CAN_RUN`（databricks.yml）。SP 还需对 Genie Agent 底层数据源具备访问权限（官方 Genie 资源文档）。
- **使用者**：被分享的用户本身需有权限运行该 Genie Agent，否则 OBO 调用返回 403。
- **可选共享（参照此前 chatbot app）**：

  ```yaml
  permissions:
    - group_name: <开发组>
      level: CAN_MANAGE
    - group_name: <使用组>
      level: CAN_USE
  ```

- **可选**：`budget_policy_id`（成本归属，按本工作区策略填）；`compute_size`（默认规格即可）。
- **工作区级限制**：官方 auth 文档注明 workspace admin 可维护可用 scope 白名单；若 `genie` 不在白名单需管理员开启。

## 6. 部署后验证（对照指南 §12）

1. `databricks apps get genie-agent-app` → 状态 RUNNING，记录 URL
2. 浏览器打开：Dashboard 正常显示 Unity Catalog 目录/表（workspace 插件，OBO 数据）
3. 对话页发问 → SSE 流式返回思考/工具调用/表格/图表；界面**无** Mock 标识
4. 换另一个用户账号打开 → 验证用户级隔离（OBO 各自令牌）
5. `databricks apps logs` 中**不得**出现 `GENIE_AGENT_MOCK is enabled`
6. 异常对照：`404 FEATURE_DISABLED` → 工作区未开放 Agent mode（Q1）；`403` → 检查 scope 同意与 Genie Agent 权限

## 7. 回滚

- 停服但不删除：`databricks apps stop genie-agent-app`；恢复：`databricks apps start genie-agent-app`
- 代码回滚：`git checkout <上一提交>` → 重新 `databricks apps deploy`（bundle 重新同步源码并重建）
- 彻底移除：`databricks apps delete genie-agent-app`（不可撤销，需谨慎）
- 本 app 无数据库迁移；会话数据由 Genie 侧持久化，代码回滚即完整回滚

## 8. 与此前 chatbot app 的对照

| 维度 | 此前 chatbot（官方 Chat UI 模板） | 本 app |
|---|---|---|
| 部署机制 | DABs + `databricks apps deploy` 增强管道（CLI 1.16.0） | 相同管道（本机 CLI v0.298.0 已实测支持） |
| 资源绑定 | serving_endpoint `CAN_QUERY`（另有 Lakebase 数据库、experiment） | genie_space `CAN_RUN`（无数据库；会话由 Genie 侧持久化） |
| user_api_scopes | `[model-serving]` | `[genie]` |
| 启动 | `app.yaml` `command: ["npm","run","start"]` | 相同 |
| 目标管理 | dev / staging / prod 三 target + 资源名后缀 | 当前仅 default target（需要时再加） |
| 权限/成本 | 组 CAN_MANAGE / CAN_USE + `budget_policy_id` | 未配置（见 §5 可选步骤） |

## 9. 未决与限制

- **Q1 / Q2 未解答前无法完成真实联通验证**（工作区是否开放 Agent mode、真实 space ID）；可先用 Mock 模式完成 UI 评审。
- 真实环境首跑后需回填 open-questions 的 Q4–Q7、Q10、Q11（列表接口行为、items 分页、图片/Viz 形态、取消边界、可见范围）。
- 本方案不包含 CI/CD 自动化（当前为手动 `databricks apps deploy`）；如需纳入流水线，可参考 Databricks CLI / bundle 的 `--profile` 用法。
