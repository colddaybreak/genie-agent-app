# 实施方案（分阶段）与未来扩展

> 配套文档：`docs/feasibility-and-architecture.md`（评估与架构）、`docs/open-questions.md`（未验证项）。
> 原则：先跑通「示例前端 + 显式 Mock」，再逐项接入真实官方 API；每一步都可独立验收。

---

## 阶段划分

### P0 — 工程骨架（本次交付）

| 项 | 内容 | 验收 |
|---|---|---|
| P0-1 | 以官方 `appkit-genie` 模板为基线建立本仓库（依赖升级到 AppKit 0.88） | `npm run typecheck` 通过 |
| P0-2 | Windows 兼容：脚本改用 `cross-env`；`.env` 驱动本地运行 | Windows Git Bash / cmd 均可 `npm run dev` |
| P0-3 | 显式 Mock 模式：`GENIE_AGENT_MOCK=true` 时 `MockAdapter` 产出**与真实事件同构**的 SSE 序列 | 无 Databricks 凭据可完整演示 |

### P1 — 对话页（本次交付的核心）

| 项 | 内容 | 验收 |
|---|---|---|
| P1-1 | `useGenieAgentChat`：SSE 状态机（created/added/updated/done/completed/failed），按 `sequence_number` 排序、按 Item ID 去重更新 | 事件乱序到达不重复渲染 |
| P1-2 | Timeline 渲染四类 Item：reasoning（可折叠）/ function_call / function_call_output / message | 与官方事件语义一一对应 |
| P1-3 | `ToolCallCard`：`execute_sql` 展示 title+SQL+参数+输出摘要+单工具耗时；未知工具只展示安全摘要 | 未知工具不渲染原始参数 |
| P1-4 | 思考时间：每条 reasoning/message 显示到达→完成耗时；单次 response 显示总耗时 | 时间来自事件到达时钟（本地观测），不伪造成平台指标 |
| P1-5 | 查询结果：`GenieQueryVisualization`（官方图表推断 + 表格 Tab）+ 全屏放大（官方 Dialog）+ 复制 | 图表类型自动选择可人工切换 |
| P1-6 | 报告 Markdown（官方 marked+DOMPurify）：表格、代码块、图片渲染 | 图片 URL 正常显示 |
| P1-7 | 取消（官方 cancel API）、断线恢复（items API + `has_more` 分页） | 刷新页面可恢复完整历史 |
| P1-8 | 错误呈现区分：权限不足 / 功能未开放（404 FEATURE_DISABLED）/ 并发冲突（409）/ 数据为空 | 不把「无权限/失败」渲染成「无数据」 |

### P2 — Dashboard 与布局（本次交付）

| 项 | 内容 | 验收 |
|---|---|---|
| P2-1 | 官方 Sidebar 布局：左侧导航（Dashboard / Chat / 设置），**左下角用户菜单**（身份 + 主题 + 关于） | 与需求 R1 对齐 |
| P2-2 | Dashboard 卡片：数据目录（Catalog/Schema/表计数）、表清单（可搜索）、对话统计（次数/成功率）、最近对话列表 | 数据来自官方 API |
| P2-3 | 上次对话内容：默认选中最近一次会话，展示末轮问与答摘要 | 一键跳转对话页恢复该会话 |
| P2-4 | 空态/加载/错误态三态规范（官方 Skeleton/Empty/Alert） | 无 API 数据时给出可操作指引 |

### P3 — 真实环境联通（需要用户侧前置条件）

| 项 | 内容 | 前置 |
|---|---|---|
| P3-1 | `databricks.yml` 真实资源绑定：`genie-space`、`user_api_scopes: [genie]`、目标 host | 用户提供 workspace 与 space/agent id |
| P3-2 | 部署验证：`databricks bundle deploy` + 授权页确认用户 scope | 见 open-questions Q1/Q2 |
| P3-3 | 联调录屏与问题闭环 | — |

### P4 — 未来扩展（不做承诺，保留设计位）

| 方向 | 设计位 |
|---|---|
| 对话持久化（Lakebase） | 官方 `lakebase()` 插件 + `database` 资源；仅存会话索引与标题，不复制平台数据 |
| 反馈（👍/👎） | 官方 Chat mode 有 `POST messages/{id}/feedback`；Agent mode 待验证，先列 open-questions |
| 结果下载 | 指南标注 `download-visualization` 等**待验证**；验证后接入（临时 URL 不落日志） |
| 多 Genie Space / 多 Agent | 插件 config `agents: {alias: id}` 已按别名设计（对齐官方 genie 插件多 space 模式） |
| Chat mode 对照页 | 直接启用官方 `genie()` 插件 + `GenieChat` 组件，零自建 |
| 审计与用量 | 官方 telemetry/OTel（AppKit 内置）挂接；写操作（取消等）显式审计 |
| i18n | 结构预留（文案集中），一期中英双语可选 |

---

## 本次交付范围（v0.1 示例）

- P0 全部 + P1 全部 + P2 全部（Mock 模式下可完整运行与演示）。
- P3 提供配置模板与操作清单，等待用户提供真实资源信息后联调。

## 文件规划（只保留需要的）

```
genie-agent-app/
├── app.yaml                    # Apps 运行配置（genie-space 资源注入）
├── databricks.yml              # bundle：app + genie-space + scopes
├── appkit.plugins.json         # 插件→资源规格声明
├── manifest.yaml               # 应用清单（资源规格/用户 scope）
├── package.json                # cross-env 修正；AppKit 0.88
├── server/
│   ├── server.ts               # createApp({plugins:[genieAgent(), server()]})
│   └── plugins/genie-agent/    # ★自建插件（官方契约）
│       ├── manifest.ts         # scopes:["genie"] + genie_agent 资源
│       ├── genie-agent-plugin.ts
│       ├── adapters/
│       │   ├── agent-mode-adapter.ts   # 官方 REST
│       │   └── mock-adapter.ts         # 显式 Mock
│       └── types.ts            # 事件/Item 类型（对齐官方契约）
├── client/src/
│   ├── layout/AppSidebar.tsx   # 官方 Sidebar + 左下角用户
│   ├── pages/dashboard/        # P2
│   ├── pages/chat/             # P1
│   ├── lib/genie-agent/        # useGenieAgentChat + 事件归约
│   └── lib/api.ts              # 轻量 fetch 封装
└── docs/                       # 本文档组
```

## 工程约定

- 格式化/校验沿用官方模板：ESLint(flat)+Prettier+Vitest；提交前 `npm run typecheck && npm run lint`。
- 注释与文档字符串一律英文（仓库既有约定）；文档中文。
- 提交信息：`<type>(<scope>): <subject>`。
- 不引入模板之外的依赖，除非有明确收益（当前新增仅 `cross-env`）。
