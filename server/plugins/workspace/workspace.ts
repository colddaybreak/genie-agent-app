import {
  defineManifest,
  Plugin,
  type BasePluginConfig,
  type IAppRouter,
} from "@databricks/appkit";
import type { Request, Response } from "express";
import { currentWorkspaceClient } from "../../lib/current-client.js";
import manifest from "./manifest.json";

export type WorkspacePluginConfig = BasePluginConfig;

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

/**
 * Read-only Unity Catalog + identity routes for the dashboard.
 *
 * Every route runs on behalf of the requesting user (`_asUserScoped`) so UC
 * permissions are enforced with the caller's own credentials.
 */
export class WorkspacePlugin extends Plugin<WorkspacePluginConfig> {
  static manifest = defineManifest<"workspace">(manifest);

  injectRoutes(router: IAppRouter): void {
    this.route(router, {
      name: "me",
      method: "get",
      path: "/me",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleMe(req, res);
      },
    });
    this.route(router, {
      name: "listCatalogs",
      method: "get",
      path: "/catalogs",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleListCatalogs(req, res);
      },
    });
    this.route(router, {
      name: "listSchemas",
      method: "get",
      path: "/catalogs/:catalog/schemas",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleListSchemas(req, res);
      },
    });
    this.route(router, {
      name: "listTables",
      method: "get",
      path: "/catalogs/:catalog/schemas/:schema/tables",
      handler: async (req, res) => {
        await this._asUserScoped(req)._handleListTables(req, res);
      },
    });
  }

  private async _handleMe(_req: Request, res: Response): Promise<void> {
    try {
      const me = await currentWorkspaceClient().currentUser.me();
      const user: WorkspaceUser = {
        id: me.id ?? "",
        userName: me.userName ?? "",
        displayName: me.displayName ?? undefined,
        active: me.active ?? undefined,
      };
      res.json(user);
    } catch (error) {
      this._sendError(res, error, "get current user");
    }
  }

  private async _handleListCatalogs(_req: Request, res: Response): Promise<void> {
    try {
      const catalogs: CatalogSummary[] = [];
      const client = currentWorkspaceClient().toLegacyWorkspaceClient();
      for await (const catalog of client.catalogs.list({ max_results: 0 })) {
        catalogs.push({
          name: catalog.name ?? "",
          comment: catalog.comment ?? undefined,
          owner: catalog.owner ?? undefined,
          catalogType: catalog.catalog_type ?? undefined,
        });
        if (catalogs.length >= 200) break;
      }
      res.json({ catalogs });
    } catch (error) {
      this._sendError(res, error, "list catalogs");
    }
  }

  private async _handleListSchemas(req: Request, res: Response): Promise<void> {
    try {
      const catalog = single(req.params.catalog);
      if (!isIdentifier(catalog)) {
        res.status(400).json({ error: "Invalid catalog name" });
        return;
      }
      const schemas: SchemaSummary[] = [];
      const client = currentWorkspaceClient().toLegacyWorkspaceClient();
      for await (const schema of client.schemas.list({
        catalog_name: catalog,
        max_results: 0,
      })) {
        schemas.push({
          name: schema.name ?? "",
          catalogName: schema.catalog_name ?? catalog,
          comment: schema.comment ?? undefined,
          owner: schema.owner ?? undefined,
        });
        if (schemas.length >= 500) break;
      }
      res.json({ schemas });
    } catch (error) {
      this._sendError(res, error, "list schemas");
    }
  }

  private async _handleListTables(req: Request, res: Response): Promise<void> {
    try {
      const catalog = single(req.params.catalog);
      const schema = single(req.params.schema);
      if (!isIdentifier(catalog) || !isIdentifier(schema)) {
        res.status(400).json({ error: "Invalid catalog or schema name" });
        return;
      }
      const tables: TableSummary[] = [];
      const client = currentWorkspaceClient().toLegacyWorkspaceClient();
      for await (const table of client.tables.list({
        catalog_name: catalog,
        schema_name: schema,
        omit_columns: true,
        omit_properties: true,
      })) {
        tables.push({
          name: table.name ?? "",
          catalogName: table.catalog_name ?? catalog,
          schemaName: table.schema_name ?? schema,
          tableType: table.table_type ?? undefined,
          comment: table.comment ?? undefined,
          owner: table.owner ?? undefined,
        });
        if (tables.length >= 500) break;
      }
      res.json({ tables });
    } catch (error) {
      this._sendError(res, error, "list tables");
    }
  }

  private _sendError(res: Response, error: unknown, action: string): void {
    const rawStatus =
      typeof (error as { statusCode?: unknown })?.statusCode === "number"
        ? (error as { statusCode: number }).statusCode
        : 500;
    const status = rawStatus >= 400 && rawStatus < 600 ? rawStatus : 500;
    console.error(
      `[workspace] failed to ${action}: ${error instanceof Error ? error.message : String(error)}`,
    );
    res.status(status).json({
      error: `${action} failed`,
      ...(status === 403
        ? {
            hint: "User authorization is missing the Unity Catalog read scopes. Ensure user_api_scopes includes catalog.catalogs:read, catalog.schemas:read and catalog.tables:read, then reopen the app and approve the consent prompt.",
          }
        : {}),
      ...(process.env.NODE_ENV !== "production" && error instanceof Error
        ? { detail: error.message }
        : {}),
    });
  }
}

/** Express path params may be string arrays; take the first string. */
function single(value: unknown): string {
  if (typeof value === "string") return value;
  if (Array.isArray(value) && typeof value[0] === "string") return value[0];
  return "";
}

function isIdentifier(value: string): boolean {
  return /^[A-Za-z0-9_.-]+$/.test(value);
}

export const workspace = (
  config: WorkspacePluginConfig = {},
): { plugin: typeof WorkspacePlugin; config: WorkspacePluginConfig; name: string } => ({
  plugin: WorkspacePlugin,
  config,
  name: WorkspacePlugin.manifest.name,
});
