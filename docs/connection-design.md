# Saved connections

## Adopted concepts

Paperclip separates saved credentials from agents and resolves an explicitly selected connection at execution time. Boss Bot adopts those concepts with an original, smaller implementation for its current single-owner architecture. No Paperclip source code was copied or vendored.

Reviewed source: [Paperclip AI connections](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/server/src/services/ai-connections.ts), [Git credentials](https://github.com/paperclipai/paperclip/blob/5b913e794315530b95f2bc95dd80e3ebc266b257/server/src/services/git-credentials.ts). GitLab support here is an independent implementation against its official REST API.

## Implemented boundary

Each saved connection has a UUID, provider, human-readable label, model where relevant, encrypted credential, and public verification metadata. Runtime IDs refer to a specific connection UUID. A disconnected account cannot execute a pending task; replacement accounts do not inherit pending work. Already-running calls are not cancelled by disconnect.

GitHub.com and GitLab.com connections can verify identity and list 30 repositories per page. Requests use fixed HTTPS origins, authorization headers, a timeout and refused redirects. Provider error bodies are not exposed. Only checked HTTPS provider links are returned to the UI. There is no repository write access exposed by Boss Bot, even if a user supplies a broader token.

Claude API and dedicated Codex CLI directories produce separate selectable runtimes without changing the process environment. Saving is not a live AI verification. The normal task approval boundary applies. Native Codex credential files remain managed by Codex; the vault encrypts the directory reference. The Claude native subscription workflow remains separate because third-party credential routing is not an officially supported integration path.

## Next boundary

Before network/team deployment: authenticated owners, per-agent grants, account audit events, guided sign-in, credential rotation, quota identity deduplication and isolated workers. Repository checkout, context ingestion and writes need explicit grants and reviewable actions. Native subscription allowance must never be pooled across unrelated users or silently replaced with API billing.

## Validation

Automated tests use temporary SQLite stores and mocked provider responses. They cover eleven independent accounts, encrypted persistence, restart recovery, disconnect, explicit routing, GitLab headers, unsafe link rejection, provider error redaction and HTTP mutation protection. Live account access requires user-provided credentials and is not claimed by these tests.
