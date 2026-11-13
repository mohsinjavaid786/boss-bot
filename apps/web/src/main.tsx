import React, { useEffect, useState } from "react";
import { createRoot } from "react-dom/client";
import {
  ArrowUpRight,
  Check,
  ChevronRight,
  Command,
  Layers3,
  Plus,
  Search,
  ShieldCheck,
  Sparkles,
  Users,
  Workflow,
  X,
  Zap,
  Clock3,
  Send,
  BookOpen,
  PanelLeft,
  Activity,
  Square,
  RotateCcw,
  ArrowRight,
  Terminal,
  Copy,
  WifiOff,
} from "lucide-react";
import type {
  Agent,
  Task,
  RuntimeInfo,
} from "../../../packages/core/src/index.ts";
import "./style.css";
import { NativeHandoff } from "./NativeHandoff";
import { ConnectionManager } from "./Connections";
import { TaskComposer } from "./TaskComposer";
import { TaskHistory } from "./TaskHistory";
import { filterTasks } from "./task-view";
import type { SavedConnection } from "../../server/src/connections.ts";
type State = {
  agents: Agent[];
  tasks: Task[];
  runtimes: RuntimeInfo[];
  token: string;
  connections: SavedConnection[];
};
type Page = "Overview" | "Your team" | "Tasks" | "Approvals" | "Connections";
const labels: Record<Task["status"], string> = {
  awaiting_approval: "Needs approval",
  running: "In progress",
  stopping: "Stopping",
  cancelled: "Stopped",
  awaiting_native: "Continue in Claude",
  completed: "Completed",
  failed: "Failed",
  rejected: "Declined",
  interrupted: "Interrupted",
};
const icons = {
  Overview: Layers3,
  "Your team": Users,
  Tasks: Workflow,
  Approvals: ShieldCheck,
  Connections: Zap,
};
function App() {
  const [state, setState] = useState<State | null>(null),
    [page, setPage] = useState<Page>("Overview"),
    [error, setError] = useState(""),
    [notice, setNotice] = useState(""),
    [query, setQuery] = useState("");
  const [dialog, setDialog] = useState<"agent" | "task" | null>(null),
    [selected, setSelected] = useState<Agent | null>(null),
    [task, setTask] = useState<Task | null>(null),
    [busy, setBusy] = useState(false),
    [mobile, setMobile] = useState(false);
  const [statusFilter, setStatusFilter] = useState("all");
  const [offline, setOffline] = useState(false);
  const [repeatTask, setRepeatTask] = useState<Task | null>(null);
  const [continuation, setContinuation] = useState<Task | null>(null);
  useEffect(() => {
    if (!dialog) {
      setContinuation(null);
      setRepeatTask(null);
    }
  }, [dialog]);
  async function refresh() {
    const r = await fetch("/api/state", { signal: AbortSignal.timeout(8000) });
    if (!r.ok)
      throw new Error(
        "Workspace could not load. Check that the server is running.",
      );
    setState(await r.json());
    setOffline(false);
  }
  useEffect(() => {
    refresh().catch(() => setOffline(true));
    const timer = setInterval(
      () => refresh().catch(() => setOffline(true)),
      3000,
    );
    return () => clearInterval(timer);
  }, []);
  useEffect(() => {
    function escape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setDialog(null);
        setSelected(null);
        setTask(null);
        setMobile(false);
      }
    }
    window.addEventListener("keydown", escape);
    return () => window.removeEventListener("keydown", escape);
  }, []);
  useEffect(() => {
    if (!notice) return;
    const timer = setTimeout(() => setNotice(""), 6500);
    return () => clearTimeout(timer);
  }, [notice]);
  async function mutate(path: string, method: string, data: unknown) {
    setBusy(true);
    setError("");
    try {
      const r = await fetch(path, {
        method,
        headers: {
          "Content-Type": "application/json",
          "x-boss-token": state!.token,
        },
        body: JSON.stringify(data),
      });
      const value = await r.json();
      if (!r.ok)
        throw new Error(value.error || "This action could not be completed.");
      await refresh().catch(() => setOffline(true));
      return true;
    } catch (e) {
      setError(e instanceof Error ? e.message : "Request failed");
      return false;
    } finally {
      setBusy(false);
    }
  }
  if (!state)
    return (
      <div className="loading">
        <div className="brandmark">
          <Command />
        </div>
        <h1>Boss Bot</h1>
        <p>
          {offline
            ? "Couldn’t connect to Boss Bot. Check that the server is running."
            : "Opening your workspace…"}
        </p>
        {offline && (
          <button onClick={() => location.reload()}>Try again</button>
        )}
      </div>
    );
  const pending = state.tasks.filter((t) => t.status === "awaiting_approval"),
    running = state.tasks.filter((t) =>
      ["running", "stopping"].includes(t.status),
    ),
    completed = state.tasks.filter((t) => t.status === "completed");
  const available = state.runtimes.filter(
    (r) => r.available && r.id !== "claude-native",
  );
  const currentTask = task
    ? state.tasks.find((t) => t.id === task.id) || task
    : null;
  const filteredTasks = filterTasks(
    state.tasks,
    state.agents,
    state.runtimes,
    query,
    statusFilter,
  );
  function go(p: Page) {
    setPage(p);
    setMobile(false);
    setQuery("");
    setStatusFilter("all");
  }
  function taskRows(list: Task[], emptyKind = "default") {
    return list.length ? (
      <div className="tasklist">
        {list.map((t) => (
          <button className="taskrow" key={t.id} onClick={() => setTask(t)}>
            <span
              className={
                "avatar small " +
                (state!.agents.find((a) => a.id === t.agentId)?.color || "blue")
              }
            >
              {state!.agents.find((a) => a.id === t.agentId)?.name[0]}
            </span>
            <span className="taskname">
              <strong>{t.prompt}</strong>
              <small>
                {state!.agents.find((a) => a.id === t.agentId)?.name}{" "}
                <span className="dotsep">•</span>{" "}
                {state!.runtimes.find((r) => r.id === t.runtimeId)?.name ||
                  "Disconnected account"}
                {t.execution?.workspace && (
                  <span className="taskkind">
                    <Terminal size={12} /> Coding
                  </span>
                )}
              </small>
            </span>
            <time className="taskdate" dateTime={t.createdAt}>
              {new Date(t.createdAt).toLocaleDateString(undefined, {
                month: "short",
                day: "numeric",
              })}
            </time>
            <span className={"badge " + t.status}>{labels[t.status]}</span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    ) : (
      <div className="empty">
        <Workflow size={27} />
        <h3>
          {emptyKind === "approvals"
            ? "You’re all caught up"
            : query || statusFilter !== "all"
              ? "No matching tasks"
              : "Your next task starts here"}
        </h3>
        <p>
          {emptyKind === "approvals"
            ? "New tasks appear here for review before they run."
            : query || statusFilter !== "all"
              ? "Try another search or clear your filters."
              : "Choose a teammate, describe the outcome, and review before running."}
        </p>
        {emptyKind !== "approvals" && (
          <button
            className="textbutton"
            onClick={() => {
              if (query || statusFilter !== "all") {
                setQuery("");
                setStatusFilter("all");
              } else if (!available.length) go("Connections");
              else setDialog("task");
            }}
          >
            {query || statusFilter !== "all"
              ? "Clear filters"
              : !available.length
                ? "Connect an account"
                : "Create a task"}{" "}
            <ArrowRight size={16} />
          </button>
        )}
      </div>
    );
  }
  function agentCards() {
    return (
      <div className="agentgrid">
        {state!.agents
          .filter((a) =>
            (a.name + " " + a.role).toLowerCase().includes(query.toLowerCase()),
          )
          .map((a) => (
            <button
              className="agentcard"
              key={a.id}
              onClick={() => setSelected(a)}
            >
              <div className="agenttop">
                <span className={"avatar " + a.color}>{a.name[0]}</span>
                <span className="agentstate">
                  <i
                    className={
                      running.some((t) => t.agentId === a.id) ? "working" : ""
                    }
                  />
                  {running.some((t) => t.agentId === a.id)
                    ? "Working"
                    : "Ready for a task"}
                </span>
              </div>
              <h3>{a.name}</h3>
              <p>{a.role}</p>
              <div className="agentbottom">
                <span>
                  <BookOpen size={14} />
                  {a.memory ? "Memory saved" : "No memory yet"}
                </span>
                <ArrowUpRight size={18} />
              </div>
            </button>
          ))}
        <button className="addagent" onClick={() => setDialog("agent")}>
          <span>
            <Plus size={22} />
          </span>
          <strong>Add a teammate</strong>
          <small>Give your next agent a specialty</small>
        </button>
      </div>
    );
  }
  return (
    <div className="shell">
      <aside className={"sidebar " + (mobile ? "open" : "")}>
        <a
          className="brand"
          href="#"
          onClick={(e) => {
            e.preventDefault();
            go("Overview");
          }}
        >
          <span className="brandmark">
            <Command size={23} />
          </span>
          Boss Bot
        </a>
        <div className="workspace">
          <div className="workspaceicon">B</div>
          <div>
            <strong>My workspace</strong>
            <small>Local workspace</small>
          </div>
        </div>
        <div className="navlabel">Workspace</div>
        <nav>
          {(Object.keys(icons) as Page[]).map((p) => {
            const Icon = icons[p];
            return (
              <button
                key={p}
                className={page === p ? "active" : ""}
                aria-current={page === p ? "page" : undefined}
                onClick={() => go(p)}
              >
                <Icon size={19} />
                {p}
                {p === "Approvals" && pending.length > 0 && (
                  <span className="navcount">{pending.length}</span>
                )}
              </button>
            );
          })}
        </nav>
        <div className="sidebarbottom">
          <div className="owner">
            <ShieldCheck size={20} />
            <div>
              <strong>You’re in control</strong>
              <p>Every task starts with your approval.</p>
            </div>
          </div>
          <div className="profile">
            <div className="profilepic">Y</div>
            <div>
              <strong>Your workspace</strong>
              <small>Owner access</small>
            </div>
            <span className="online" />
          </div>
        </div>
      </aside>
      <div className="main">
        <header className="topbar">
          <button
            className="iconbutton mobiletoggle"
            aria-label="Toggle navigation"
            aria-expanded={mobile}
            onClick={() => setMobile(!mobile)}
          >
            <PanelLeft size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </div>
          <div className="topright">
            <span
              className={"local " + (offline ? "offline" : "")}
              role="status"
            >
              <i /> {offline ? "Connection lost" : "Connected locally"}
            </span>
            <span className="local-version">Local preview</span>
          </div>
        </header>
        <main>
          <div className="pageheading">
            <div>
              <h1>{page === "Overview" ? "Your workspace" : page}</h1>
              <p>
                {
                  {
                    Overview:
                      "A clear view of your team, accounts, and work in progress.",
                    "Your team":
                      "Persistent teammates with their own purpose and memory.",
                    Tasks:
                      "Every assignment, from first direction to final result.",
                    Approvals:
                      "Review the task and its runtime before work begins.",
                    Connections: "Your accounts, your choice of runtime.",
                  }[page]
                }
              </p>
            </div>
            <button
              className="primary"
              onClick={() => setDialog(page === "Your team" ? "agent" : "task")}
            >
              <Plus size={18} />
              {page === "Your team" ? "Add teammate" : "New task"}
            </button>
          </div>
          {offline && (
            <div className="offline-banner" role="alert">
              <WifiOff size={18} />
              <div>
                <strong>Connection interrupted</strong>
                <p>
                  Showing the last saved state. Changes will refresh when the
                  server reconnects.
                </p>
              </div>
              <button onClick={() => refresh().catch(() => setOffline(true))}>
                Reconnect
              </button>
            </div>
          )}
          {error && (
            <div role="alert" className="alert">
              {error}
              <button aria-label="Dismiss error" onClick={() => setError("")}>
                <X size={16} />
              </button>
            </div>
          )}
          {notice && (
            <div role="status" className="notice">
              {notice}
              <button
                aria-label="Dismiss notification"
                onClick={() => setNotice("")}
              >
                <X size={16} />
              </button>
            </div>
          )}
          {page === "Overview" && (
            <>
              <section className="overviewgrid">
                <div className="workbench">
                  <div className="workbench-heading">
                    <span className="workbench-icon">
                      <Command size={23} />
                    </span>
                    <span>Work, with oversight</span>
                  </div>
                  <h2>
                    {pending.length
                      ? pending.length +
                        (pending.length === 1
                          ? " task needs your review"
                          : " tasks need your review")
                      : running.length
                        ? "Your team is on it"
                        : "Ready for the next assignment"}
                  </h2>
                  <p>
                    {pending.length
                      ? "Check the instruction, account, and access before your teammate gets started."
                      : running.length
                        ? "Follow progress, review the activity, or stop a task when priorities change."
                        : "Give a teammate a clear outcome. Your accounts and approval stay in your hands."}
                  </p>
                  <button
                    className="primary"
                    onClick={() =>
                      pending.length
                        ? setTask(pending[0])
                        : running.length
                          ? setTask(running[0])
                          : !available.length
                            ? go("Connections")
                            : setDialog("task")
                    }
                  >
                    {pending.length
                      ? "Review next task"
                      : running.length
                        ? "View active work"
                        : !available.length
                          ? "Connect an account"
                          : "Create a task"}{" "}
                    <ArrowRight size={17} />
                  </button>
                  <div className="workbench-meta">
                    <span>{state.agents.length} teammates</span>
                    <span>{available.length} configured {available.length === 1 ? "account" : "accounts"}</span>
                    <span>Approval required</span>
                  </div>
                </div>
                <div className="pulse">
                  <div className="sectionheading">
                    <h2>Workspace pulse</h2>
                    <Activity size={18} />
                  </div>
                  <div className="pulserow">
                    <span>
                      <i className="tealdot" /> Working now
                    </span>
                    <strong>{running.length}</strong>
                  </div>
                  <div className="pulserow">
                    <span>
                      <i className="amberdot" /> Awaiting your review
                    </span>
                    <strong>{pending.length}</strong>
                  </div>
                  <div className="pulserow">
                    <span>
                      <i className="bluedot" /> Tasks completed
                    </span>
                    <strong>{completed.length}</strong>
                  </div>
                  <div className="pulsefooter">
                    <ShieldCheck size={15} /> Approval before execution
                  </div>
                </div>
              </section>
              {!completed.length && (
                <section className="getting-started">
                  <div>
                    <h2>Make it your workspace</h2>
                    <p>Three steps to your first result.</p>
                  </div>
                  <div className="setup-steps">
                    <button onClick={() => go("Connections")}>
                      <span className={available.length ? "step done" : "step"}>
                        {available.length ? <Check size={16} /> : "1"}
                      </span>
                      <span>
                        <strong>
                          {available.length
                            ? "Account configured"
                            : "Connect an account"}
                        </strong>
                        <small>Use your subscription or API account</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() =>
                        available.length ? setDialog("task") : go("Connections")
                      }
                    >
                      <span
                        className={state.tasks.length ? "step done" : "step"}
                      >
                        {state.tasks.length ? <Check size={16} /> : "2"}
                      </span>
                      <span>
                        <strong>Assign a clear outcome</strong>
                        <small>Choose a teammate and task access</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                    <button
                      onClick={() =>
                        pending.length ? setTask(pending[0]) : go("Tasks")
                      }
                    >
                      <span className="step">3</span>
                      <span>
                        <strong>Review and run</strong>
                        <small>Approve, follow progress, review results</small>
                      </span>
                      <ChevronRight size={16} />
                    </button>
                  </div>
                </section>
              )}
              <section>
                <div className="sectionheading">
                  <div>
                    <h2>
                      Your team{" "}
                      <span className="count">{state.agents.length}</span>
                    </h2>
                    <p>Choose a specialty. Add the context that matters.</p>
                  </div>
                  <button
                    className="textbutton"
                    onClick={() => go("Your team")}
                  >
                    View team <ArrowUpRight size={16} />
                  </button>
                </div>
                {agentCards()}
              </section>
              <section>
                <div className="sectionheading">
                  <h2>Recent work</h2>
                  <button className="textbutton" onClick={() => go("Tasks")}>
                    All tasks <ArrowUpRight size={16} />
                  </button>
                </div>
                {taskRows(state.tasks.slice(0, 5))}
              </section>
            </>
          )}
          {(page === "Your team" || page === "Tasks") && (
            <div className="search">
              <Search size={17} />
              <input
                aria-label="Search"
                value={query}
                onChange={(e) => setQuery(e.target.value)}
                placeholder={
                  page === "Tasks"
                    ? "Search tasks, teammates, accounts or paths…"
                    : "Find a teammate…"
                }
              />
            </div>
          )}
          {page === "Your team" && agentCards()}
          {page === "Tasks" && (
            <>
              <div className="task-toolbar">
                <div
                  className="status-tabs"
                  aria-label="Filter tasks by status"
                >
                  {[
                    ["all", "All tasks"],
                    ["awaiting_approval", "Needs review"],
                    ["running", "Running"],
                    ["completed", "Completed"],
                    ["failed", "Failed"],
                  ].map(([value, label]) => (
                    <button
                      key={value}
                      aria-pressed={statusFilter === value}
                      onClick={() => setStatusFilter(value)}
                    >
                      {label}
                    </button>
                  ))}
                </div>
                <label className="status-select">
                  Status
                  <select
                    aria-label="Task status"
                    value={statusFilter}
                    onChange={(e) => setStatusFilter(e.target.value)}
                  >
                    <option value="all">All statuses</option>
                    {Object.entries(labels).map(([id, label]) => (
                      <option key={id} value={id}>
                        {label}
                      </option>
                    ))}
                  </select>
                </label>
                <span className="muted">
                  {filteredTasks.length}{" "}
                  {filteredTasks.length === 1 ? "task" : "tasks"}
                </span>
              </div>
              {taskRows(filteredTasks)}
            </>
          )}
          {page === "Approvals" && (
            <>
              <div className="reviewintro">
                <ShieldCheck size={25} />
                <div>
                  <h3>Decisions stay with you</h3>
                  <p>
                    Approving starts the selected runtime and may use
                    subscription allowance or API credits. Tasks won’t
                    automatically switch accounts.
                  </p>
                </div>
              </div>
              {taskRows(pending, "approvals")}
            </>
          )}
          {page === "Connections" && (
            <>
              <ConnectionManager
                connections={state.connections || []}
                token={state.token}
                refresh={refresh}
              />
              <details className="host-runtimes">
                <summary>
                  Host configuration <span>Advanced</span>
                </summary>
                <h2>Environment accounts</h2>
                <div className="connectiongrid">
                  {state.runtimes
                    .filter(
                      (r) =>
                        !r.id.startsWith("connection:") &&
                        r.id !== "claude-native",
                    )
                    .map((r) => (
                      <article className="connection" key={r.id}>
                        <div className="sectionheading">
                          <div className={"providerlogo " + r.id}>
                            {r.name[0]}
                          </div>
                          <span
                            className={
                              "badge " +
                              (r.available ? "completed" : "disconnected")
                            }
                          >
                            {r.id === "claude-native"
                              ? "Manual workflow"
                              : r.available
                                ? "Configured"
                                : "Not configured"}
                          </span>
                        </div>
                        <h2>{r.name}</h2>
                        <p>{r.description}</p>
                        <div className="connectionfoot">
                          <span>
                            {r.id === "claude-native"
                              ? "Verify billing in Claude"
                              : r.billing === "api"
                                ? "API credits"
                                : "Your subscription"}
                          </span>
                          <span>
                            {r.capabilities.includes("coding")
                              ? "Text and coding"
                              : "Text tasks"}
                          </span>
                        </div>
                      </article>
                    ))}
                </div>
                <div className="setup">
                  <h2>Connect on your host</h2>
                  <p>
                    Set the provider key and model in your server environment,
                    then restart Boss Bot. Keys stay on the server.
                  </p>
                  <dl>
                    <dt>Codex</dt>
                    <dd>
                      Use a dedicated login directory with BOSS_CODEX_HOME. See
                      the README for the login command and CLI requirements.
                    </dd>
                    <dt>OpenAI</dt>
                    <dd>OPENAI_API_KEY and OPENAI_MODEL</dd>
                    <dt>Claude</dt>
                    <dd>ANTHROPIC_API_KEY and ANTHROPIC_MODEL</dd>
                    <dt>Gemini</dt>
                    <dd>GEMINI_API_KEY and GEMINI_MODEL</dd>
                  </dl>
                  <p className="muted">
                    Configured means settings are present. The first approved
                    task verifies provider access. Automatic fallback and
                    allowance reporting are planned.
                  </p>
                </div>
              </details>
            </>
          )}
          <footer>
            Boss Bot <span>Local workspace. Your accounts. Your approval.</span>
            <small>Foundation preview</small>
          </footer>
        </main>
      </div>
      {(dialog || selected || currentTask) && (
        <div
          className="overlay"
          onMouseDown={(e) => {
            if (e.target === e.currentTarget && !busy) {
              setDialog(null);
              setSelected(null);
              setTask(null);
            }
          }}
        >
          <Dialog
            title={
              dialog === "agent"
                ? "Add a teammate"
                : dialog === "task"
                  ? continuation
                    ? "Continue task"
                    : repeatTask
                      ? "Run task again"
                      : "Create a task"
                  : selected
                    ? selected.name
                    : "Task details"
            }
            onClose={() => {
              setDialog(null);
              setSelected(null);
              setTask(null);
            }}
          >
            {dialog === "agent" && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  if (
                    await mutate("/api/agents", "POST", Object.fromEntries(d))
                  ) {
                    setDialog(null);
                    setNotice("Your new teammate is ready.");
                  }
                }}
              >
                <label>
                  Name
                  <input
                    autoFocus
                    required
                    name="name"
                    maxLength={40}
                    placeholder="e.g. Scout"
                  />
                </label>
                <label>
                  Specialty
                  <input
                    required
                    name="role"
                    maxLength={80}
                    placeholder="e.g. Customer research"
                  />
                </label>
                <label>
                  How should they work?
                  <textarea
                    required
                    name="instructions"
                    maxLength={4000}
                    rows={4}
                    placeholder="Describe their purpose, approach, and boundaries."
                  />
                </label>
                <button className="primary" disabled={busy}>
                  Add teammate <Plus size={17} />
                </button>
              </form>
            )}
            {dialog === "task" && (
              <TaskComposer
                agents={state.agents}
                runtimes={available}
                initial={continuation || repeatTask}
                resume={!!continuation}
                busy={busy}
                onConnections={() => {
                  setDialog(null);
                  go("Connections");
                }}
                onCreate={async (data) => {
                  if (await mutate("/api/tasks", "POST", data)) {
                    setDialog(null);
                    go("Approvals");
                    setNotice("Task saved. Review it before work begins.");
                  }
                }}
              />
            )}
            {selected && (
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const memory = new FormData(e.currentTarget).get("memory");
                  if (
                    await mutate(`/api/agents/${selected.id}/memory`, "PUT", {
                      memory,
                    })
                  ) {
                    setSelected(null);
                    setNotice("Memory saved. It will inform future tasks.");
                  }
                }}
              >
                <span className={"avatar " + selected.color}>
                  {selected.name[0]}
                </span>
                <h3>{selected.role}</h3>
                <p className="instructions">{selected.instructions}</p>
                <label>
                  Persistent memory
                  <textarea
                    autoFocus
                    name="memory"
                    defaultValue={selected.memory}
                    rows={7}
                    maxLength={12000}
                    placeholder="Add team context, preferences, and lessons this agent should remember."
                  />
                </label>
                <p className="formhint">
                  Memory is included with future tasks, whichever runtime you
                  choose.
                </p>
                <button className="primary" disabled={busy}>
                  Save memory <Check size={16} />
                </button>
              </form>
            )}
            {currentTask && (
              <div className="taskdetail">
                <span className={"badge " + currentTask.status}>
                  {labels[currentTask.status]}
                </span>
                <h3>
                  {state.agents.find((a) => a.id === currentTask.agentId)?.name}{" "}
                  <span className="muted">
                    /{" "}
                    {
                      state.runtimes.find((r) => r.id === currentTask.runtimeId)
                        ?.name
                    }
                  </span>
                </h3>
                <p className="taskprompt">{currentTask.prompt}</p>
                {currentTask.execution?.workspace && (
                  <p className="approvalnote">
                    Coding workspace: {currentTask.execution.workspace}.
                    Approval permits file edits and commands in the local CLI.
                    Review the resulting diff and test output.
                  </p>
                )}
                <p className="formhint">
                  <Clock3 size={14} />{" "}
                  {new Date(currentTask.createdAt).toLocaleString()}
                </p>
                {currentTask.output && (
                  <div className="output">
                    <h4>
                      {currentTask.status === "completed"
                        ? currentTask.runtimeId === "claude-native"
                          ? "Result supplied by you"
                          : "Result"
                        : "Execution update"}
                    </h4>
                    <pre>{currentTask.output}</pre>
                  </div>
                )}
                <div className="task-controls">
                  {currentTask.status === "running" && (
                    <button
                      className="danger-button"
                      disabled={busy}
                      onClick={async () => {
                        if (
                          await mutate(
                            "/api/tasks/" + currentTask.id + "/stop",
                            "POST",
                            {},
                          )
                        )
                          setNotice(
                            "Stop requested. Any existing file changes are kept.",
                          );
                      }}
                    >
                      <Square size={15} />
                      Stop task
                    </button>
                  )}
                  {[
                    "completed",
                    "failed",
                    "interrupted",
                    "cancelled",
                    "rejected",
                  ].includes(currentTask.status) &&
                    currentTask.runtimeId !== "claude-native" && (
                      <button
                        className="secondary"
                        onClick={() => {
                          setRepeatTask(currentTask);
                          setContinuation(null);
                          setTask(null);
                          setDialog("task");
                        }}
                      >
                        <RotateCcw size={15} />
                        Run again
                      </button>
                    )}
                  {currentTask.output && (
                    <button
                      className="textbutton"
                      onClick={async () => {
                        try {
                          await navigator.clipboard.writeText(
                            currentTask.output,
                          );
                          setNotice("Output copied.");
                        } catch {
                          setError(
                            "Could not copy. Select the output and copy it manually.",
                          );
                        }
                      }}
                    >
                      <Copy size={15} />
                      Copy output
                    </button>
                  )}
                </div>
                <TaskHistory
                  id={currentTask.id}
                  updatedAt={currentTask.updatedAt}
                />
                {currentTask.status === "awaiting_native" && (
                  <NativeHandoff
                    key={currentTask.id}
                    id={currentTask.id}
                    busy={busy}
                    save={async (output) => {
                      if (
                        await mutate(
                          `/api/tasks/${currentTask.id}/native-result`,
                          "POST",
                          { output },
                        )
                      )
                        setNotice("Your reviewed Claude result is saved.");
                    }}
                  />
                )}
                {currentTask.status === "awaiting_approval" && (
                  <>
                    <p className="approvalnote">
                      {currentTask.runtimeId === "claude-native"
                        ? "Approving prepares a manual handoff. Run the task in Claude yourself; verify native billing before using "
                        : "Approving starts this task using "}
                      {state.runtimes.find(
                        (r) => r.id === currentTask.runtimeId,
                      )?.billing === "api"
                        ? "API credits"
                        : "subscription allowance"}
                      . No automatic fallback is enabled.
                    </p>
                    <div className="actions">
                      <button
                        className="secondary"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await mutate(
                              `/api/tasks/${currentTask.id}/reject`,
                              "POST",
                              {},
                            )
                          )
                            setTask(null);
                        }}
                      >
                        Decline
                      </button>
                      <button
                        className="primary"
                        disabled={busy}
                        onClick={async () => {
                          if (
                            await mutate(
                              `/api/tasks/${currentTask.id}/approve`,
                              "POST",
                              {},
                            )
                          )
                            setNotice(
                              currentTask.runtimeId === "claude-native"
                                ? "Handoff ready. Continue in your Claude Code session."
                                : "Task approved. Your teammate is getting started.",
                            );
                        }}
                      >
                        {currentTask.runtimeId === "claude-native"
                          ? "Approve handoff"
                          : "Approve & run"}{" "}
                        <Check size={16} />
                      </button>
                    </div>
                  </>
                )}
                {["running", "stopping"].includes(currentTask.status) && (
                  <p className="formhint">
                    {currentTask.status === "stopping"
                      ? "Stopping execution. Workspace access stays reserved until the process exits."
                      : "Work is in progress. This view updates automatically."}
                  </p>
                )}
                {currentTask.execution?.sessionId &&
                  ["completed", "failed", "interrupted", "cancelled"].includes(
                    currentTask.status,
                  ) && (
                    <button
                      className="secondary"
                      onClick={() => {
                        setContinuation(currentTask);
                        setTask(null);
                        setDialog("task");
                      }}
                    >
                      Continue task
                    </button>
                  )}
              </div>
            )}
            {error && (
              <p className="dialogerror" role="alert">
                {error}
              </p>
            )}
          </Dialog>
        </div>
      )}
    </div>
  );
}
function Dialog({
  title,
  onClose,
  children,
}: {
  title: string;
  onClose: () => void;
  children: React.ReactNode;
}) {
  const ref = React.useRef<HTMLDivElement>(null);
  useEffect(() => {
    const before = document.activeElement as HTMLElement;
    const el = ref.current;
    const selector = 'button,input,textarea,select,[tabindex="0"]';
    (el?.querySelector(selector) as HTMLElement)?.focus();
    function trap(e: KeyboardEvent) {
      if (e.key !== "Tab") return;
      const items = Array.from(
        el?.querySelectorAll<HTMLElement>(selector) || [],
      ).filter((x) => !x.hasAttribute("disabled"));
      const first = items[0],
        last = items.at(-1);
      if (e.shiftKey && document.activeElement === first) {
        e.preventDefault();
        last?.focus();
      } else if (!e.shiftKey && document.activeElement === last) {
        e.preventDefault();
        first?.focus();
      }
    }
    el?.addEventListener("keydown", trap);
    return () => {
      el?.removeEventListener("keydown", trap);
      before?.focus();
    };
  }, []);
  return (
    <div
      className="dialog"
      role="dialog"
      aria-modal="true"
      aria-labelledby="dialogtitle"
      ref={ref}
    >
      <div className="dialoghead">
        <h2 id="dialogtitle">{title}</h2>
        <button
          className="iconbutton"
          onClick={onClose}
          aria-label="Close dialog"
        >
          <X size={21} />
        </button>
      </div>
      {children}
    </div>
  );
}
createRoot(document.getElementById("root")!).render(<App />);
