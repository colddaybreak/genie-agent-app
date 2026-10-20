**English** | [简体中文](README.zh.md)

# Genie Agent App — Databricks AppKit Template

A **Genie Agent mode** app template built on [Databricks AppKit](https://developers.databricks.com/docs/appkit/v0/): sidebar + dashboard + streaming chat timeline, ready to use as a starting point for new projects.

- **Official implementation first**: all UI components come from the official `@databricks/appkit-ui` (Sidebar suite, ECharts components, `GenieQueryVisualization`, etc.); the backend wraps the **Genie Agents API** (`POST /api/2.0/genie/agents/{agent_id}/responses`, SSE streaming) as a custom AppKit plugin following the official REST contract.
- **Explicit mock mode**: run the full app locally with no Databricks credentials (clearly labeled in the UI), so real vs. simulated is never ambiguous.
- **OBO user identity**: when deployed on Databricks Apps, all Genie calls run as the current user (`x-forwarded-access-token`).

## Features

| Area | Details |
|---|---|
| Dashboard (default page) | Unity Catalog browsing, Genie conversation stats, recent conversations, last-conversation preview |
| Chat page | SSE streaming timeline: reasoning steps and durations, tool-call details (`execute_sql` title / SQL / duration), Markdown reports (images and tables), result tables (fullscreen zoom), charts (type inferred by the official component) |
| Sidebar | Official Sidebar suite; user menu and settings at the bottom (theme: system / light / dark) |

## Tech Stack

- Backend: Node.js v22+, Express, `@databricks/appkit` 0.88 (custom plugins: `genie-agent`, `workspace`)
- Frontend: React 19, react-router 7, Vite (rolldown), Tailwind CSS 4, `@databricks/appkit-ui` 0.88
- Tooling: TypeScript 5.9, ESLint 9, Prettier 3, Vitest 4

## Quick Start

Prerequisites: Node.js v22+ and npm.

```bash
npm install

# Mock mode (default): no Databricks credentials required
cp .env.example .env
npm run dev            # http://127.0.0.1:8000
```

Connect to a real workspace (live mode): edit `.env`

```env
GENIE_AGENT_MOCK=false
DATABRICKS_CONFIG_PROFILE=DEFAULT     # or DATABRICKS_HOST=... + DATABRICKS_TOKEN=...
DATABRICKS_GENIE_AGENT_ID=<genie-agent-space-id>
```

> Locally it uses your own credentials; once deployed to Databricks Apps the platform injects the user token (OBO). See [docs/deployment.md](docs/deployment.md).

### Common Commands

| Command | Description |
|---|---|
| `npm run dev` | Development mode (server hot reload + Vite middleware) |
| `npm run build` | Build the server (`dist/`) and client (`client/dist/`) |
| `npm start` | Run the production build |
| `npm run typecheck` / `npm run lint` / `npm test` | Typecheck / ESLint / Vitest |
| `npm run format` / `npm run format:fix` | Prettier check / fix |
| `npx appkit doctor` | Diagnose Databricks auth, config, and resource reachability |

## Deploy to Databricks Apps

```bash
# 1) Edit databricks.yml: replace targets.default.workspace.host with your workspace URL
databricks auth login --host https://<your-workspace>.cloud.databricks.com

# 2) One-command deploy (validate → build → bundle deploy → start)
databricks apps deploy \
  --var="genie_space_id=<SPACE_ID>" --var="genie_space_name=<Display Name>"
```

- The app name and resources are defined in `databricks.yml` (`resources.apps.app`); Genie access is injected through the `genie-space` resource (service principal `CAN_RUN`); user authorization requests `genie` plus `catalog.catalogs:read` / `catalog.schemas:read` / `catalog.tables:read` for the dashboard's Unity Catalog routes.
- Never set `GENIE_AGENT_MOCK` in production: the local `.env` is excluded by `sync.exclude` and is never uploaded by a deployment.
- Full checklist, permission model, post-deploy verification, and rollback: see [docs/deployment.md](docs/deployment.md).

## Using as a Template

**Option 1: GitHub "Use this template"** — create a new repository, then follow Quick Start and adjust `bundle.name` / `app.name` / `workspace.host` in `databricks.yml` as needed.

**Option 2: official CLI scaffolding** (`databricks apps init --template <GitHub URL>`):

```bash
databricks apps init \
  --template https://github.com/colddaybreak/genie-agent-app \
  --name my-genie-app
```

> This repository keeps the official template files `databricks.yml.tmpl` / `.env.tmpl`; the CLI renders project name and workspace URL during scaffolding.

## Project Structure

```
client/                        # React frontend
  src/
    components/                # sidebar, settings, Markdown, timeline (reasoning / tool-call / query-result cards)
    hooks/                     # use-genie-agent-chat (SSE state machine), use-theme
    pages/                     # dashboard.tsx, chat.tsx
server/
  server.ts                    # entry point (AppKit createApp)
  mock-workspace-client.ts     # workspace client for mock mode
  plugins/
    genie-agent/               # core plugin: official REST wrapper + SSE + adapters (live / mock)
    workspace/                 # current-user identity and Unity Catalog metadata
docs/                          # feasibility, implementation plan, deployment, open questions
databricks.yml                 # DABs config (app, scope, resource binding, sync.exclude)
app.yaml                       # start command and env injection (valueFrom: genie-space)
appkit.plugins.json            # AppKit template manifest (plugins and scaffolding metadata)
manifest.yaml                  # app manifest (resource specs / user scopes)
```

## Documentation

| Document | Contents |
|---|---|
| [docs/feasibility-and-architecture.md](docs/feasibility-and-architecture.md) | Feasibility review and architecture: capability matrix, data flows, key design decisions (in Chinese) |
| [docs/implementation-plan.md](docs/implementation-plan.md) | Phased implementation plan and future extensions (in Chinese) |
| [docs/deployment.md](docs/deployment.md) | Deployment: checklist, steps, authorization and permissions, verification, rollback (in Chinese) |
| [docs/open-questions.md](docs/open-questions.md) | Open items to verify on the first real-environment run (in Chinese) |

## Environment Variables

| Variable | Description |
|---|---|
| `GENIE_AGENT_MOCK` | `true` / `1` enables mock mode (default for local dev); do not set in production |
| `DATABRICKS_GENIE_AGENT_ID` | Genie Agent (space) ID; injected at deploy time via `valueFrom: genie-space` in `app.yaml` |
| `DATABRICKS_CONFIG_PROFILE` or `DATABRICKS_HOST` + `DATABRICKS_TOKEN` | Credentials for local live mode (pick one) |
| `DATABRICKS_APP_PORT` | Server port (defaults to 8000 locally; injected by the platform when deployed) |

---

Example template, provided without an open-source license (`Unlicensed`).
