# Build or reuse: Boss Bot alternatives review

Reviewed September 15, 2026. This is a source/documentation assessment, not a production certification or live-provider benchmark.

## Recommendation

**Adopt an existing orchestration foundation before expanding Boss Bot's custom backend. Paperclip is the first candidate.** Keep Boss Bot as the product identity and experience; first determine how far Paperclip's existing UI, APIs and extensions can take us. Build only the gaps demonstrated by an acceptance pilot.

The initial Boss Bot implementation remains a useful interaction prototype and small local application. It is materially less complete than the alternatives below. Its existence is not a reason to recreate their scheduling, permission, credential and recovery machinery.

Do not immediately combine Paperclip, OpenClaw and Hermes into one stack. Begin with Paperclip and an official Codex runtime. Add another runtime only when a workflow needs it. Keep one authoritative task store, permission decision and account-selection authority.

## Evidence and scope

- Inspected Paperclip source at `5b913e794315530b95f2bc95dd80e3ebc266b257` in separate reference checkouts. No source was copied into Boss Bot.
- Read official OpenClaw and Hermes documentation, including multiple-account behavior and durable task coordination.
- Read Grok Bot's official design article and inspected its published workspace visual in a browser. This was not a signed-in Grok product test.
- Did not install or run Paperclip/OpenClaw/Hermes, run their test suites, connect accounts, or verify paid-provider execution. Tests cited below are source evidence of intended behavior, not a claim that they passed locally.
- Paperclip's inspected source requires Node >=24.11.0 and pnpm 9.15.4; Boss Bot currently runs on Node 22.22+. A pilot should use a separate compatible environment and a pinned revision/release.

## Comparison

| Candidate    | Relevant strengths                                                                                                                                                | Material fit gaps                                                                                                                                                                             | Role in our decision                                                                   |
| ------------ | ----------------------------------------------------------------------------------------------------------------------------------------------------------------- | --------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------------- | -------------------------------------------------------------------------------------- |
| Paperclip    | Team and goal hierarchy, agent adapters, permissions, secrets, managed AI connections, routines, budgets, run history and sandbox/remote execution infrastructure | Work-management vocabulary is more prominent than Grok's conversational roster; account-aware fallback and live computer takeover need validation; provider methods are not equally supported | First choice for the orchestration foundation                                          |
| OpenClaw     | Multiple saved accounts per provider, personal account selection, auth profiles, cooldowns, model fallback and Codex runtime integration                          | Shared gateway is one trust domain; personal account selection and shared fallback have distinct semantics; organizational governance fit needs evaluation                                    | Strong alternative runtime/gateway, especially if account routing is the dominant need |
| Hermes Agent | Persistent agent profiles, skills and tools, dashboard, durable multi-agent Kanban with handoffs and recovery                                                     | Primarily an agent runtime/profile system; team governance and the exact subscription-account model need verification                                                                         | Optional worker runtime, or a lighter standalone alternative                           |
| Grok Bot     | Clear roster/conversation workflow, presence, inline actions and progressive computer access                                                                      | Hosted in Cursor infrastructure; not a self-hosted provider-neutral codebase                                                                                                                  | Interaction-design reference                                                           |

### Paperclip is substantially more extensive than a dashboard

Verified implementation areas include:

- Managed AI connection records with personal/shared ownership, responsible-user selection, company membership checks, human-audience enforcement, reconnect and revocation handling. Its tests cover multiple accounts, concurrent credential homes and refreshing the original credential grant. See [connection service](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/server/src/services/ai-connections.ts) and [connection tests](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/server/src/__tests__/ai-connections.test.ts).
- Scheduled/webhook/API routines with concurrency policies, missed-run policies and definition revisions. See [routines API](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/docs/api/routines.md).
- Adapter contracts, remote execution infrastructure, usage accounting and quota aggregation. See [adapter overview](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/docs/adapters/overview.md) and [quota service](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/server/src/services/quota-windows.ts).

Important qualifications:

1. The managed connection capability table covers OpenAI, Anthropic, OpenRouter and xAI. Gemini CLI is registered as an adapter but is absent from that connection table. A runtime adapter is not the same as complete multi-account onboarding. See [capability table](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/packages/shared/src/ai-connections.ts).
2. Some docs lag source: the adapter overview describes Gemini as outside the stable type enum, while the inspected constants and registry include it. Pin the evaluated revision and validate behavior.
3. The inspected quota aggregator invokes registered adapter quota hooks without an account argument. That is not evidence of complete quota reporting for every saved account. The managed connection tests explicitly preserve a revoked default rather than automatically selecting a replacement. A general account-capacity router is therefore still a pilot requirement.
4. Paperclip implements Claude subscription mechanisms. That does not establish permission for our use case. Use the API path unless Anthropic explicitly authorizes the proposed integration.
5. Native runtime/session continuity, permission enforcement during real tool calls and desktop takeover remain acceptance tests. Source coverage does not prove all adapters provide the same behavior.

Paperclip is MIT licensed, making adaptation feasible while preserving its copyright and license. Prefer supported APIs/extensions and narrow changes over a large fork. See [license](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/LICENSE).

### OpenClaw is the strongest account-routing reference

Official documentation describes multiple personal accounts per provider, browser/device sign-in for OpenAI, and private identity-scoped storage. Personal credentials are not automatically placed in the shared rotation pool. Separately configured shared auth profiles can provide fallback; a selected account label is not necessarily the account eventually billed. These differences matter for Boss Bot's ownership and spending guarantees. See [personal accounts](https://docs.openclaw.ai/concepts/multi-user#per-person-model-accounts).

The failover system documents profile cooldowns, subscription-to-API backup and reset-time tracking. Preserve explicit account authorization and safe replay checks when adapting this behavior. A shared gateway remains one trust domain rather than an isolation boundary against administrators or code running as its OS user. See [failover](https://docs.openclaw.ai/concepts/model-failover) and [gateway security](https://docs.openclaw.ai/gateway/security).

### Hermes is worth considering as a worker

Hermes' durable Kanban supports named agent profiles, persisted tasks, dependencies, handoffs, review and restart-oriented coordination. Its dashboard manages profiles, memory, keys, sessions, skills and schedules. These make it a substantive alternative, not just a chat CLI. Whether it replaces Paperclip depends on how much company-level governance we need. See [Kanban](https://hermes-agent.nousresearch.com/docs/user-guide/features/kanban) and [dashboard](https://github.com/NousResearch/hermes-agent/blob/main/website/docs/user-guide/features/web-dashboard.md).

## Grok-inspired experience direction

Grok's published design favors a recognizable bot roster, an ongoing conversation and optional access to work. Its computer UI progresses from a status indicator to a side preview and then full takeover. Inline artifacts and actions reduce the need to navigate settings. See the [official design article](https://x.ai/news/designing-grok-bot).

For Boss Bot, the proposed daily workspace is:

- Left: teammates, project groups, unread updates and decisions needing attention.
- Center: ongoing conversation, task progress, review cards and delivered artifacts.
- Right, opened when useful: files, computer preview, memory or routines.
- Administration: accounts, access, budgets and run diagnostics, outside the main conversation.

Create original avatars and visual assets. Borrow interaction principles, not Grok branding or artwork. Keep administrative views for managers without making everyone operate a task dashboard. This is a proposed next design direction; the shipped overview UI has not been redesigned in this review.

Grok's design article describes a bot's computer conceptually; its enterprise architecture clarifies that bots belonging to one user share a persistent VM. Visual separation should not be mistaken for isolation. See [team architecture](https://docs.x.ai/grok-bot/teams-and-enterprises).

## Multiple accounts are a first-class requirement

See [multi-account requirements](multi-account-requirements.md). Replace the current environment-variable-per-provider foundation with stored, owner-scoped connections. Support many connections to the same provider without an artificial two-account limit. Storage capacity and simultaneous execution capacity are separate controls.

Codex has documented native authentication and app-server integration. Gemini CLI documents eligible Google account sign-in, but that alone does not establish every hosted/team integration scenario. Anthropic explicitly disallows third-party Claude.ai login and routing through user subscription credentials. Account features in an open-source repository do not override provider rules. References: [Codex app server](https://developers.openai.com/codex/app-server/), [Gemini authentication](https://geminicli.com/docs/get-started/authentication/), [Anthropic policy](https://code.claude.com/docs/en/legal-and-compliance).

## Next implementation decision

Run a bounded Paperclip acceptance pilot using isolated test data:

1. Two human identities, multiple connection records for one provider, and separate agent access. Verify denied cross-user selection.
2. Two approved Codex tasks with independent account attribution and session continuity. Actual subscription tests require each legitimate owner's login.
3. An exhausted or revoked connection must not silently use an unrelated person's credentials or incur API charges. Simulated provider responses can test the policy before paid execution.
4. A routine, delegated child task, approval pause, restart and resumed completion with no duplicated external action.
5. A document/research workflow and a browser workflow with visible artifacts and takeover where available.
6. Grok-style daily navigation should be possible through existing UI customization or a thin API client, without duplicating task/permission/account state.

**Decision rule:** if Paperclip satisfies governance and reliable execution with small gaps, adopt it and extend those gaps. If its work-management assumptions make the daily teammate experience costly, evaluate OpenClaw for the account/runtime-first path. Resume a broad custom backend only after recording why those options fail the concrete workflows.

No migration, dependency adoption or account connection was performed by this review.
