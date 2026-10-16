[English](README.md) | **简体中文**

# Genie Agent App — Databricks AppKit 模板

基于 [Databricks AppKit](https://developers.databricks.com/docs/appkit/v0/) 的 **Genie Agent mode** 应用模板：左侧栏 + Dashboard + 流式对话时间线，可直接作为新项目起点使用。

- **官方实现优先**：全部 UI 组件来自官方 `@databricks/appkit-ui`（Sidebar 套件、ECharts 图表组件、`GenieQueryVisualization` 等）；后端通过官方 AppKit 自定义插件机制，按官方 REST 契约封装 **Genie Agents API**（`POST /api/2.0/genie/agents/{agent_id}/responses`，SSE 流式）。
- **显式 Mock 模式**：无需 Databricks 凭据即可本地完整运行（界面有显著 Mock 标识），真实/模拟一眼可辨。
- **OBO 用户身份**：部署在 Databricks Apps 上时，所有 Genie 调用以当前用户身份执行（`x-forwarded-access-token`）。

## 功能一览

| 区域 | 内容 |
|---|---|
| Dashboard（默认页） | 数据目录与表浏览（Unity Catalog）、Genie 会话统计、最近对话列表、上一次对话内容预览 |
| 对话页 | SSE 流式时间线：思考过程与思考时长、工具调用明细（`execute_sql` 的 title / SQL / 耗时）、Markdown 报告（含图片与表格）、结果表格（全屏放大）、图表（官方组件自动推断类型） |
| 侧边栏 | 官方 Sidebar 套件；左下角用户菜单与设置（主题跟随系统 / 明 / 暗） |

## 技术栈

- 后端：Node.js v22+、Express、`@databricks/appkit` 0.88（自定义插件：`genie-agent`、`workspace`）
- 前端：React 19、react-router 7、Vite（rolldown）、Tailwind CSS 4、`@databricks/appkit-ui` 0.88
- 工程：TypeScript 5.9、ESLint 9、Prettier 3、Vitest 4

## 快速开始

前置：Node.js v22+ 与 npm。

```bash
npm install

# Mock 模式（默认）：无需任何 Databricks 凭据
cp .env.example .env
npm run dev            # http://127.0.0.1:8000
```

连接真实工作区（Live 模式）：编辑 `.env`

```env
GENIE_AGENT_MOCK=false
DATABRICKS_CONFIG_PROFILE=DEFAULT     # 或 DATABRICKS_HOST=... + DATABRICKS_TOKEN=...
DATABRICKS_GENIE_AGENT_ID=<genie-agent-space-id>
```

> 本地以当前登录用户凭据直连；部署到 Databricks Apps 后由平台注入用户令牌（OBO），见 [docs/deployment.md](docs/deployment.md)。

### 常用命令

| 命令 | 说明 |
|---|---|
| `npm run dev` | 开发模式（服务端热重载 + Vite 中间件） |
| `npm run build` | 构建服务端 `dist/` 与前端 `client/dist/` |
| `npm start` | 运行生产构建 |
| `npm run typecheck` / `npm run lint` / `npm test` | 类型检查 / ESLint / Vitest |
| `npm run format` / `npm run format:fix` | Prettier 检查 / 修复 |
| `npx appkit doctor` | 诊断 Databricks 认证、配置与资源可达性 |

## 部署到 Databricks Apps

```bash
# 1) 编辑 databricks.yml：targets.default.workspace.host 替换为你的工作区地址
databricks auth login --host https://<your-workspace>.cloud.databricks.com

# 2) 一键部署（校验 → 构建 → bundle 部署 → 启动）
databricks apps deploy \
  --var="genie_space_id=<SPACE_ID>" --var="genie_space_name=<Display Name>"
```

- app 名称与资源定义在 `databricks.yml`（`resources.apps.app`）；Genie 访问通过 genie-space 资源注入（服务主体 `CAN_RUN`，用户授权 scope 为 `genie`）。
- 不要在生产设置 `GENIE_AGENT_MOCK`：本地 `.env` 已被 `sync.exclude` 排除，不会随部署上传。
- 完整检查清单、权限模型、部署后验证与回滚：见 [docs/deployment.md](docs/deployment.md)。

## 作为模板使用

**方式一：GitHub「Use this template」** — 创建新仓库后，按「快速开始」运行，并按需修改 `databricks.yml` 中的 `bundle.name` / `app.name` / `workspace.host`。

**方式二：官方 CLI 脚手架**（`databricks apps init --template <GitHub URL>`）：

```bash
databricks apps init \
  --template https://github.com/colddaybreak/genie-agent-app \
  --name my-genie-app
```

> 本仓库保留了官方模板机制的 `databricks.yml.tmpl` / `.env.tmpl`，脚手架时由 CLI 自动渲染项目名与工作区地址。

## 项目结构

```
client/                        # React 前端
  src/
    components/                # 侧边栏、设置、Markdown、timeline（reasoning / tool-call / query-result 卡片）
    hooks/                     # use-genie-agent-chat（SSE 状态机）、use-theme
    pages/                     # dashboard.tsx、chat.tsx
server/
  server.ts                    # 服务入口（AppKit createApp）
  mock-workspace-client.ts     # Mock 模式用的 workspace client
  plugins/
    genie-agent/               # 核心插件：官方 REST 封装 + SSE + adapters（真实 / Mock）
    workspace/                 # 当前用户身份与 Unity Catalog 元数据
docs/                          # 可行性评估、实施方案、部署方案、未决项
databricks.yml                 # DABs 配置（app、scope、资源绑定、sync.exclude）
app.yaml                       # 运行命令与环境注入（valueFrom: genie-space）
appkit.plugins.json            # AppKit 模板 manifest（插件与脚手架元数据）
manifest.yaml                  # 应用清单（资源规格 / 用户 scope）
```

## 文档

| 文档 | 内容 |
|---|---|
| [docs/feasibility-and-architecture.md](docs/feasibility-and-architecture.md) | 可行性评估与架构设计：官方能力核查矩阵、数据流、关键设计决策 |
| [docs/implementation-plan.md](docs/implementation-plan.md) | 分阶段实施计划与未来扩展方向 |
| [docs/deployment.md](docs/deployment.md) | 部署方案：检查清单、步骤、授权与权限、验证与回滚 |
| [docs/open-questions.md](docs/open-questions.md) | 未验证项清单（真实环境首跑后回填） |

## 环境变量

| 变量 | 说明 |
|---|---|
| `GENIE_AGENT_MOCK` | `true` / `1` 启用 Mock 模式（本地开发默认）；生产不设置 |
| `DATABRICKS_GENIE_AGENT_ID` | Genie Agent（space）ID；部署时由 `app.yaml` 的 `valueFrom: genie-space` 注入 |
| `DATABRICKS_CONFIG_PROFILE` 或 `DATABRICKS_HOST` + `DATABRICKS_TOKEN` | 本地 Live 模式凭据（二选一） |
| `DATABRICKS_APP_PORT` | 服务端口（本地默认 8000，部署时由平台注入） |

---

示例模板，未附带开源许可证（`Unlicensed`）。
