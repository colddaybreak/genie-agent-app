import { getCallerContext, ServiceContext, type WorkspaceClient } from "@databricks/appkit";

/**
 * Workspace client for the current execution scope: the caller's own
 * (on-behalf-of-user) client inside a user-scoped request, otherwise the app
 * service client.
 *
 * AppKit's built-in plugins read this from an internal context module. The
 * package root exports a same-named factory that belongs to the Lakebase
 * connector instead, so this helper rebuilds the lookup from the public
 * context APIs (`getCallerContext` / `ServiceContext`).
 */
export function currentWorkspaceClient(): WorkspaceClient {
  return (getCallerContext() ?? ServiceContext.get()).client;
}
