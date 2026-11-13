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
- **Claude Code subscription:** save a dedicated native login directory; approved tasks run automatically through the installed CLI. See setup below.
- **Claude API:** save a Claude Console API key and an available model ID. This explicitly uses API credits; it is not a Claude subscription connection.

Git connections currently provide a paginated, read-only repository browser with links to your projects. They do not yet give bots code access, clone repositories, create pull requests or connect self-hosted GitLab/GitHub Enterprise. Tokens are sent only to the fixed provider API host, and redirects are refused.

**Disconnect** removes the saved credential from Boss Bot and prevents pending tasks from using it. It does not revoke the token at the provider or stop an already-running task. Revoke provider tokens through their account settings when needed. Saving a replacement creates a new connection; pending tasks never switch to it silently.

## Subscription support

| Connection                         | Current position                                                                                                                                                 |
| ---------------------------------- | ---------------------------------------------------------------------------------------------------------------------------------------------------------------- |
| ChatGPT / Codex subscription       | Local CLI adapter implemented. Uses your own dedicated Codex login. No API key required.                                                                         |
| Claude subscription                | Local Claude Code adapter implemented: approved tasks run automatically with a checked subscription login. Live validation requires a signed-in account.         |
| Multiple accounts for one provider | Implemented for this local owner: multiple labeled Codex directories, Claude API keys, GitHub and GitLab tokens. Team ownership and quota reporting are planned. |
| Gemini subscription                | Not implemented. Eligible Gemini CLI account use needs a separate integration review.                                                                            |
| API credentials                    | Optional text-only adapters. Explicit selection required; automatic fallback is disabled.                                                                        |

Both local CLI adapters execute approved text tasks and opt-in coding tasks in an existing local workspace. Coding tasks save native session IDs and support an explicit continuation. Shared chat and full team isolation remain unfinished.

References: [Codex authentication](https://developers.openai.com/codex/auth/), [Claude credential rules](https://code.claude.com/docs/en/legal-and-compliance), [Claude Remote Control](https://code.claude.com/docs/en/remote-control), [Gemini CLI authentication](https://geminicli.com/docs/get-started/authentication/).

## Run tasks with your Claude subscription

Install the official Claude Code CLI, create a dedicated account directory, and sign in through Claude's own flow:

```sh
mkdir -p "$PWD/data/claude-home"
CLAUDE_CONFIG_DIR="$PWD/data/claude-home" claude auth login
```

In **Connections → Add account → Claude Code subscription**, enter that absolute directory path and a label. Select the saved account in **New task**, then approve. Boss Bot invokes the installed CLI and saves the answer automatically. You do not need to copy prompts or results.

Alternatively set `BOSS_CLAUDE_HOME`, `BOSS_CLAUDE_BIN` (an absolute binary path if needed), and optionally `BOSS_CLAUDE_MODEL` in `.env`. Restart after changing environment settings. The CLI must support `auth status --json`, `--safe-mode`, `--setting-sources`, `--tools`, and `--no-session-persistence`.

This is an experimental local-owner integration. Before each task, the adapter requires the CLI to report a logged-in `claude.ai` account and a recognized subscription type. API/cloud credentials are not forwarded; invalid or unknown authentication fails instead of falling back. Credentials stay managed by Claude Code. Multiple saved directories are supported; their actual identity and allowance are determined by the CLI and may share an account, depending on platform credential storage. Subscription extra usage and spending controls remain governed by your account settings.

Text tasks keep tools and customizations disabled and start fresh sessions. Coding tasks explicitly enable local file and shell tools as described below. Provider terms still apply; this implementation is not a claim of provider endorsement. Live execution must be verified after you sign in. Existing manual-handoff tasks remain readable and completable.

## Coding with subscription accounts

In **New task**, select a Claude Code or Codex subscription runtime and enter an
absolute **Local coding workspace** pointing to an existing trusted checkout.
Optionally choose a model available to that account. Review the workspace path
and approve. Leaving the path blank keeps the existing text-only behavior.

Coding enables file edits and shell commands, saves assistant progress and runs
for up to 30 minutes. Codex uses `workspace-write` with escalation refused;
Claude uses `acceptEdits` with its command sandbox enabled and fails if that
sandbox is unavailable. CLI customizations and external MCP servers remain
disabled. These controls do not provide team isolation. Keep the app local.

After a coding task finishes or fails with a saved native session, click
**Continue task**, enter the next instruction and approve again. Continuation
requires the same teammate, account and workspace. Usage limits fail visibly;
continue after reset rather than switching accounts or API billing automatically.
Interrupted work is never automatically replayed after restart. One coding task
per workspace can run in this server process.

Both adapters retain their native sessions in their dedicated CLI directories.
Back up those directories with the workspace database. API keys and OAuth-token
environment variables are not forwarded to subscription coding processes.
The Codex coding path checks for a ChatGPT login before execution. A directory
or a configured badge alone does not prove a valid login or available allowance.

See the [DevAgent and Orca adapter review](docs/devagent-adapter-review.md) for
the source comparison, remaining gaps and live acceptance steps.

## What you can do today

- Create named teammates with their own role and instructions.
- Save owner-curated memory independently of the chosen runtime.
- Create text tasks and approve or decline them before execution.
- Read persisted results, failures and task history.
- Keep execution auditable with one-time approvals and stored lifecycle events.
- Restart without automatically replaying interrupted work.
- Save multiple labeled Codex and Claude API accounts and choose one per task.
- Verify GitHub/GitLab accounts and browse accessible repository links.

Text tasks start fresh native sessions, include the agent's instructions and memory, and have a three-minute deadline. Coding tasks preserve native sessions and have a 30-minute deadline. The API adapters are text-only and do not provide a tool loop.

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

Text-only Codex runs read-only; coding uses workspace-write and refuses escalation. Local readable files may still be accessible. Use a trusted host and a dedicated login directory. Approval covers the task, not each internal CLI action. Isolated computers and exact action approvals are future work.

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
