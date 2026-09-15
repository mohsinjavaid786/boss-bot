# Boss Bot implementation plan

Goal: ship the first runnable foundation of the internal workforce platform.
Architecture: React web app, loopback Node service, SQLite persistence, separate runtime and policy package.
Spec: architecture.md. Node 22.22+; original implementation with preserved dependency notices. Small commits.

1. Write tests for owner/capability routing, unavailable runtimes, durable memory, duplicate approvals and restart interruption. Verify failures, then implement core and store. Commit.
2. Add authenticated local HTTP endpoints, validated input, task approval execution and bounded runtime adapters. Check type safety and integration tests. Commit.
3. Build agent roster, task composer, approval inbox, runtime settings and detail panel against real API state. Check browser actions, mobile and production build. Commit.
4. Document setup, limitations and attribution, add CI, verify clean history and push repository.
