import { useEffect, useState } from "react";
const names: Record<string, string> = {
  created: "Task created",
  approved: "Approved and started",
  completed: "Completed",
  failed: "Execution failed",
  interrupted: "Interrupted by restart",
  rejected: "Declined",
  stop_requested: "Stop requested",
  cancelled: "Stopped",
  native_handoff_approved: "Manual handoff approved",
  native_result_imported: "Result imported",
};
export function TaskHistory({
  id,
  updatedAt,
}: {
  id: string;
  updatedAt: string;
}) {
  const [events, setEvents] = useState<{ event: string; createdAt: string }[]>(
    [],
  );
  const [error, setError] = useState(false);
  const [retry, setRetry] = useState(0);
  useEffect(() => {
    const controller = new AbortController();
    setError(false);
    fetch("/api/tasks/" + id + "/events", { signal: controller.signal })
      .then(async (r) => {
        if (!r.ok) throw new Error();
        return r.json();
      })
      .then(setEvents)
      .catch(() => {
        if (!controller.signal.aborted) setError(true);
      });
    return () => controller.abort();
  }, [id, updatedAt, retry]);
  return (
    <section className="task-history">
      <h4>Activity</h4>
      {error ? (
        <p>
          Activity could not load.{" "}
          <button className="textbutton" onClick={() => setRetry((v) => v + 1)}>
            Try again
          </button>
        </p>
      ) : !events.length ? (
        <p className="muted">Loading activity…</p>
      ) : (
        <ol>
          {events.map((e, i) => (
            <li key={i}>
              <span>{names[e.event] || e.event.replaceAll("_", " ")}</span>
              <time dateTime={e.createdAt}>
                {new Date(e.createdAt).toLocaleString()}
              </time>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
