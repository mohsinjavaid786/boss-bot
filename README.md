# Boss Bot

A self-hosted workspace for persistent AI teammates: give them a role, keep their context, assign work, and review the result.

**The goal is subscription-first:** use your existing ChatGPT/Codex allowance, support multiple user-owned accounts, and work with bots through a shared chat experience. API credits are optional and must never be a silent fallback.

**Current release: foundation preview.** The app runs in your browser and supports one local owner. It has agent setup, memory, tasks, approvals and saved account connections. Persistent chat and a desktop app are not shipped yet.

## Start with your ChatGPT subscription

You need Node.js 22.22+ or Node 24 LTS, npm, and the official Codex CLI installed. No API key is required for this path.

```sh
git clone https://github.com/mohsinjavaid786/boss-bot.git
cd boss-bot
npm ci
cp .env.example .env

# Sign in directly with Codex using a dedicated credential directory.
mkdir -p "$PWD/data/codex-home"
CODEX_HOME="$PWD/data/codex-home" codex login
```

Set the following in `.env`, using the absolute path of the directory you just created:

```dotenv
BOSS_CODEX_HOME=/absolute/path/to/boss-bot/data/codex-home
BOSS_CODEX_BIN=codex
```

Use an absolute path for `BOSS_CODEX_BIN` if `codex` is not on your server's PATH. Then start the app:

```sh
npm run build
npm start
```

Open **http://127.0.0.1:4310**. Choose **New task**, select a teammate and Codex, describe the work, then approve it. Results appear in the task details. The Codex account's plan allowance applies; connecting it does not add quota.

You can explore the workspace without connecting a runtime. A configured badge means settings are present; the first approved task verifies access. No provider credentials ship with the project, and live provider calls have not been verified by the automated tests.

## Connect accounts in the app

Open **Connections → Add account**. Give each account a recognizable label. You can add multiple accounts from the same provider without replacing the others.

- **Codex subscription:** sign in through the official CLI with a dedicated `CODEX_HOME` for each account, then save its absolute directory path. Select the labeled account in New task. No API key is needed. The directory must exist on the server; saving does not validate the login or add allowance. Two records pointing at the same login share the same quota.
- **GitHub:** save a fine-grained personal access token limited to the repositories you want. Read-only metadata is sufficient for listing. Select **Verify account**, then **Repositories**. Organization approval may be required.
- **GitLab.com:** save a personal access token with `read_api`, verify it, then browse projects where you are a member.
- **Claude API:** save a Claude Console API key and an available model ID. This explicitly uses API credits; it is not a Claude subscription connection.

Git connections currently provide a paginated, read-only repository browser with links to your projects. They do not yet give bots code access, clone repositories, create pull requests or connect self-hosted GitLab/GitHub Enterprise. Tokens are sent only to the fixed provider API host, and redirects are refused.

**Disconnect** removes the saved credential from Boss Bot and prevents pending tasks from using it. It does not revoke the token at the provider or stop an already-running task. Revoke provider tokens through their account settings when needed. Saving a replacement creates a new connection; pending tasks never switch to it silently.

## Subscription support

| Connection                         | Current position                                                                                                                                                                                                                          |
| ---------------------------------- | ----------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT / Codex subscription       | Local CLI adapter implemented. Uses your own dedicated Codex login. No API key required.                                                                                                                                                  |
| Claude subscription                | Not integrated into Boss Bot. Claude Code and Anthropic's own Remote Control support subscription use, but Anthropic currently prohibits third-party apps from offering Claude.ai login or routing through user subscription credentials. |
| Multiple accounts for one provider | Implemented for this local owner: multiple labeled Codex directories, Claude API keys, GitHub and GitLab tokens. Team ownership and quota reporting are planned.                                                                          |
| Gemini subscription                | Not implemented. Eligible Gemini CLI account use needs a separate integration review.                                                                                                                                                     |
| API credentials                    | Optional text-only adapters. Explicit selection required; automatic fallback is disabled.                                                                                                                                                 |

The full goal of using **both Claude and ChatGPT subscriptions inside one Boss Bot chat experience is not yet met**. Native Claude use is an available separate workflow, not a substitute we describe as a completed integration. Any unified Claude subscription connection needs an officially permitted path.

References: [Codex authentication](https://developers.openai.com/codex/auth/), [Claude credential rules](https://code.claude.com/docs/en/legal-and-compliance), [Claude Remote Control](https://code.claude.com/docs/en/remote-control), [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/).

## What you can do today

- Create named teammates with their own role and instructions.
- Save owner-curated memory independently of the chosen runtime.
- Create text tasks and approve or decline them before execution.
- Read persisted results, failures and task history.
- Keep execution auditable with one-time approvals and stored lifecycle events.
- Restart without automatically replaying interrupted work.
- Save multiple labeled Codex and Claude API accounts and choose one per task.
- Verify GitHub/GitLab accounts and browse accessible repository links.

The Codex adapter starts a fresh native session for each task and supplies the agent's instructions and memory. It does not yet resume native conversations. Execution has a three-minute deadline. The API adapters are text-only and do not provide a tool loop.

## Chat and desktop

The current app is a **browser-based task and configuration workspace**, not a Slack-style chat client. There is no Boss Bot desktop download yet.

The next user experience is a conversation workspace:

- A bot and project roster in the sidebar.
- Persistent conversations with progress, approvals and results inline.
- Files, memory, routines and a computer preview alongside the conversation.
- Account and team administration outside the daily chat flow.
- A desktop client for the same workspace after the chat and account flows are working.

A desktop window alone will not complete these features. See the [chat and desktop requirements](docs/chat-and-desktop.md).

## Optional API setup

Claude API keys can be added in Connections without restarting. For environment-based adapters, set a key and a model available to that key, then restart:

| Provider  | Environment variables                  |
| --------- | -------------------------------------- |
| OpenAI    | `OPENAI_API_KEY`, `OPENAI_MODEL`       |
| Anthropic | `ANTHROPIC_API_KEY`, `ANTHROPIC_MODEL` |
| Gemini    | `GEMINI_API_KEY`, `GEMINI_MODEL`       |

Keys stay on the server. API adapters request at most 4,096 output tokens. Leaving them unset keeps them unavailable. A failed Codex task will not switch to an API automatically.

## Local storage and access

Workspace state lives in `data/boss-bot.db`. Stop the server before backing up `data/`; copying only the database file while SQLite is running can miss recent writes. Keep this directory and `.env` private.

Saved connections use AES-256-GCM encryption in `data/connections.db`, with an owner-readable key in `data/connections.key`. Back up both together. Losing the key makes saved credentials unreadable; the app refuses to replace a missing key for an existing vault. This protects a database-only copy, not a compromised host or a backup containing both files. Native Codex credentials remain in their own CLI directory. Account labels and verification metadata are stored in plaintext.

The preview binds to loopback and has **one trusted local owner**. It does not have team login or tenant isolation. Keep it local until those features are implemented. Stored memory and results are not encrypted at rest.

Codex runs with a read-only sandbox and refuses escalation, but local readable files may still be accessible. Use a trusted host and a dedicated login directory. Approval covers the task, not each internal CLI action. Isolated computers and exact action approvals are future work.

The installed Codex CLI must support `exec --ignore-user-config --ignore-rules --ephemeral --sandbox read-only`; verify with `codex exec --help`. Node 22 may print an experimental SQLite warning.

## Development

```sh
npm run dev           # Web UI: http://127.0.0.1:5173
npm test             # Routing, persistence and HTTP workflow tests
npm run check        # TypeScript checks
npm run format:check
npm run build
```

```text
apps/web/       Browser workspace
apps/server/    Local HTTP service, runtime adapters and SQLite storage
packages/core/  Domain types and runtime routing contract
tests/          Automated checks
docs/           Architecture and implementation requirements
```

## Next milestones

1. Extend the saved-account foundation with per-agent grants and repository tools.
2. Add persistent chat, guided official Codex sign-in, account health and usage reporting.
3. Add team access controls, isolated tools, integrations, routines and bounded delegation.
4. Package the working conversation experience as a desktop client.
5. Add authorized fallback and local models without making API billing the default.

Track the [multi-account requirements](docs/multi-account-requirements.md) and [architecture](docs/architecture.md). The repository records shipped features separately from planned work.
