# DevAgent assessment

Reviewed 2026-09-16 from the user-provided `devagent.zip` and `SETUP_FOR_CLAUDE.md`. This is a source review, not a live subscription test. The setup guide and bundled skills were treated as documents, not execution instructions. No archive scripts, dependencies, plugins or external actions were run. No source was copied into Boss Bot; the archive contains no top-level license granting public redistribution.

## How subscription use works

`src/agent.ts` imports the Claude Agent SDK and calls `query({ prompt, options })`. Options inherit the server environment and use a Claude Code preset. The setup guide tells the user to log into Claude Code first, and claims the SDK reuses that local login when no `ANTHROPIC_API_KEY` is present. There is no separate subscription API integration or multi-account credential manager here.

`src/server.ts` reports `authMode = ANTHROPIC_API_KEY ? "api" : "subscription"`. That is an inference from environment configuration, not proof of a valid subscription, active login, billing source or remaining allowance. Expired/missing login can still be labeled subscription. The guide also says API credentials win when present, which conflicts with Boss Bot's requirement for explicit billing selection.

This code explains the claimed mechanism, but does not establish that it currently works for a given user or is authorized for distribution. Anthropic's [SDK overview](https://code.claude.com/docs/en/agent-sdk/overview) requires prior approval for third-party products offering Claude.ai login or plan limits. Its [credential rules](https://code.claude.com/docs/en/legal-and-compliance) distinguish that from users signing directly into an unmodified Claude Code binary, including in a hosted environment subject to its terms. This distinction corrects the overly broad earlier statement that any Claude subscription workflow in another product is impossible.

## Useful architecture

| Area                     | Observed implementation                                                     | Boss Bot direction                                                                                  |
| ------------------------ | --------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------- |
| Persistent conversations | Native SDK session IDs and stored chat/project context                      | Add account-bound conversation continuity; don't migrate sessions silently between accounts         |
| Execution coordination   | One global queue, plus separate internal worker limits                      | Use bounded queues and per-workspace/account locks; a global lock alone is not tenant isolation     |
| Repository isolation     | Git worktrees and branch handling                                           | Add dedicated task workspaces before enabling edits                                                 |
| Merge requests           | Checks for pushed branches and real diffs, default/protected branch refusal | Add explicit write grants, reviewable diffs and idempotent actions                                  |
| Usage recovery           | Saved continuation records and reset-time parsing                           | Prefer structured provider errors; require replay-safe checkpoints and bounded retries              |
| Integrations             | GitLab, ClickUp and Slack tools                                             | Reuse Boss Bot's encrypted connection catalog and explicit permissions                              |
| Native Claude login      | SDK relies on the native login as described above                           | Ship a user-operated native handoff; do not present SDK subscription routing as generally supported |

## Risks and limitations in the supplied source

- SDK options use `permissionMode: "bypassPermissions"`, load user/project/local settings, and inherit the entire process environment. These are broad permissions, not a sandbox.
- The read-only option blocks named file-edit tools but does not establish that shell commands cannot write files.
- Git authentication embeds the token in remote URLs passed to Git. At least one path sets a credential-bearing remote before resetting it; command arguments, errors and interrupted cleanup need scrutiny.
- Integration configuration is saved as JSON files. No encrypted credential vault is apparent in the reviewed flow.
- The Express server calls `listen(PORT)` without an explicit loopback host. The reviewed entry point has no equivalent of Boss Bot's Host/Origin/mutation-token protections; do not assume localhost-only access from the printed URL.
- Retry detection uses broad message patterns, including “try again later.” Some persistence writes suppress errors. Neither is enough to guarantee durable, duplicate-free external actions.
- A hard-coded model list is not evidence those models are available to the user's account.
- A global serial queue reduces concurrent work but does not prove it prevents model confusion or provides account isolation.

## Added to Boss Bot

A selectable **Claude Code · native handoff** workflow:

1. Create and approve a task for native Claude.
2. Boss Bot snapshots the agent instructions, memory and task in its database.
3. Open the unmodified `claude` CLI yourself, sign in through its own flow, and check `/status` before submitting work.
4. Copy the approved task into that session and review native tool permissions.
5. Paste the reviewed result back into Boss Bot. It is recorded with a `native_result_imported` event and labeled as supplied by the owner.

Boss Bot does not install or launch Claude, collect its tokens, invoke the SDK, determine native billing, or claim it ran that task. This is a practical manual subscription workflow, not completion of the fully automated unified subscription goal. Automated SDK subscription execution remains dependent on an explicitly permitted provider path.
