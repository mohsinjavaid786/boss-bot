import { test } from "node:test";
import assert from "node:assert/strict";
import { filterTasks } from "../apps/web/src/task-view.ts";
import type { Task } from "../packages/core/src/index.ts";
test("search combines prompt, teammate, account and workspace with status", () => {
  const task = { id: "1", agentId: "a", runtimeId: "r", status: "running", prompt: "Fix checkout", execution: { workspace: "/projects/shop" } } as Task;
  const agents = [{ id: "a", name: "Atlas", role: "Engineering" }];
  const runtimes = [{ id: "r", name: "Personal Codex" }];
  for (const query of ["ATLAS", "engineering", "personal", "/projects/shop", "checkout"]) assert.equal(filterTasks([task], agents, runtimes, query, "all").length, 1);
  assert.equal(filterTasks([task], agents, runtimes, "checkout", "completed").length, 0);
  assert.equal(filterTasks([task], agents, runtimes, "missing", "running").length, 0);
  assert.equal(filterTasks([task], agents, runtimes, "", "running").length, 1);
});
