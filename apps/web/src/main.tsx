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
} from "lucide-react";
import type {
  Agent,
  Task,
  RuntimeInfo,
} from "../../../packages/core/src/index.ts";
import "./style.css";
import { ConnectionManager } from "./Connections";
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
  async function refresh() {
    const r = await fetch("/api/state");
    if (!r.ok)
      throw new Error(
        "Workspace could not load. Check that the server is running.",
      );
    setState(await r.json());
  }
  useEffect(() => {
    refresh().catch((e) => setError(e.message));
    const timer = setInterval(() => refresh().catch(() => {}), 3000);
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
      await refresh();
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
        <p>{error || "Opening your workspace…"}</p>
        {error && <button onClick={() => location.reload()}>Try again</button>}
      </div>
    );
  const pending = state.tasks.filter((t) => t.status === "awaiting_approval"),
    running = state.tasks.filter((t) => t.status === "running"),
    completed = state.tasks.filter((t) => t.status === "completed");
  const available = state.runtimes.filter((r) => r.available);
  const currentTask = task
    ? state.tasks.find((t) => t.id === task.id) || task
    : null;
  const filteredTasks = state.tasks.filter((t) =>
    t.prompt.toLowerCase().includes(query.toLowerCase()),
  );
  function go(p: Page) {
    setPage(p);
    setMobile(false);
    setQuery("");
  }
  function taskRows(list: Task[]) {
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
                {state!.runtimes.find((r) => r.id === t.runtimeId)?.name}
              </small>
            </span>
            <span className={"badge " + t.status}>{labels[t.status]}</span>
            <ChevronRight size={16} />
          </button>
        ))}
      </div>
    ) : (
      <div className="empty">
        <Workflow size={27} />
        <h3>No tasks here yet</h3>
        <p>Give an agent a clear goal. You’ll review it before work begins.</p>
        <button className="textbutton" onClick={() => setDialog("task")}>
          Create your first task <ArrowUpRight size={16} />
        </button>
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
          <ChevronRight size={15} />
        </div>
        <div className="navlabel">Workspace</div>
        <nav>
          {(Object.keys(icons) as Page[]).map((p) => {
            const Icon = icons[p];
            return (
              <button
                key={p}
                className={page === p ? "active" : ""}
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
            onClick={() => setMobile(!mobile)}
          >
            <PanelLeft size={20} />
          </button>
          <div className="breadcrumb">
            Workspace <ChevronRight size={14} /> <strong>{page}</strong>
          </div>
          <div className="topright">
            <span className="local">
              <i /> Local instance
            </span>
            <span className="profilepic mini">Y</span>
          </div>
        </header>
        <main>
          <div className="pageheading">
            <div>
              <p className="greeting">
                {page === "Overview"
                  ? "A little direction. A lot of possibility."
                  : "Your AI workspace"}
              </p>
              <h1>{page === "Overview" ? "Good work starts here." : page}</h1>
              <p>
                {
                  {
                    Overview:
                      "Give your team a goal. Keep the important decisions yours.",
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
                <div className="direction">
                  <div className="directioncontent">
                    <span className="directionicon">
                      <Sparkles size={23} />
                    </span>
                    <h2>
                      Meet your next
                      <br />
                      great team.
                    </h2>
                    <p>
                      Researchers, writers, and organizers.
                      <br />A shared purpose. Your direction.
                    </p>
                    <button onClick={() => go("Your team")}>
                      Explore your team <ArrowUpRight size={17} />
                    </button>
                  </div>
                  <div className="teamart" aria-hidden="true">
                    <div className="orbit o1" />
                    <div className="orbit o2" />
                    <div className="artavatar av1">A</div>
                    <div className="artavatar av2">N</div>
                    <div className="artavatar av3">M</div>
                    <div className="artcenter">
                      <Command size={32} />
                    </div>
                    <div className="artchip">
                      <span /> Together, on purpose
                    </div>
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
              {!available.length && (
                <div className="connectbanner">
                  <div className="connecticon">
                    <Zap size={20} />
                  </div>
                  <div>
                    <strong>Connect the intelligence behind your team</strong>
                    <p>Add a supported runtime to start assigning real work.</p>
                  </div>
                  <button onClick={() => go("Connections")}>
                    Set up a connection <ChevronRight size={16} />
                  </button>
                </div>
              )}
              <section>
                <div className="sectionheading">
                  <div>
                    <h2>
                      Your team{" "}
                      <span className="count">{state.agents.length}</span>
                    </h2>
                    <p>A familiar face for every kind of work.</p>
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
                  page === "Tasks" ? "Find a task…" : "Find a teammate…"
                }
              />
            </div>
          )}
          {page === "Your team" && agentCards()}
          {page === "Tasks" && taskRows(filteredTasks)}
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
              {taskRows(pending)}
            </>
          )}
          {page === "Connections" && (
            <>
              <ConnectionManager
                connections={state.connections || []}
                token={state.token}
                refresh={refresh}
              />
              <h2>Host environment runtimes</h2>
              <div className="connectiongrid">
                {state.runtimes
                  .filter((r) => !r.id.startsWith("connection:"))
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
                          {r.available ? "Configured" : "Not configured"}
                        </span>
                      </div>
                      <h2>{r.name}</h2>
                      <p>{r.description}</p>
                      <div className="connectionfoot">
                        <span>
                          {r.billing === "api"
                            ? "API credits"
                            : "Your subscription"}
                        </span>
                        <span>Text tasks</span>
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
                  Configured means settings are present. The first approved task
                  verifies provider access. Automatic fallback and allowance
                  reporting are planned.
                </p>
              </div>
            </>
          )}
          <footer>
            Boss Bot <span>Your team. Your direction.</span>
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
                  ? "Give your team a goal"
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
              <form
                onSubmit={async (e) => {
                  e.preventDefault();
                  const d = new FormData(e.currentTarget);
                  if (
                    await mutate("/api/tasks", "POST", Object.fromEntries(d))
                  ) {
                    setDialog(null);
                    go("Approvals");
                    setNotice("Task saved. Review it to start work.");
                  }
                }}
              >
                <label>
                  Teammate
                  <select name="agentId">
                    {state.agents.map((a) => (
                      <option key={a.id} value={a.id}>
                        {a.name} — {a.role}
                      </option>
                    ))}
                  </select>
                </label>
                <label>
                  What should they do?
                  <textarea
                    autoFocus
                    name="prompt"
                    required
                    maxLength={8000}
                    rows={5}
                    placeholder="Give a clear goal, useful context, and the result you need."
                  />
                </label>
                <label>
                  Runtime
                  <select name="runtimeId" required defaultValue="">
                    <option value="" disabled>
                      Select a configured runtime
                    </option>
                    {available.map((r) => (
                      <option key={r.id} value={r.id}>
                        {r.name} —{" "}
                        {r.billing === "api"
                          ? "uses API credits"
                          : "uses subscription"}
                      </option>
                    ))}
                  </select>
                </label>
                {!available.length && (
                  <p className="formhint">
                    Set up a runtime in Connections before creating a task.
                  </p>
                )}
                <p className="formhint">
                  <ShieldCheck size={15} /> You’ll review this task before
                  execution.
                </p>
                <button
                  className="primary"
                  disabled={busy || !available.length}
                >
                  Send for approval <Send size={16} />
                </button>
              </form>
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
                <p className="formhint">
                  <Clock3 size={14} />{" "}
                  {new Date(currentTask.createdAt).toLocaleString()}
                </p>
                {currentTask.output && (
                  <div className="output">
                    <h4>
                      {currentTask.status === "completed"
                        ? "Result"
                        : "Execution update"}
                    </h4>
                    <pre>{currentTask.output}</pre>
                  </div>
                )}
                {currentTask.status === "awaiting_approval" && (
                  <>
                    <p className="approvalnote">
                      Approving starts this task using{" "}
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
                              "Task approved. Your teammate is getting started.",
                            );
                        }}
                      >
                        Approve & run <Check size={16} />
                      </button>
                    </div>
                  </>
                )}
                {currentTask.status === "running" && (
                  <p className="formhint">
                    Work is in progress. This view updates automatically.
                  </p>
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
