import type {
  ConversationItemsPage,
  GenieAgentItem,
  GenieConversationListPage,
} from './genie-types';
import { getPluginClientConfig } from '@databricks/appkit-ui/js';

export class ApiError extends Error {
  readonly status: number;
  readonly code?: string;

  constructor(message: string, status: number, code?: string) {
    super(message);
    this.name = 'ApiError';
    this.status = status;
    this.code = code;
  }
}

async function apiFetch<T>(path: string, init?: RequestInit): Promise<T> {
  const response = await fetch(path, init);
  if (!response.ok) {
    let detail = `${response.status} ${response.statusText}`;
    let code: string | undefined;
    try {
      const body = (await response.json()) as { error?: string; detail?: string; code?: string };
      if (typeof body.error === 'string') {
        detail = body.detail ? `${body.error}: ${body.detail}` : body.error;
      }
      code = body.code;
    } catch {
      // Non-JSON error body — keep the HTTP status text.
    }
    throw new ApiError(detail, response.status, code);
  }
  return (await response.json()) as T;
}

/* ------------------------------------------------------------------ */
/* workspace plugin — /api/workspace/*                                 */
/* ------------------------------------------------------------------ */

export interface WorkspaceUser {
  id: string;
  userName: string;
  displayName?: string;
  active?: boolean;
}

export interface CatalogSummary {
  name: string;
  comment?: string;
  owner?: string;
  catalogType?: string;
}

export interface SchemaSummary {
  name: string;
  catalogName: string;
  comment?: string;
  owner?: string;
}

export interface TableSummary {
  name: string;
  catalogName: string;
  schemaName: string;
  tableType?: string;
  comment?: string;
  owner?: string;
}

export const workspaceApi = {
  me: () => apiFetch<WorkspaceUser>('/api/workspace/me'),
  listCatalogs: () =>
    apiFetch<{ catalogs: CatalogSummary[] }>('/api/workspace/catalogs').then((r) => r.catalogs),
  listSchemas: (catalog: string) =>
    apiFetch<{ schemas: SchemaSummary[] }>(
      `/api/workspace/catalogs/${encodeURIComponent(catalog)}/schemas`,
    ).then((r) => r.schemas),
  listTables: (catalog: string, schema: string) =>
    apiFetch<{ tables: TableSummary[] }>(
      `/api/workspace/catalogs/${encodeURIComponent(catalog)}/schemas/${encodeURIComponent(schema)}/tables`,
    ).then((r) => r.tables),
};

/* ------------------------------------------------------------------ */
/* genie-agent plugin — /api/genie-agent/{alias}/*                     */
/* ------------------------------------------------------------------ */

export const genieAgentApi = {
  responsesUrl: (alias: string) => `/api/genie-agent/${encodeURIComponent(alias)}/responses`,
  listConversations: (alias: string, opts: { pageSize?: number; pageToken?: string } = {}) => {
    const params = new URLSearchParams();
    if (opts.pageSize != null) params.set('pageSize', String(opts.pageSize));
    if (opts.pageToken) params.set('pageToken', opts.pageToken);
    const query = params.toString();
    return apiFetch<GenieConversationListPage>(
      `/api/genie-agent/${encodeURIComponent(alias)}/conversations${query ? `?${query}` : ''}`,
    );
  },
  getConversationItems: (
    alias: string,
    conversationId: string,
    opts: { limit?: number; after?: string; order?: 'asc' | 'desc' } = {},
  ) => {
    const params = new URLSearchParams();
    if (opts.limit != null) params.set('limit', String(opts.limit));
    if (opts.after) params.set('after', opts.after);
    if (opts.order) params.set('order', opts.order);
    const query = params.toString();
    return apiFetch<ConversationItemsPage>(
      `/api/genie-agent/${encodeURIComponent(alias)}/conversations/${encodeURIComponent(conversationId)}/items${query ? `?${query}` : ''}`,
    );
  },
  /** Fetches every item of a conversation, following `has_more` pages. */
  getAllConversationItems: async (alias: string, conversationId: string) => {
    const items: GenieAgentItem[] = [];
    let after: string | undefined;
    for (let page = 0; page < 10; page++) {
      const result: ConversationItemsPage = await genieAgentApi.getConversationItems(alias, conversationId, {
        limit: 100,
        after,
        order: 'asc',
      });
      items.push(...result.data);
      if (!result.has_more || !result.last_id) break;
      after = result.last_id;
    }
    return items;
  },
  cancelResponse: (alias: string, conversationId: string, responseId: string) =>
    apiFetch<{ response_id: string; status: string }>(
      `/api/genie-agent/${encodeURIComponent(alias)}/conversations/${encodeURIComponent(conversationId)}/responses/${encodeURIComponent(responseId)}/cancel`,
      { method: 'POST' },
    ),
};

/** Client-exposed config of the genieAgent plugin (see plugin.clientConfig()). */
export interface GenieAgentClientConfig {
  mock?: boolean;
  aliases?: string[];
  defaultAlias?: string | null;
}

export function genieAgentConfig(): GenieAgentClientConfig {
  return getPluginClientConfig<GenieAgentClientConfig>('genieAgent');
}

export function defaultAlias(): string {
  return genieAgentConfig().defaultAlias ?? 'default';
}

/** Notifies listeners (e.g. the sidebar) that conversations changed. */
export const CONVERSATIONS_UPDATED_EVENT = 'genie-agent:conversations-updated';

export function notifyConversationsUpdated(): void {
  window.dispatchEvent(new CustomEvent(CONVERSATIONS_UPDATED_EVENT));
}
