import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { get } from "node:http";
import { Store } from "../apps/server/src/store.ts";
import { app } from "../apps/server/src/http.ts";
import type { AgentRuntime } from "../packages/core/src/index.ts";
test("HTTP workflow persists results and rejects forged or repeated approvals", async () => {
  const store = new Store(":memory:");
  let calls = 0;
  const runtime: AgentRuntime = {
    info: {
      id: "test",
      name: "Test",
      ownerId: "local",
      available: true,
      billing: "local",
      capabilities: ["text"],
      description: "Test only",
    },
    async execute(input) {
      calls++;
      return "Result: " + input.prompt;
    },
  };
  const server = app(store, [runtime]);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address();
  assert.ok(address && typeof address === "object");
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const state = await (await fetch(base + "/api/state")).json();
    const headers = {
      "Content-Type": "application/json",
      "x-boss-token": state.token,
    };
    assert.equal(
      (
        await fetch(base + "/api/tasks", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: "{}",
        })
      ).status,
      403,
    );
    assert.equal(
      (
        await fetch(base + "/api/state", {
          headers: { Origin: "https://attacker.example" },
        })
      ).status,
      403,
    );
    const hostileStatus = await new Promise<number | undefined>((resolve) =>
      get(
        base + "/api/state",
        { headers: { Host: "attacker.example" } },
        (r) => {
          r.resume();
          resolve(r.statusCode);
        },
      ),
    );
    assert.equal(hostileStatus, 403);
    assert.equal(
      (
        await fetch(base + "/api/tasks", {
          method: "POST",
          headers,
          body: JSON.stringify({
            agentId: state.agents[0].id,
            prompt: " ",
            runtimeId: "test",
          }),
        })
      ).status,
      400,
    );
    const r = await fetch(base + "/api/tasks", {
      method: "POST",
      headers,
      body: JSON.stringify({
        agentId: state.agents[0].id,
        prompt: "Summarize the plan",
        runtimeId: "test",
      }),
    });
    assert.equal(r.status, 201);
    const task = await r.json();
    assert.equal(calls, 0);
    const approvals = await Promise.all(
      [1, 2].map(() =>
        fetch(base + `/api/tasks/${task.id}/approve`, {
          method: "POST",
          headers,
          body: "{}",
        }),
      ),
    );
    assert.deepEqual(approvals.map((r) => r.status).sort(), [202, 409]);
    assert.equal(calls, 1);
    const final = await (await fetch(base + "/api/state")).json();
    assert.equal(final.tasks[0].status, "completed");
    assert.equal(final.tasks[0].output, "Result: Summarize the plan");
    const events = await (
      await fetch(base + `/api/tasks/${task.id}/events`)
    ).json();
    assert.deepEqual(
      events.map((e: any) => e.event),
      ["created", "approved", "completed"],
    );
  } finally {
    server.close();
    await once(server, "close");
    store.close();
  }
});
