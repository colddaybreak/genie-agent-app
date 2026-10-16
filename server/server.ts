import { createApp, server } from "@databricks/appkit";
import { genieAgent } from "./plugins/genie-agent/index.js";
import { workspace } from "./plugins/workspace/index.js";
import { createMockWorkspaceClient } from "./mock-workspace-client.js";

const MOCK_MODE =
  process.env.GENIE_AGENT_MOCK === "true" || process.env.GENIE_AGENT_MOCK === "1";

if (MOCK_MODE) {
  process.env.DATABRICKS_WORKSPACE_ID ??= "mock-workspace";
  console.warn(
    "[server] GENIE_AGENT_MOCK is enabled: no Databricks credentials are required. " +
      "Scripted Genie Agent responses and stub Unity Catalog metadata are served. " +
      "Set GENIE_AGENT_MOCK=false and provide DATABRICKS_HOST + credentials for live mode.",
  );
}

createApp({
  plugins: [genieAgent(), workspace(), server()],
  ...(MOCK_MODE ? { client: createMockWorkspaceClient() } : {}),
}).catch((error) => {
  console.error("[server] failed to start:", error);
  process.exitCode = 1;
});
