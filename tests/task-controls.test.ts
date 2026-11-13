import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { Store } from "../apps/server/src/store.ts";
import { app } from "../apps/server/src/http.ts";
import type { AgentRuntime } from "../packages/core/src/index.ts";
test("stop cancels running work, preserves progress and rejects late completion", async () => {
  const store = new Store(":memory:");
  const runtime: AgentRuntime = {
    info: { id: "test", name: "Test", ownerId: "local", available: true, billing: "local", capabilities: ["text"], description: "" },
    async execute(input, signal) {
      input.onProgress?.("Reading the workspace");
      return new Promise<string>((_, reject) => signal.addEventListener("abort", () => reject(new Error("Aborted")), { once: true }));
    }
  };
  const server = app(store, [runtime]);
  server.listen(0, "127.0.0.1"); await once(server, "listening");
  const base = "http://127.0.0.1:" + (server.address() as { port: number }).port;
  try {
    const state = await (await fetch(base + "/api/state")).json();
    const post = (path: string, data: unknown = {}) => fetch(base + path, { method: "POST", headers: { "Content-Type": "application/json", "x-boss-token": state.token }, body: JSON.stringify(data) });
    const task = await (await post("/api/tasks", { agentId: state.agents[0].id, runtimeId: "test", prompt: "Work" })).json();
    assert.equal((await post("/api/tasks/" + task.id + "/stop")).status, 409);
    assert.equal((await post("/api/tasks/" + task.id + "/approve")).status, 202);
    assert.equal((await fetch(base + "/api/tasks/" + task.id + "/stop", { method: "POST", headers: { "Content-Type": "application/json" }, body: "{}" })).status, 403);
    assert.equal((await post("/api/tasks/" + task.id + "/stop")).status, 202);
    for (let i = 0; i < 50 && store.tasks()[0].status !== "cancelled"; i++) await new Promise(r => setTimeout(r, 10));
    assert.equal(store.tasks()[0].status, "cancelled");
    assert.match(store.tasks()[0].output, /Reading the workspace/);
    store.finish(task.id, "completed", "Late success");
    assert.equal(store.tasks()[0].status, "cancelled");
    assert.equal((await post("/api/tasks/" + task.id + "/stop")).status, 409);
    assert.deepEqual(store.events(task.id).map(e => e.event), ["created", "approved", "stop_requested", "cancelled"]);
  } finally { server.close(); await once(server, "close"); store.close(); }
});
