# Chat and desktop experience

Status: next-milestone requirements, not shipped features.

## Main goal

People should work with persistent bots through conversation. The configuration portal is an administrative surface, not the final daily product.

The preferred execution path uses existing, legitimately owned subscriptions. ChatGPT/Codex is the first supported integration target. The local-owner preview now has an experimental Claude Code CLI adapter that executes approved text tasks using a checked native subscription login. Full shared chat, native conversation continuity and isolated multi-user execution remain requirements.

## Conversation workspace

- Persistent bot roster with identity, recent update, unread count and a meaningful working/waiting/blocked state.
- Durable conversation per bot, with project conversations when authorized context needs to be shared.
- Streaming updates, task boundaries and actual runtime/account attribution.
- Inline review cards for consequential actions. Approval names the action and affected resource rather than asking for vague blanket trust.
- Artifact cards for files and results; open the artifact alongside chat.
- Optional context panel for memory, files, routines and an isolated computer preview.
- User intervention and cancellation controls that accurately reflect what the runtime can stop.
- Keyboard navigation, searchable history and accessible mobile layouts.

## Account behavior

The bot keeps its identity when a user changes runtime. Sessions must preserve account ownership and native runtime affinity. Switching accounts cannot transfer another person's private conversation, local credentials or tool permissions.

A default account is selected during setup; people should not have to reconfigure providers for every message. Show the actual connection used, and surface quota/reset information when known. API fallback remains off unless expressly configured.

## Desktop delivery

Start by making the browser chat complete. A later desktop client uses the same server APIs, event stream, account broker and task state. Do not maintain a second orchestration implementation inside the desktop app.

Desktop acceptance includes native notifications for required decisions and completed work, reconnect behavior, safe external-link handling, clear local/server connection settings and supported updates. Local computer access is an explicit permission, not a consequence of installing the client.

No desktop framework is selected by this document. Packaging must follow the selected orchestration foundation and security model.

## Native Claude companion path

Anthropic's Remote Control can connect its browser/mobile client to an eligible local Claude Code subscription session. That is useful for a separate native workflow. It is not evidence that Boss Bot may embed the Claude login flow, store subscription tokens or route requests through them.

If a companion handoff is implemented, label it as opening Claude, keep authentication in Anthropic's own flow, and do not claim the conversation runs inside Boss Bot. Legacy manual-handoff tasks remain supported; new tasks should select the automatic local Claude Code adapter.

References: [Claude Remote Control](https://code.claude.com/docs/en/remote-control), [credential rules](https://code.claude.com/docs/en/legal-and-compliance).
