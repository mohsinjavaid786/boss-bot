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

test("connection API protects credentials and disconnect blocks pending AI work", async () => {
  const { Connections } = await import("../apps/server/src/connections.ts");
  const { mkdtempSync, rmSync } = await import("node:fs");
  const { tmpdir } = await import("node:os");
  const { join } = await import("node:path");
  const dir = mkdtempSync(join(tmpdir(), "boss-http-connections-"));
  const store = new Store(":memory:");
  const vault = new Connections(dir);
  const server = app(store, [], undefined, vault);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const address = server.address() as { port: number };
  const base = `http://127.0.0.1:${address.port}`;
  try {
    const state = await (await fetch(base + "/api/state")).json();
    const headers = {
      "Content-Type": "application/json",
      "x-boss-token": state.token,
    };
    const input = {
      provider: "claude",
      label: "Work Claude",
      secret: "never-return-this-key",
      model: "test-model",
    };
    assert.equal(
      (
        await fetch(base + "/api/connections", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
        })
      ).status,
      403,
    );
    const saved = await fetch(base + "/api/connections", {
      method: "POST",
      headers,
      body: JSON.stringify(input),
    });
    assert.equal(saved.status, 201);
    const c = await saved.json();
    assert.ok(!JSON.stringify(c).includes(input.secret));
    const fresh = await (await fetch(base + "/api/state")).json();
    assert.ok(!JSON.stringify(fresh).includes(input.secret));
    assert.equal(fresh.runtimes[0].billing, "api");
    const task = await (
      await fetch(base + "/api/tasks", {
        method: "POST",
        headers,
        body: JSON.stringify({
          agentId: state.agents[0].id,
          prompt: "Test",
          runtimeId: fresh.runtimes[0].id,
        }),
      })
    ).json();
    assert.ok(task.id);
    assert.equal(
      (
        await fetch(base + `/api/connections/${c.id}`, {
          method: "DELETE",
          headers,
          body: "{}",
        })
      ).status,
      200,
    );
    assert.equal(
      (
        await fetch(base + `/api/tasks/${task.id}/approve`, {
          method: "POST",
          headers,
          body: "{}",
        })
      ).status,
      400,
    );
    assert.equal(store.tasks()[0].status, "awaiting_approval");
  } finally {
    server.close();
    await once(server, "close");
    vault.close();
    store.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
