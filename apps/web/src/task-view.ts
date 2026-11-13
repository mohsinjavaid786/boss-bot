import type { Task } from "../../../packages/core/src/index.ts";
export function filterTasks(
  tasks: Task[],
  agents: { id: string; name: string; role: string }[],
  runtimes: { id: string; name: string }[],
  query: string,
  status: string,
) {
  const needle = query.trim().toLowerCase();
  return tasks.filter((t) => {
    const agent = agents.find((a) => a.id === t.agentId);
    const runtime = runtimes.find((r) => r.id === t.runtimeId);
    const text = [
      t.prompt,
      agent?.name,
      agent?.role,
      runtime?.name,
      t.execution?.workspace,
    ]
      .join(" ")
      .toLowerCase();
    return (status === "all" || t.status === status) && text.includes(needle);
  });
}
