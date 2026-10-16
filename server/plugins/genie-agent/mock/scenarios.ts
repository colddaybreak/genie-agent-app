/**
 * Scripted Genie Agent scenarios for local development (GENIE_AGENT_MOCK=true).
 *
 * Data is intentionally synthetic and clearly labeled as mock: it exercises
 * every documented item type (reasoning / function_call / function_call_output
 * / message with Markdown tables) so the real SSE pipeline and UI can be
 * developed without workspace credentials. No contract fields beyond the
 * documented ones are emitted.
 */

export interface MockScenarioQuery {
  title: string;
  sql: string;
  columns: string[];
  rows: Array<Array<string | null>>;
  /** Markdown table rendered inside function_call_output.output */
  markdownTable: string;
  /** Total row count reported after the preview */
  totalRows: number;
  status: string;
}

export interface MockScenario {
  id: string;
  /** Keyword probes matched against the user message (lowercased). */
  keywords: string[];
  reasoning: string[];
  query: MockScenarioQuery;
  report: string;
}

export function markdownTable(columns: string[], rows: Array<Array<string | null>>): string {
  const header = `| ${columns.join(" | ")} |`;
  const divider = `| ${columns.map(() => "---").join(" | ")} |`;
  const body = rows.map((r) => `| ${r.map((c) => (c === null ? "NULL" : c)).join(" | ")} |`);
  return [header, divider, ...body].join("\n");
}

const REGION_ROWS: Array<Array<string | null>> = [
  ["华东", "12,480,300", "18.2%", "892"],
  ["华南", "9,730,150", "12.4%", "645"],
  ["华北", "8,915,420", "9.7%", "701"],
  ["西南", "6,204,880", "15.1%", "388"],
  ["华中", "5,871,240", "6.3%", "412"],
  ["东北", "3,158,900", "-2.8%", "190"],
  ["西北", "2,406,110", "4.5%", "132"],
  ["海外", "1,987,650", "22.9%", "96"],
];

const TREND_ROWS: Array<Array<string | null>> = [
  ["2025-10", "3,120,400", "1,890", "24.4%"],
  ["2025-11", "3,486,900", "2,041", "26.1%"],
  ["2025-12", "4,205,300", "2,388", "27.8%"],
  ["2026-01", "3,764,200", "2,150", "25.9%"],
  ["2026-02", "3,190,850", "1,972", "24.1%"],
  ["2026-03", "4,463,720", "2,512", "28.6%"],
  ["2026-04", "4,720,060", "2,648", "29.3%"],
  ["2026-05", "5,104,430", "2,806", "30.2%"],
  ["2026-06", "5,682,140", "3,041", "31.7%"],
  ["2026-07", "5,338,760", "2,929", "30.8%"],
  ["2026-08", "6,012,380", "3,254", "33.1%"],
  ["2026-09", "6,428,910", "3,470", "34.6%"],
];

const CATEGORY_ROWS: Array<Array<string | null>> = [
  ["泵头与阀件", "18,420,600", "34.2%"],
  ["瓶盖与封盖", "14,980,300", "27.8%"],
  ["注射器组件", "8,205,450", "15.2%"],
  ["滴管与定量器", "6,431,900", "11.9%"],
  ["气雾阀系统", "4,118,720", "7.7%"],
  ["其他配件", "1,721,540", "3.2%"],
];

export const MOCK_SCENARIOS: MockScenario[] = [
  {
    id: "trend",
    keywords: ["趋势", "走势", "trend", "chart", "图表", "每月", "月度"],
    reasoning: [
      "用户想了解销售趋势，需要按月聚合最近的销售数据。",
      "先确认时间范围和度量口径：使用 fact_orders 的 order_date 按月聚合 amount，统计订单数并计算环比增长率。",
      "生成查询并执行：按月汇总最近 12 个月的销售额、订单数以及环比增长率。",
    ],
    query: {
      title: "最近 12 个月销售趋势",
      sql: `SELECT
  DATE_FORMAT(order_date, 'yyyy-MM') AS month,
  SUM(amount) AS revenue,
  COUNT(DISTINCT order_id) AS orders,
  ROUND((SUM(amount) - LAG(SUM(amount)) OVER (ORDER BY DATE_FORMAT(order_date, 'yyyy-MM')))
        / LAG(SUM(amount)) OVER (ORDER BY DATE_FORMAT(order_date, 'yyyy-MM')) * 100, 1) AS mom_growth
FROM sales_analytics.gold.fact_orders
WHERE order_date >= ADD_MONTHS(CURRENT_DATE(), -12)
GROUP BY 1
ORDER BY 1`,
      columns: ["month", "revenue", "orders", "mom_growth"],
      rows: TREND_ROWS,
      markdownTable: markdownTable(
        ["month", "revenue", "orders", "mom_growth"],
        TREND_ROWS,
      ),
      totalRows: TREND_ROWS.length,
      status: "SUCCEEDED",
    },
    report: `## 最近 12 个月销售趋势

销售额整体呈上升趋势，从 2025-10 的 **312 万** 增长到 2026-09 的 **643 万**，累计增幅约 **106%**。

**关键发现**
- 增长最快的阶段为 2026-03 至 2026-06，环比增速连续四个月超过 2%。
- 2026-07 出现小幅回落（-6.0%），随后恢复增长。
- 订单数与销售额同步增长，说明增长主要来自订单量而非单价提升。

| 指标 | 2025-10 | 2026-09 | 变化 |
| --- | --- | --- | --- |
| 销售额 | 3,120,400 | 6,428,910 | +106.0% |
| 订单数 | 1,890 | 3,470 | +83.6% |
| 环比增速 | — | 6.9% | — |

> 数据来源：sales_analytics.gold.fact_orders（最近 12 个月）`,
  },
  {
    id: "top-regions",
    keywords: ["top", "排名", "排行", "区域", "region", "最高", "表现最好"],
    reasoning: [
      "用户在询问业绩排名，需要按区域聚合销售额与增长率。",
      "选择 dim_region 关联 fact_orders，按销售额降序排列并计算同比增长率。",
      "生成并执行查询：各区域销售额排名（含增长率、订单数）。",
    ],
    query: {
      title: "各区域销售额排名",
      sql: `SELECT
  r.region_name AS region,
  SUM(f.amount) AS revenue,
  ROUND((SUM(f.amount) - SUM(f.prev_year_amount)) / SUM(f.prev_year_amount) * 100, 1) AS yoy_growth,
  COUNT(DISTINCT f.order_id) AS orders
FROM sales_analytics.gold.fact_orders f
JOIN sales_analytics.gold.dim_region r ON f.region_id = r.region_id
WHERE f.order_date >= ADD_MONTHS(CURRENT_DATE(), -12)
GROUP BY r.region_name
ORDER BY revenue DESC`,
      columns: ["region", "revenue", "yoy_growth", "orders"],
      rows: REGION_ROWS,
      markdownTable: markdownTable(
        ["region", "revenue", "yoy_growth", "orders"],
        REGION_ROWS,
      ),
      totalRows: REGION_ROWS.length,
      status: "SUCCEEDED",
    },
    report: `## 各区域销售额排名（最近 12 个月）

华东区域以 **1,248 万** 销售额位居第一，占全部区域的 24.6%。

**要点**
- 华东、华南、华北三个区域贡献了接近 60% 的销售额。
- 海外市场增速最高（+22.9%），但基数较小。
- 东北区域是唯一负增长区域（-2.8%），建议重点排查。

> 数据来源：sales_analytics.gold.fact_orders ⋈ dim_region`,
  },
  {
    id: "category-mix",
    keywords: ["分布", "占比", "类别", "品类", "category", "产品线", "画像"],
    reasoning: [
      "用户想了解产品类别构成，需要按产品线聚合销售额。",
      "关联 dim_product 维度表，按 category 分组计算销售额与占比。",
      "生成并执行查询：各类别销售额及占比分布。",
    ],
    query: {
      title: "产品类别销售分布",
      sql: `SELECT
  p.category AS category,
  SUM(f.amount) AS revenue,
  ROUND(SUM(f.amount) / SUM(SUM(f.amount)) OVER () * 100, 1) AS share
FROM sales_analytics.gold.fact_orders f
JOIN sales_analytics.gold.dim_product p ON f.product_id = p.product_id
WHERE f.order_date >= ADD_MONTHS(CURRENT_DATE(), -12)
GROUP BY p.category
ORDER BY revenue DESC`,
      columns: ["category", "revenue", "share"],
      rows: CATEGORY_ROWS,
      markdownTable: markdownTable(["category", "revenue", "share"], CATEGORY_ROWS),
      totalRows: CATEGORY_ROWS.length,
      status: "SUCCEEDED",
    },
    report: `## 产品类别销售分布（最近 12 个月）

泵头与阀件是最大的产品线，占比 **34.2%**，瓶盖与封盖紧随其后（27.8%）。

**结构特征**
- 前两大类别合计占比超过 62%，收入集中度较高。
- 注射器组件与滴管定量器构成第二梯队，合计约 27%。
- 气雾阀系统占比 7.7%，但单价较高，适合作为利润型产品线跟踪。

> 数据来源：sales_analytics.gold.fact_orders ⋈ dim_product`,
  },
];

export function pickScenario(message: string): MockScenario {
  const lower = message.toLowerCase();
  for (const scenario of MOCK_SCENARIOS) {
    if (scenario.keywords.some((k) => lower.includes(k.toLowerCase()))) {
      return scenario;
    }
  }
  return MOCK_SCENARIOS[1];
}
