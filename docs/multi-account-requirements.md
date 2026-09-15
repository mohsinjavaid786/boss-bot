# Multiple AI accounts: product and runtime requirements

Status: required for the next architecture; not implemented by the current single-owner preview. Applies whether Boss Bot adopts Paperclip or continues its own backend.

## Product model

A provider, an account, an agent and an executing runtime are distinct:

- Provider: OpenAI, Anthropic, Google or another supported service.
- Connection: one authenticated, owner-scoped account or API credential.
- Agent: persistent identity, responsibilities, memory and allowed capabilities.
- Runtime: the engine executing a task using an authorized connection.

Allow multiple connections to the same provider and multiple providers for an owner. Do not hard-code one slot per provider or a two-account limit. Lists need pagination/search and account labels. Apply configurable operational limits, rather than claiming unlimited concurrent capacity.

Connecting the same underlying provider account twice does not create more allowance. Quota identity must include the provider's account/workspace scope and the account holder where applicable; deduplicate usage windows or show that two connections share allowance.

## Connection record

Required fields: stable connection ID, workspace ID, owner ID, provider, authentication method, user-facing label, provider subject/workspace references, secret reference, health state, permitted agents, allowed usage policy and creation/update timestamps.

Never store raw credentials in UI state, prompts, task payloads or logs. Access/refresh tokens live in an encrypted store or isolated official runtime credential home. Serialize refresh or credential write-back per underlying account; stale executions must not overwrite a newer login or a revocation.

Personal account ownership and team membership are separate. A team member cannot spend another member's personal subscription merely because both can open the same agent. Shared organization API credentials can be granted explicitly where the provider agreement permits it.

## User experience

Connections page:

- Add account repeatedly for a supported provider.
- Label each account, identify its owner and display its allowed agents.
- Distinguish configured, verified, expired, revoked, cooling down and unavailable states.
- Show real allowance windows and reset times when supplied; display unknown when unavailable.
- Choose an explicit account, an owner-specific default, or an authorized ordered fallback policy.
- Reconnect or revoke one connection without affecting the others.
- Show the account actually used on each run, including any approved fallback and its reason.

Runtime compatibility must determine which accounts appear. An API key does not automatically provide the same computer tools or session behavior as a subscription runtime.

## Dispatch policy

1. Resolve the responsible human and workspace from authenticated server state, including for routines and delegation. Missing identity pauses the task.
2. Filter connections by ownership/grant, workspace, provider permission, runtime capabilities, health, concurrency and spending policy.
3. Prefer the task's explicit connection or approved owner default. Never substitute another person's account because it has quota.
4. If it is unavailable, follow only the explicitly authorized fallback chain. API fallback requires a spending policy; otherwise wait or ask.
5. Refresh quota where supported and enforce per-account concurrency leases. Unknown allowance is not equivalent to zero or unlimited.
6. Record the selected connection and policy decision before dispatch. Store actual usage separately from estimates.
7. Preserve native session affinity to its account/runtime. Moving to another account must use an authorized transferable checkpoint or a new session, not another user's native session ID.
8. Do not replay work after uncertain side effects. Verify completion or resume a durable checkpoint before retrying with any account.
9. Revocation removes eligibility for queued work and prevents further privileged actions by active work where the runtime supports cancellation. Report cancellation limits honestly.

Rotating legitimate, authorized connections is a reliability feature. It must not bypass provider restrictions, account-sharing terms or usage limits.

## Acceptance cases

- Ten saved accounts across three providers and several owners remain independently addressable; adding the eleventh does not replace an existing connection. Test pagination beyond one page.
- Two connections belonging to one provider can be selected independently.
- Duplicate logins to the same underlying account show shared allowance.
- An agent cannot select another person's private account through a guessed connection ID, a delegated task, a routine or a fallback chain.
- Revoking a selected account leaves queued work paused; adding a new account does not silently change that choice.
- Refresh races and late credential writes cannot undo a revocation.
- A rate-limit response records the reset time when known and waits or follows only an approved fallback.
- API fallback is blocked when disabled or when the budget cannot admit the run. Actual spend remains observable; estimates are not presented as exact bills.
- A failed request after an external action is not blindly repeated with the next connection.
- Changing a default affects new assignments according to the displayed policy; it does not repin existing tasks invisibly.
- Multi-account concurrency is tested independently from the number of stored accounts.
- Unauthorized account metadata, credentials and quota details are absent from other members' responses and logs.

## Current provider position

- OpenAI: prioritize official Codex account authentication/app-server behavior with isolated owner contexts.
- Anthropic: API authentication for this application unless explicit authorization changes the permitted subscription path.
- Google: API supported in the preview; verify the exact eligible Gemini CLI/team integration before claiming subscription support.
- Local runtimes: future connections can represent a local model endpoint without a subscription, with the same capability and access checks.

These requirements are an acceptance contract, not a claim that storing multiple accounts guarantees safe team-wide pooling or production scalability.
