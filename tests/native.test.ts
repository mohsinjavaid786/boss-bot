import { test } from "node:test";
import assert from "node:assert/strict";
import { Store } from "../apps/server/src/store.ts";

test("native handoff snapshots context, requires approval and imports a result only once", () => {
  const store = new Store(":memory:");
  try {
    const agent = store.agents()[0];
    const task = store.createTask(agent.id, "Research this", "claude-native");
    assert.equal(store.importNative(task.id, "premature"), false);
    assert.equal(store.handoff(task.id), true);
    assert.equal(store.handoff(task.id), false);
    const snapshot = store.nativePrompt(task.id);
    assert.match(snapshot, /Research this/);
    store.memory(agent.id, "new private context");
    assert.equal(store.nativePrompt(task.id), snapshot);
    assert.equal(store.tasks()[0].status, "awaiting_native");
    assert.equal(store.importNative(task.id, "Owner supplied answer"), true);
    assert.equal(store.importNative(task.id, "overwrite"), false);
    assert.equal(store.tasks()[0].output, "Owner supplied answer");
    assert.deepEqual(
      store.events(task.id).map((e) => e.event),
      ["created", "native_handoff_approved", "native_result_imported"],
    );
    const other = store.createTask(agent.id, "API work", "claude");
    assert.equal(store.handoff(other.id), false);
  } finally {
    store.close();
  }
});
