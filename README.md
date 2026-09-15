# Boss Bot

A local-first, open-source workspace for directing persistent AI teammates.

**Foundation preview:** a working single-owner app, not yet a production multi-user workforce platform. Create agents, save their memory, assign text tasks to an explicitly selected runtime, approve execution, and review durable results.

## Run locally

Requirements: Node.js **22.22+** (or Node 24 LTS) and npm. SQLite is bundled with Node; Node 22 prints an experimental SQLite warning.

```sh
git clone https://github.com/mohsinjavaid786/boss-bot.git
cd boss-bot
npm ci
cp .env.example .env
# Configure a runtime in .env, or explore the workspace without one.
npm run build
npm start
```

Open **http://127.0.0.1:4310**. For development, `npm run dev` serves the UI at **http://127.0.0.1:5173**. Both services bind to loopback.

## What works

- Responsive team workspace, task list, approval inbox, runtime status, agent details and memory editor.
- Persistent agent identities, owner-curated memory, tasks, outputs and audit events in SQLite.
- Provider-neutral `AgentRuntime` interface with owner and capability checks.
- Opt-in local Codex execution and text-only OpenAI, Anthropic and Gemini API adapters.
- Explicit runtime selection: no silent API charges, subscription switching or fallback.
- Atomic one-time task approval and rejection. Work interrupted by a restart is marked interrupted, never automatically replayed.
- Three-minute execution deadline, input validation, request-size limits, mutation tokens and origin/host checks.

Connection badges indicate configuration presence, **not verified authentication**. Live provider calls require your own credentials and are not part of the automated test suite. No credentials ship with the project.

## Connect a runtime

### Codex / ChatGPT subscription

Use a **dedicated Codex home directory**, separate from your everyday Codex settings. Authenticate directly with the official CLI, using your own account:

```sh
mkdir -p "$PWD/data/codex-home"
CODEX_HOME="$PWD/data/codex-home" codex login
```

Set `BOSS_CODEX_HOME` in `.env` to that directory's absolute path. If needed, set `BOSS_CODEX_BIN` to the absolute path of your Codex executable. The installed CLI must support `exec --ignore-user-config --ignore-rules --ephemeral --sandbox read-only`; check `codex exec --help`. These switches were verified against the local CLI during development.

The adapter starts an ephemeral CLI execution per task, rehydrating the agent's instructions and curated memory. It does **not** resume native Codex threads. Credentials stay in the dedicated CLI directory. Execution uses a read-only sandbox and refuses escalation. This is **not OS-level isolation**: local readable files may still be accessible. Enable this adapter only on a trusted, single-owner host. Other integrated tools and user configuration are not imported.

Official references: [Codex authentication](https://developers.openai.com/codex/auth/), [app-server integration](https://developers.openai.com/codex/app-server/). App-server login, native thread continuity and allowance telemetry belong to the next milestone.

### API providers

Set both the key and an accessible model identifier:

| Provider  | Key                 | Model             |
| --------- | ------------------- | ----------------- |
| OpenAI    | `OPENAI_API_KEY`    | `OPENAI_MODEL`    |
| Anthropic | `ANTHROPIC_API_KEY` | `ANTHROPIC_MODEL` |
| Gemini    | `GEMINI_API_KEY`    | `GEMINI_MODEL`    |

Restart the server after changing configuration. API requests are text-only, capped at 4,096 output tokens, and use the providers' fixed HTTPS endpoints. No API tool loop, automatic retries or fallback is implemented.

Anthropic prohibits third-party applications from routing users' requests through Claude subscription credentials. Boss Bot therefore uses its API path. See [Anthropic authentication and credential rules](https://code.claude.com/docs/en/legal-and-compliance).

Gemini CLI supports Google account sign-in, including eligible subscriptions, but this milestone implements the Gemini **API** only. A CLI connector requires a separate implementation and integration-terms review. See [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/).

## Storage and security boundary

`data/boss-bot.db` stores local workspace state. Keep the entire `data/` directory private; stop the process before taking a filesystem backup. SQLite uses WAL, so copying only the database file while it is running may omit recent writes.

This version has **one local owner**. Mutation tokens and browser origin checks mitigate cross-site requests; they are not a login system. Any trusted local process can access the app. Do not expose it publicly, proxy it to a shared network, or deploy it as a team server before user authentication, tenant isolation and credential brokering are implemented. Memory and outputs are not encrypted at rest.

Approval authorizes a whole text task, not individual runtime tool calls. Browser/computer actions and integration side effects must wait for the isolated worker and per-action policy milestone. The router prevents selecting another owner in its contract, but multi-user ownership is not exposed by the app yet.

## Repository structure

```text
apps/web/           React workspace and design system styles
apps/server/        HTTP service, runtime adapters and SQLite store
packages/core/      Shared domain types and runtime routing contract
tests/              Persistence, routing and HTTP workflow tests
docs/               Architecture and milestone plan
```

```sh
npm test
npm run check
npm run format:check
npm run build
```

## Roadmap

1. **Current:** persistent local workspace, manual approvals and explicit text runtimes.
2. Team authentication and membership; per-owner secret storage; Codex app-server login, native sessions and real quota telemetry; eligible Gemini CLI connection.
3. Isolated computer/browser workers, profile lifecycle, capability-based permissions and exact action approvals; MCP integration broker.
4. Durable routines with timezone handling and missed-run policy; bounded delegation with budgets and cancellation; checkpoint-based recovery.
5. Authorized fallback across compatible runtimes, spend limits, usage reporting and local models.

Routing does not pool personal subscriptions across teammates or bypass provider limits. Each future credential connection must remain scoped to its authorized owner.

## License and inspiration

Boss Bot's original code is MIT licensed. [Rakazo](https://github.com/elie222/rakazo) inspired the persistent-agent product direction. No Rakazo source code or assets were copied. See [THIRD_PARTY_NOTICES.md](THIRD_PARTY_NOTICES.md); any future source reuse must preserve its applicable license and notices.
