# Subscription adapter guide

Boss Bot runs approved tasks through your own installed coding CLIs. This guide
covers the shipped local-owner workflow and how to verify it on your host.

## Available capabilities

| Capability             | Boss Bot                                                                   |
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
servers disabled. Custom hooks and plugins remain disabled. Codex uses workspace-write and refuses escalation, also on
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
