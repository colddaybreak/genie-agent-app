# Genie Agent App — 可行性评估与架构设计

> 版本：v0.1（2026-10-15）
> 依据：《Databricks Apps Coding AI Reference Guide》（下称「指南」）、官方 AppKit 0.88.0 源码（`@databricks/appkit` / `@databricks/appkit-ui`）、官方模板 `appkit-genie`、`e2e-chatbot-app-next` 参考实现、真实工作区资源清单。
> 本文所有「官方能力」条目均先核实来源再写入；无法核实的条目一律写入 `docs/open-questions.md`，不在代码中假装可用。

---

## 1. 需求回顾

| # | 需求 | 归类 |
|---|---|---|
| R1 | 新建项目，使用 LangBot 的 dashboard 前端思想（左侧导航栏、左下角用户与用户设置） | UI/UX |
| R2 | 参考 databricks chatbot app 的实现思想 | 架构 |
| R3 | 构建 **Genie Agent mode** 应用，**必须使用 Databricks 官方实现** | 核心能力 |
| R4 | Dashboard 默认页：项目使用的 tables / 各类目录 / 对话次数与详情 / 上一次对话内容 | 数据 |
| R5 | 对话页（从左侧栏进入）：流式返回 Genie 的全部操作与信息 | 核心能力 |
| R6 | UI 参考 Genie One：渲染图表与图片、放大表格、展示思考时间与工具调用细节 | UI/UX |
| R7 | 先评估 + 架构 + 方案，再输出示例前端，按反馈迭代；保持良好工程实践，只保留需要的组件；给出未来扩展 | 流程 |

---

## 2. 官方能力现状核查（v1 结论）

以下矩阵基于对本地安装包的实际源码阅读（非文档猜测），核实对象：

- `@databricks/appkit@0.88.0`（npm 最新版，已下载核验）与 `0.38.1`（本机已安装副本）
- `@databricks/appkit-ui@0.88.0`
- `@databricks/sdk-experimental@0.17.0`
- 官方模板 `appkit-genie`（声明依赖 0.65.0）

| 能力 | 官方支持现状（已核实） | 对本项目的影响 |
|---|---|---|
| Genie **Chat** mode（space/conversation/message + polling） | ✅ AppKit `genie()` 插件完整封装；`appkit-ui` 提供 `GenieChat` 组件与 `useGenieChat` hook | 可作为对照/降级路径，但**不是** R3 要求的能力 |
| Genie **Agent** mode（`POST /api/2.0/genie/agents/{agent_id}/responses`，SSE） | ❌ AppKit 0.88.0 与 0.38.1 的 genie 插件均**未封装**；`@databricks/sdk-experimental@0.17.0` 无 agent API；`agents` 插件只支持把 Genie space 当**工具**（`supervisorTools.genieSpace`），不是 Genie Agent | R3 需要自建薄适配层，直接按官方 REST 契约实现（见 §4） |
| 官方 UI：图表渲染 | ✅ `appkit-ui` 自带 ECharts 6 图表组件（Area/Bar/Line/Pie/Donut/Radar/Scatter/Heatmap）与 `GenieQueryVisualization`（**图表类型自动推断 + 图表/表格 Tabs**） | R6 图表可**直接复用官方组件** |
| 官方 UI：左侧栏 + 用户菜单 | ✅ `appkit-ui` 导出完整官方 Sidebar 套件（`SidebarProvider/Sidebar/SidebarMenu/SidebarFooter/...`），即官方维护的 shadcn sidebar | R1 布局直接基于官方组件 |
| 官方 UI：表格 | ⚠️ `DataTable` 绑定 `useAnalyticsQuery`（analytics 插件），**不适用于** Genie 查询结果；`GenieQueryVisualization` 内部的表格可复用其渲染思路 | R6「放大表格」需用官方 `Dialog` + 表格原语自行组合（组件官方、组合自建） |
| 官方 UI：Markdown/图片 | ✅ `appkit-ui` 依赖 `marked` + `dompurify`（内置渲染管线） | 报告正文中的图片/Markdown 可安全渲染 |
| SSE 传输 | ✅ 服务端 `Plugin.executeStream()` + `StreamManager`（缓冲、断线重连、`Last-Event-ID`、心跳、`id/event/data` 帧）；客户端 `connectSSE`（重试/退避/缓冲上限） | 自定义插件可复用官方 SSE 全链路 |
| 身份与 OBO | ✅ Apps 平台 `x-forwarded-access-token`；AppKit `_asUserScoped(req)` / `appkit.asUser(req)`；插件 manifest `scopes: ["genie"]` | 官方机制，照抄官方 genie 插件模式 |
| Unity Catalog 目录/表 | ✅ REST `/api/2.1/unity-catalog/{catalogs,tables,...}`（sdk-experimental 有对应服务） | R4 dashboard 数据源 |
| 对话列表/详情 | ✅ `GET /api/2.0/genie/spaces/{space_id}/conversations`（含 `agent_type` 可区分 Chat/Agent，指南 §18.6）；Agent 会话内容用 `GET .../agents/{agent_id}/conversations/{id}/items` 恢复 | R4 数据源；`include_all=true` 需 CAN MANAGE，业务页不申请 |
| 图表/图片下载 | ⚠️ 指南明确标注 `download-visualization` 等操作**待验证**，禁止按操作名猜请求 | 一期不做下载，列入 open-questions |
| 本地无凭据运行 | ❌ 无官方 mock | 自建**显式** Mock 模式（环境变量开关 + UI 显著标识），符合指南「不得掩盖假实现」 |

**结论：R3 所要求的 Genie Agent mode，官方有 API 契约但无现成封装；官方框架（AppKit）自定义插件机制正是为此类情况设计的。全部自建部分都建立在官方机制之上，不需要伪造任何能力。**

---

## 3. 可行性评估结论

**总体可行。** 风险与对策：

| 风险 | 概率/影响 | 对策 |
|---|---|---|
| 工作区未开放 Genie Agent 功能（`404 FEATURE_DISABLED`） | 中/高 | 一期交付可在 **Mock 模式**下完整演示与评审 UI；真实联通在 `docs/open-questions.md` 列明前置条件（agent_id、scope、feature 开关） |
| OBO scope 不足：`user_api_scopes` 未包含 `genie` / catalog read scopes | 高/高 | `databricks.yml` 增补 `genie`，以及 Unity Catalog 元数据所需的 `catalog.catalogs:read`、`catalog.schemas:read`、`catalog.tables:read`（`unity-catalog` 不是合法 Apps user scope）；部署后需在 Databricks 授权页确认用户授权，新增 scope 后用户需重新同意 |
| Agent 事件与 Chat 结构不同，容易误用 | 中/中 | 严格按指南 §18.13 做 **Adapter 分离**：`AgentModeAdapter` 与 `MockAdapter` 接口一致、实现不同；Chat mode 一期不混用 |
| SSE 跨块/重连解析错误 | 中/高 | 服务端用官方 `StreamManager` 透传；客户端用官方 `connectSSE`（已实现跨块缓冲、退避重试、`Last-Event-ID`） |
| 预览表被误当完整结果 | 中/中 | UI 明示「预览行数/总行数」；完整结果引导用户前往 Genie/SQL（下载能力一期不做） |
| OneDrive 目录上 npm 安装慢 | 低/中 | 沿用既有项目的本地 node_modules 实践；不额外引入重型依赖（复用 appkit-ui 已有 ECharts/Radix/marked） |
| Windows 下 `NODE_ENV=x node` 脚本不可用 | 已发生 | 脚本统一用 `cross-env`（本仓库模板由官方模板改造而来，已知问题） |

---

## 4. 架构设计

### 4.1 总体结构

```
┌─ Databricks Apps 运行时（app.yaml / databricks.yml）───────────────────┐
│  user_api_scopes: [genie, catalog.catalogs:read, catalog.schemas:read,     │
│                    catalog.tables:read]                                  │
│  resources: genie-space(CAN_RUN) / sql-warehouse(CAN_USE, 可选)         │
│             / database(CAN_CONNECT_AND_CREATE, 阶段2 可选)              │
└──────────────────────────┬────────────────────────────────────────────┘
                           │ OBO：转发用户 token（x-forwarded-access-token）
┌──────────────────────────┴────────────────────────────────────────────┐
│ Server：Node 20+ / AppKit 0.88 createApp                              │
│                                                                       │
│  plugins:                                                             │
│   ├─ server()          官方：静态资源 + /api 路由挂载                   │
│   ├─ genie()           官方：Chat mode（保留对照/降级，可配置关闭）      │
│   └─ genieAgent()      ★本项目自建（in-repo 插件，遵循官方插件契约）     │
│        POST /api/genie-agent/:alias/responses             → SSE 流     │
│        GET  /api/genie-agent/:alias/conversations         → 会话列表   │
│        GET  /api/genie-agent/:alias/conversations/:id/items → 历史恢复 │
│        POST /api/genie-agent/:alias/conversations/:id/     取消        │
│             responses/:responseId/cancel                              │
│        GET  /api/genie-agent/:alias/overview               → 首页统计  │
│        GET  /api/genie-agent/config                        → 运行模式  │
│                                                                       │
│  adapters（指南 §18.13 要求分离）：                                     │
│   ├─ AgentModeAdapter：官方 REST /api/2.0/genie/agents/...（OBO）      │
│   └─ MockAdapter：本地演示（GENIE_AGENT_MOCK=true 显式启用）            │
│                                                                       │
│  dashboard 数据（官方 REST）：                                          │
│   ├─ Unity Catalog catalogs/tables（Sp 或 OBO，按资源绑定决定）          │
│   └─ Genie List Conversations（agent_type 过滤）                        │
└──────────────────────────┬────────────────────────────────────────────┘
                           │ 同源 /api（Vite dev 代理 + 生产同域）
┌──────────────────────────┴────────────────────────────────────────────┐
│ Client：React 19 + react-router 7 + Tailwind 4 + appkit-ui 官方组件     │
│                                                                       │
│  layout/  Sidebar（官方）左侧导航 · 左下角用户菜单（身份来自 /api/me）    │
│  pages/dashboard  目录与表 · 对话统计 · 最近对话 · 上次对话内容          │
│  pages/chat       Genie Agent 流式对话                                 │
│    ├─ useGenieAgentChat（仿官方 useGenieChat + 官方 connectSSE）        │
│    ├─ Timeline：reasoning（含思考时长）/ function_call（工具明细）       │
│    │           / function_call_output / message（报告）                │
│    ├─ ToolCallCard：execute_sql 展示 title+SQL+耗时；通用工具安全摘要    │
│    ├─ GenieQueryVisualization（官方：图表推断 + 表格 Tabs）             │
│    ├─ ResultTable + FullscreenDialog（官方 Dialog 组合：放大表格）      │
│    └─ Markdown（marked+DOMPurify）：报告中的图片/表格                   │
└───────────────────────────────────────────────────────────────────────┘
```

### 4.2 一次提问的完整数据流

1. 前端 `connectSSE(POST /api/genie-agent/default/responses, { input, conversation_id?, enable_viz: true })`
2. 插件路由 `_asUserScoped(req)` → 以**当前用户身份**建立执行上下文（OBO）
3. `AgentModeAdapter` 调用官方 API：`POST {host}/api/2.0/genie/agents/{agent_id}/responses`（`text/event-stream`）
4. SSE 帧逐条解析 → 规范化为本项目事件 → `this.executeStream()` 经官方 `StreamManager` 转发给浏览器（自动获得心跳/缓冲/断线续传）
5. 断线/刷新后：`GET .../conversations/{id}/items`（`limit/order/after`）恢复完整 Item 记录；取消：`POST .../cancel`

### 4.3 关键设计决策（Why）

| 决策 | 理由 |
|---|---|
| 用 AppKit 官方框架 + **自定义插件** 而非直接用官方 `genie()` 插件 | 官方插件只覆盖 Chat mode；自定义插件是官方为扩展设计的机制（官方文档《Creating custom plugins》），契约与官方 genie 插件逐行对齐 |
| **不**把 `GenieChat` 官方组件用作主对话 UI | 它是 Chat-mode 语义（消息+附件），渲染不了 Agent 的 reasoning/function_call 时间线；但复用其内部思想（`useGenieChat` 的 SSE 状态机）与全部底层官方组件 |
| 对话结果图表用官方 `GenieQueryVisualization` | 官方组件已含 ECharts + 类型推断 + 图表/表格切换，避免自造轮子 |
| Dashboard 数据全部来自官方 API（UC + Genie List Conversations） | 指南禁止臆想数据；不伪造业务数据 |
| Mock 模式显式化（横幅 + `/api/genie-agent/config` 暴露 `mode`） | 指南 0.3：不得掩盖假实现；演示与真实环境必须一眼可辨 |
| Adapter 分离（AgentModeAdapter/MockAdapter） | 指南 §18.13 明确要求；未来可平滑增加 Chat-mode 或 Supervisor 等适配器 |
| 状态管理：React 局部状态 + 轻量共享（无 Redux/React Query） | 保持简单（KISS）；页面间共享仅「身份/配置」，对话页状态自洽 |
| 不引入 Lakebase 持久化（阶段 1） | 官方 List Conversations/Items 已提供历史；持久化留作阶段 2 扩展，避免过早复杂 |

### 4.4 与需求映射（验收口径）

| 需求 | 实现锚点 |
|---|---|
| R1 左侧栏 + 左下角用户 | `client/src/layout/AppSidebar.tsx`（官方 Sidebar 套件）；用户身份来自 `/api/me`（AppKit 请求头解析） |
| R3 官方实现 | 前端组件全部 `@databricks/appkit-ui`；后端 AppKit 插件契约 + 官方 REST；部署走 Apps + bundle |
| R4 Dashboard | `pages/dashboard/*`：Catalog 树、表清单、对话统计卡、最近对话表、上次对话内容预览 |
| R5 流式全信息 | `useGenieAgentChat` + `Timeline`，事件按 `sequence_number` 排序、按 Item ID 增改 |
| R6 图表/图片/放大/思考时长/工具细节 | `GenieQueryVisualization` / Markdown 图片 / `Dialog` 全屏表格 / 每 Item 计时徽标 / `ToolCallCard` |
| R7 工程实践 | 官方 ESLint+Prettier+Vitest 配置沿用；只新增必要文件；`docs/open-questions.md` 管理未验证项 |

---

## 5. 官方契约速查（实现依据，均已核实）

### 5.1 Genie Agent mode（指南 §18.5–18.6）

```
POST /api/2.0/genie/agents/{agent_id}/responses        # SSE；省略 conversation_id = 新会话
GET  /api/2.0/genie/agents/{agent_id}/conversations/{conversation_id}/items?limit&after&order
POST /api/2.0/genie/agents/{agent_id}/conversations/{conversation_id}/responses/{response_id}/cancel
GET  /api/2.0/genie/spaces/{space_id}/conversations    # 含 agent_type，用于会话列表
```

- 事件：`response.created` / `response.output_item.added` / `.updated` / `.done` / `response.completed` / `response.failed`；含递增 `sequence_number`；服务端 30 分钟超时；**断开流不会取消执行**。
- Item：`reasoning`（过程信息，可折叠）、`function_call`（`call_id` + `arguments` JSON 字符串，SQL 工具名为 `execute_sql`，arguments 含 `title`/`sql`）、`function_call_output`（可为 Markdown 表格）、`message`。
- 错误：同会话并发 → `409 RESOURCE_CONFLICT`；功能未开 → `404 FEATURE_DISABLED`。
- Scope：`genie`（官方 genie 插件 manifest 同款声明）。

### 5.2 AppKit 自定义插件契约（官方源码核实）

```ts
class GenieAgentPlugin extends Plugin {
  static manifest = defineManifest(manifestJson);       // scopes: ["genie"]
  injectRoutes(router) {
    this.route(router, { name, method: "post", path: "/:alias/responses",
      handler: async (req, res) => { await this._asUserScoped(req)._handle(req, res); } });
  }
  async _handle(req, res) {
    const client = getWorkspaceClient();                 // 用户身份（OBO）由上层作用域保证
    await this.executeStream(res, (signal) => this.adapter.stream(...), streamSettings);
  }
}
export const genieAgent = toPlugin(GenieAgentPlugin);
```

- SSE 帧：`id: {n}` + `event: {type}` + `data: {json}` + 空行；心跳 `: heartbeat`；`X-Accel-Buffering: no`。
- 客户端：官方 `connectSSE`（POST、JSON `data`、重试退避、`Last-Event-ID`）。
