# Subscription adapters: DevAgent comparison

Reviewed the uploaded `devagent (1).zip` and Boss Bot main at
`906a392e0be9bfd9b66f624564b3dc02dfc2a0b7` on November 13, 2026.
This is a source review and automated integration check, not live account validation.

## Findings

DevAgent uses `@anthropic-ai/claude-agent-sdk`'s `query()` in `src/agent.ts`,
with the Claude Code preset, a repository working directory, built-in tools,
custom connector MCP tools, partial output, session IDs and `resume`.
Its child environment inherits the app environment, so an API key can select API billing.
The setup instructions describe using the owner's Claude login otherwise.
Its configured permission mode is `bypassPermissions`.

Its `src/codex.ts` invokes the official `codex exec --json --sandbox workspace-write`
in the repository, streams JSONL, and reads an output-last-message file.
It has a 30-minute watchdog and configurable model. It inherits the process
environment and does not itself validate that the Codex login is ChatGPT rather
than API-authenticated. It does not capture/resume Codex thread IDs.
It can incorrectly accept a nonzero process exit whenever a final-message file exists.

`src/turn.ts`, `src/sessions.ts` and `src/resume.ts` add the higher-level chat
history, Claude session continuation and durable usage-limit retry records.
`src/execqueue.ts` serializes turns app-wide. Its GitLab tools clone repositories,
manage branches and verify changes before opening merge requests.
Those are application workflows, not automatic benefits of a subscription wrapper.

Boss Bot originally disabled all Claude tools and native session persistence;
Codex ran in a disposable read-only directory. HTTP execution had a three-minute
deadline. It could run text tasks but could not reproduce DevAgent's coding flow.

## What this change adds

| Capability             | Boss Bot after this change                                                 |
| ---------------------- | -------------------------------------------------------------------------- |
| Claude subscription    | Existing native login check; coding runs the unmodified CLI                |
| ChatGPT subscription   | Coding checks `codex login status` for a ChatGPT login                     |
| API billing            | Separate existing API runtime; no automatic fallback                       |
| Coding                 | Explicit local workspace, file edits and shell commands                    |
| Model                  | Optional model ID per coding task                                          |
| Progress               | Bounded assistant updates saved and polled by the existing UI              |
| Native sessions        | Captured Claude/Codex IDs; explicit Continue task creates another approval |
| Continuation ownership | Same teammate, selected runtime/account and canonical workspace            |
| Concurrency            | One coding task per canonical workspace in this server process             |
| Long tasks             | 30-minute deadline for coding; three minutes for text                      |
| Limits/failures        | Explicit failure; preserved session for manual continuation after reset    |
| Restart                | Running tasks become interrupted; saved sessions remain available          |

Claude coding permits Bash/Read/Edit/Write/Glob/Grep with `acceptEdits`, explicit
sandbox settings and `failIfUnavailable`. It keeps safe mode and external MCP
servers disabled. It does not use DevAgent's blanket permission bypass or import
its hooks/plugins. Codex uses workspace-write and refuses escalation, also on
resume. Native credentials remain in the selected CLI account directories;
API keys and OAuth-token environment variables are not forwarded.

## Remaining differences and limits

- No automatic usage-limit retry scheduler. Click Continue task after reset;
  review existing changes first. Login expiry requires signing in through the CLI.
- No Git clone/push/PR/MR automation or ClickUp/Slack orchestration. Point the
  coding task at a checkout already available locally.
- No full chat interface, tool-output timeline, usage dashboard, per-task effort,
  plugins or Claude subagent configuration.
- A workspace path and CLI sandbox are not multi-user tenant isolation. Keep
  the server local and use trusted repositories. The credential directories and
  any other readable host data still require operating-system protection.
- Claude sandbox support depends on OS and installed prerequisites. Without it,
  coding must fail rather than silently disable the sandbox. Network or shell
  permissions requiring interaction may stop a headless task.
- Selected accounts can still share provider identity or quota. Saving another
  directory does not create more allowance. Provider extra-usage settings apply.
- Tests use executable fake CLIs to exercise the real process adapters and HTTP
  persistence without spending subscription quota. No signed-in provider run was
  performed. Model availability is determined by the selected account.

## Manual live acceptance

1. Sign in with each official CLI using its dedicated account directory.
2. Create a disposable local Git checkout containing a small testable project.
3. Select the subscription runtime and workspace in New task. Request one file
   edit and a test run, approve, then independently inspect the diff and tests.
4. Click Continue task, ask about the prior change, approve, and confirm the native
   session was reused. Repeat for both providers.
5. Confirm a second simultaneous task in the same workspace is refused, and
   unsupported models, expired authentication and CLI failures are reported.

References: [Claude CLI](https://code.claude.com/docs/en/cli-reference),
[Claude credential/product rules](https://code.claude.com/docs/en/legal-and-compliance),
[Codex authentication](https://developers.openai.com/codex/auth/).

## Orca follow-up

[Orca](https://github.com/stablyai/orca) explicitly supports the user's own
Claude Code and Codex subscriptions. Its documented desktop, paired-server and
SSH workflows are closer to this subscription-first goal than OpenBot's
model-key-oriented coworker stack.

Its `src/main/claude/claude-stream-json-connection.ts` uses the Claude Agent SDK
with `pathToClaudeCodeExecutable` pointing at the user's resolved CLI, a custom
process spawner, a streaming message queue, permission callbacks and scrubbed
launch environment. `src/main/codex/app-server/codex-app-server-connection.ts`
manages a persistent Codex app-server connection with request/notification
dispatch, startup handshake and process supervision. This is deeper than a
single `exec` invocation.

Orca adds account switching, provider usage/reset views, persistent structured
chat, interactive permissions, worktrees and remote runtime management. These
are reference requirements for future Boss Bot work, not features shipped here.
Worktrees isolate code changes; they do not by themselves isolate developer
credentials, operating-system access or subscription ownership. The relevant
model is each user's own provider login, not one shared subscription for a team.

The bounded CLI adapters here provide coding and native continuation without
importing Orca's large application stack. For a full bidirectional chat and
approval experience, evaluate Codex app-server and the Claude SDK transport
rather than adding more one-off print-mode flags.

Sources: [native chat](https://orca.dev/docs/agents/native-chat),
[usage tracking](https://orca.dev/docs/agents/usage-tracking),
and the two source files above. No Orca code was copied.
