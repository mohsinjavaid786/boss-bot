import { test } from "node:test";
import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, realpath } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Store } from "../apps/server/src/store.ts";
import { app } from "../apps/server/src/http.ts";
import type { AgentRuntime } from "../packages/core/src/index.ts";

test("coding context persists, continuation keeps account and workspace, busy workspaces refuse overlap", async () => {
  const dir = await mkdtemp(join(tmpdir(), "boss-coding-http-"));
  const store = new Store(join(dir, "state.db"));
  let release: () => void = () => {};
  let calls = 0;
  const runtime: AgentRuntime = {
    info: {
      id: "code",
      name: "Code",
      ownerId: "local",
      available: true,
      billing: "subscription",
      capabilities: ["text", "coding"],
      description: "",
    },
    async execute(input) {
      calls++;
      assert.ok(input.workspace);
      if (calls === 1) {
        input.onSession?.("saved-session");
        input.onProgress?.("Testing changes");
        await new Promise<void>((r) => (release = r));
      } else assert.equal(input.resumeSessionId, "saved-session");
      return "Done";
    },
  };
  const server = app(store, [
    runtime,
    { ...runtime, info: { ...runtime.info, id: "other" } },
  ]);
  server.listen(0, "127.0.0.1");
  await once(server, "listening");
  const base = `http://127.0.0.1:${(server.address() as { port: number }).port}`;
  try {
    const state = await (await fetch(base + "/api/state")).json();
    const post = (path: string, data: unknown = {}) =>
      fetch(base + path, {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          "x-boss-token": state.token,
        },
        body: JSON.stringify(data),
      });
    const data = {
      agentId: state.agents[0].id,
      prompt: "Code",
      runtimeId: "code",
      workspace: dir,
      model: "test-model",
    };
    const task = await (await post("/api/tasks", data)).json();
    assert.equal(task.execution.workspace, await realpath(dir));
    assert.equal(task.execution.model, "test-model");
    assert.equal((await post(`/api/tasks/${task.id}/approve`)).status, 202);
    assert.match(
      store.tasks().find((t) => t.id === task.id)!.output,
      /Testing changes/,
    );
    const second = await (await post("/api/tasks", data)).json();
    assert.equal((await post(`/api/tasks/${second.id}/approve`)).status, 409);
    assert.equal(
      (await post("/api/tasks", { ...data, resumeTaskId: task.id })).status,
      400,
    );
    release();
    for (
      let i = 0;
      i < 50 &&
      store.tasks().find((t) => t.id === task.id)?.status === "running";
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(
      (
        await post("/api/tasks", {
          ...data,
          runtimeId: "other",
          resumeTaskId: task.id,
        })
      ).status,
      400,
    );
    const follow = await (
      await post("/api/tasks", { ...data, resumeTaskId: task.id })
    ).json();
    assert.equal((await post(`/api/tasks/${follow.id}/approve`)).status, 202);
    for (
      let i = 0;
      i < 50 &&
      store.tasks().find((t) => t.id === follow.id)?.status === "running";
      i++
    )
      await new Promise((r) => setTimeout(r, 10));
    assert.equal(
      store.tasks().find((t) => t.id === follow.id)?.status,
      "completed",
    );
    assert.equal(calls, 2);
  } finally {
    release();
    server.close();
    await once(server, "close");
    store.close();
    await rm(dir, { recursive: true, force: true });
  }
});
