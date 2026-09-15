# Boss Bot: first milestone

The requested architecture is approved in the project brief. Implement a modular local-first foundation before distributed autonomy.

## Structure

- apps/web: React workspace. Agent roster, assignment composer, approval inbox, task detail and memory editor. Slate navigation, cool white canvas, cobalt actions and teal state indicators. Typography uses system sans; meaningful hierarchy, keyboard focus and narrow-screen layouts.
- apps/server: loopback-only HTTP service and durable SQLite state. Single-owner development mode; not a multi-user security boundary.
- packages/core: provider-neutral AgentRuntime interface, capability routing and action policy.

## Execution

Persist each task before execution. All initial tasks require explicit owner approval. Claim a task atomically; duplicate approval cannot rerun it. Running tasks at process restart become interrupted and are never automatically replayed. Runtime output is plain text. Memory is user-curated and persists independently of runtime choice.

Runtime credentials remain server-side. Codex runs locally through the official CLI using its existing login, read-only sandbox and approvals disabled (requests for escalation fail). It is opt-in because read-only shell execution still has access to local readable information. API adapters are text-only in this milestone. Match runtime capabilities before dispatch. Never silently charge API usage: the owner explicitly chooses an API runtime. No cross-user subscription pooling or quota bypass.

## Milestones

1. Durable local workspace, agents, memory, audited task approvals, runtime contracts and text execution.
2. Individual user authentication, membership and encrypted per-owner credential broker; Codex app-server login and quota telemetry; verify Gemini runtime integration terms.
3. Isolated computer workers, capability grants, exact tool-action approvals, integration broker and recovery checkpoints.
4. Durable timezone-aware routines, bounded delegation, usage budgets, authorized fallback routing and later local models.

Milestone 1 must not advertise tools, routines, automatic fallback or multi-user isolation as implemented.
