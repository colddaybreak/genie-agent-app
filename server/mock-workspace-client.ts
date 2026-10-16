import type { WorkspaceClient } from "@databricks/appkit";

/**
 * Stub WorkspaceClient for credential-free local development
 * (GENIE_AGENT_MOCK=true). Only the surfaces AppKit boot and the in-repo
 * plugins touch are implemented:
 *
 * - `currentUser.me()` — ServiceContext boot
 * - `catalogs.list()` / `schemas.list()` / `tables.list()` — workspace plugin
 * - `config.authenticate()` / `config.host` — shape compatibility
 *
 * Never used outside mock mode; the live path always builds a real client from
 * environment credentials.
 */

interface MockCatalog {
  name: string;
  comment: string;
  owner: string;
  catalog_type?: string;
}

interface MockSchema {
  name: string;
  catalog_name: string;
  comment: string;
  owner: string;
}

interface MockTable {
  name: string;
  table_type: string;
  comment: string;
}

const OWNER = "demo@example.com";

const CATALOGS: MockCatalog[] = [
  {
    name: "sales_analytics",
    comment: "销售分析（示例数据）：订单事实表与维度表，Genie Agent 示例查询的数据来源",
    owner: OWNER,
  },
  {
    name: "main",
    comment: "默认 Catalog（示例）",
    owner: OWNER,
  },
  {
    name: "samples",
    comment: "Databricks 内置示例数据集",
    owner: "system",
  },
];

const SCHEMAS: Record<string, MockSchema[]> = {
  sales_analytics: [
    { name: "gold", catalog_name: "sales_analytics", comment: "汇总层：面向分析的宽表与事实表", owner: OWNER },
    { name: "silver", catalog_name: "sales_analytics", comment: "清洗层：标准化后的业务表", owner: OWNER },
    { name: "bronze", catalog_name: "sales_analytics", comment: "原始层：贴源抽取数据", owner: OWNER },
  ],
  main: [
    { name: "default", catalog_name: "main", comment: "默认 Schema", owner: OWNER },
  ],
  samples: [
    { name: "tpch", catalog_name: "samples", comment: "TPC-H 基准数据集", owner: "system" },
    { name: "nyctaxi", catalog_name: "samples", comment: "纽约出租车行程数据集", owner: "system" },
  ],
};

const TABLES: Record<string, MockTable[]> = {
  "sales_analytics.gold": [
    { name: "fact_orders", table_type: "MANAGED", comment: "订单事实表：金额、区域、产品、下单时间" },
    { name: "fact_order_items", table_type: "MANAGED", comment: "订单明细事实表：行项目粒度" },
    { name: "dim_region", table_type: "MANAGED", comment: "区域维度表" },
    { name: "dim_product", table_type: "MANAGED", comment: "产品维度表：产品线与类别" },
    { name: "dim_customer", table_type: "MANAGED", comment: "客户维度表" },
    { name: "dim_date", table_type: "MANAGED", comment: "日期维度表" },
    { name: "agg_daily_revenue", table_type: "MATERIALIZED_VIEW", comment: "按日营收汇总视图" },
  ],
  "sales_analytics.silver": [
    { name: "orders_cleaned", table_type: "MANAGED", comment: "清洗后的订单表" },
    { name: "order_items_cleaned", table_type: "MANAGED", comment: "清洗后的订单明细表" },
    { name: "products_normalized", table_type: "MANAGED", comment: "标准化产品主数据" },
  ],
  "sales_analytics.bronze": [
    { name: "raw_orders", table_type: "MANAGED", comment: "ERP 订单原始抽取表" },
    { name: "raw_order_items", table_type: "MANAGED", comment: "ERP 订单明细原始抽取表" },
  ],
  "main.default": [
    { name: "customers", table_type: "MANAGED", comment: "客户表（示例）" },
    { name: "orders", table_type: "MANAGED", comment: "订单表（示例）" },
    { name: "products", table_type: "MANAGED", comment: "产品表（示例）" },
  ],
  "samples.tpch": [
    { name: "lineitem", table_type: "MANAGED", comment: "TPC-H lineitem" },
    { name: "orders", table_type: "MANAGED", comment: "TPC-H orders" },
    { name: "customer", table_type: "MANAGED", comment: "TPC-H customer" },
  ],
  "samples.nyctaxi": [
    { name: "trips", table_type: "MANAGED", comment: "出租车行程明细" },
  ],
};

function materialize<T>(rows: T[]): AsyncIterable<T> {
  return {
    [Symbol.asyncIterator]() {
      const iterator = rows[Symbol.iterator]();
      return {
        next: () => Promise.resolve(iterator.next()),
      };
    },
  };
}

export function createMockWorkspaceClient(): WorkspaceClient {
  const stub = {
    config: {
      host: "https://mock-workspace.invalid",
      authenticate: (_headers: Headers) => Promise.resolve(),
    },
    apiClient: {
      request: () => {
        throw new Error(
          "Mock workspace client: apiClient.request is not implemented. Set DATABRICKS_WORKSPACE_ID to avoid workspace-id lookups, or disable GENIE_AGENT_MOCK.",
        );
      },
    },
    currentUser: {
      me: () =>
        Promise.resolve({
          id: "1000000000000001",
          userName: OWNER,
          displayName: "Demo User (mock)",
          active: true,
        }),
    },
    catalogs: {
      list: (_request?: unknown) => materialize(CATALOGS),
    },
    schemas: {
      list: (request: { catalog_name?: string }) =>
        materialize(SCHEMAS[request?.catalog_name ?? ""] ?? []),
    },
    tables: {
      list: (request: { catalog_name?: string; schema_name?: string }) => {
        const key = `${request?.catalog_name ?? ""}.${request?.schema_name ?? ""}`;
        const rows = (TABLES[key] ?? []).map((t) => ({
          ...t,
          catalog_name: request?.catalog_name,
          schema_name: request?.schema_name,
          owner: OWNER,
        }));
        return materialize(rows);
      },
    },
  };
  const facade = { ...stub, toLegacyWorkspaceClient: () => stub };
  return facade as unknown as WorkspaceClient;
}
