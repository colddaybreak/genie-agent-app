# Open Questions（未验证项，禁止按猜测实现）

> 规则来源：指南 §0.3——未确认的 API 路径、参数、字段、scope、资源 ID 一律记录在此，不得写死进代码或在 UI 中假装可用。
> 状态：`open` / `answered` / `blocked`。回答后请更新本条并同步代码。

| # | 问题 | 影响 | 状态 | 需要的回答 |
|---|---|---|---|---|
| Q1 | 目标工作区是否已开放 Genie **Agent mode**（`FEATURE_DISABLED` 与否）？ | R3 能否真实联通 | open | 在 Workspace 里创建/打开一个 Genie Agent，确认可访问 |
| Q2 | Genie **Agent ID** 是什么？所属 Genie Space ID 是什么？ | 配置 `genie-agent-id` / `genie-space-id` | open | 提供 agent_id 与 space_id（可从页面 URL 获取） |
| Q3 | Agent 调用需要的用户授权 scope 是否就是 `genie`？是否还需 `dashboards.genie`？ | `databricks.yml` 的 `user_api_scopes` | **answered（2026-10-16）** | 只需 `genie`。证据：① 官方 API Reference 标注 required scope 为 `genie`；② AppKit 自身 `SCOPE_BY_TYPE` 将 `genie_space` 映射为 `genie`（`dist/schemas/manifest.js`）；③ Databricks Apps 授权文档明确 `dashboards.genie` 为 deprecated 别名、映射到 `genie`。已同步修正 `databricks.yml` 与 `manifest.yaml`。**2026-10-20 补充**：workspace 插件的 Unity Catalog 元数据路由另需 `catalog.catalogs:read` / `catalog.schemas:read` / `catalog.tables:read`；`unity-catalog` 不是合法的 Apps user scope（官方 auth 文档已确认）。 |
| Q4 | `GET /api/2.0/genie/spaces/{space_id}/conversations` 返回的列表是否**包含 Agent 会话**（`agent_type` 取值集合）？ | Dashboard 会话统计的数据源 | open（指南只说明该接口提供 `agent_type`，未给出枚举值） | 真实环境调用一次，抓取样例响应 |
| Q5 | Agent Item 恢复接口 `GET .../items` 的 `limit/order/after` 行为与响应字段是否与指南一致（`data/first_id/last_id/has_more/status`）？ | 刷新恢复与分页 | open | 同上，抓取真实响应 |
| Q6 | Agent 的 `message`/`function_call_output` 是否会返回**图片**（含何种字段/格式，如 Markdown 内联图片或独立 image Item）？ | R6「渲染图片」的真实路径 | open | 抓取含图表的真实响应样例 |
| Q7 | `enable_viz: true` 在 Agent mode 下返回的 viz 数据形态（是否随事件内联，还是要再取附件）？ | 图表渲染路径（一期以 `function_call_output` 中的结构化表格 + 官方推断为主） | open | 抓取样例 |
| Q8 | Agent 会话是否有 feedback/评论接口？（Chat mode 有 `messages/{id}/feedback`） | 阶段 4 反馈能力 | open | 官方文档或真实探测 |
| Q9 | 图表/结果下载的官方操作契约（指南标注 `download-visualization` 待验证） | 阶段 4 下载能力 | open | 接口 Schema 核实后再实现 |
| Q10 | 取消接口对**已完成**响应的行为（幂等失败码？） | 取消按钮的边界处理 | open | 真实环境探测 |
| Q11 | List Conversations 的默认可见范围（仅本人？全员？）与 `include_all` 权限边界 | Dashboard 统计口径（只申请最小权限） | open（指南：`include_all=true` 至少 CAN MANAGE，业务页不申请） | 真实环境验证默认可见范围 |

## 已确认事实（供对照，不代表无需再验）

- AppKit 0.88.0 / 0.38.1 的 `genie` 插件**不支持** Agent mode（源码核实，2026-10-15）。
- `@databricks/sdk-experimental@0.17.0` 无 Genie Agent API（源码核实）。
- 官方 `connectSSE` 帧格式：`id:`/`event:`/`data:` + 空行；支持 `Last-Event-ID` 重连。
- 官方 genie 插件 manifest 声明 `scopes: ["genie"]`，路由以 `_asUserScoped(req)` 运行（OBO）。
