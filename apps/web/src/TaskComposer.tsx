import { useState } from "react";
import { Code2, FileText, ShieldCheck, ArrowRight, Zap } from "lucide-react";
import type {
  Agent,
  RuntimeInfo,
  Task,
} from "../../../packages/core/src/index.ts";

export function TaskComposer({
  agents,
  runtimes,
  initial,
  resume,
  busy,
  onCreate,
  onConnections,
}: {
  agents: Agent[];
  runtimes: RuntimeInfo[];
  initial?: Task | null;
  resume: boolean;
  busy: boolean;
  onCreate: (data: Record<string, string>) => Promise<void>;
  onConnections: () => void;
}) {
  const [agentId, setAgent] = useState(initial?.agentId || agents[0]?.id || "");
  const [runtimeId, setRuntime] = useState(initial?.runtimeId || "");
  const [prompt, setPrompt] = useState(resume ? "" : initial?.prompt || "");
  const [coding, setCoding] = useState(!!initial?.execution?.workspace);
  const [workspace, setWorkspace] = useState(
    initial?.execution?.workspace || "",
  );
  const [model, setModel] = useState(initial?.execution?.model || "");
  const [validation, setValidation] = useState("");
  const runtime = runtimes.find((r) => r.id === runtimeId);
  const canCode = runtime?.capabilities.includes("coding");
  const isCoding = coding && canCode;
  return (
    <form
      className="task-composer"
      onSubmit={async (e) => {
        e.preventDefault();
        setValidation("");
        if (!runtime?.available) return;
        if (isCoding && model && !/^[a-zA-Z0-9._:/-]*$/.test(model)) {
          setValidation(
            "Use the provider’s model ID without spaces or special characters.",
          );
          return;
        }
        await onCreate({
          agentId,
          runtimeId,
          prompt,
          workspace: isCoding ? workspace : "",
          model: isCoding ? model : "",
          resumeTaskId: resume ? initial?.id || "" : "",
        });
      }}
    >
      {resume && (
        <div className="context-note">
          <Code2 size={18} />
          <div>
            <strong>Continue the same conversation</strong>
            <p>
              Your teammate, account and workspace stay with this session.
              Describe the next step below.
            </p>
          </div>
        </div>
      )}
      <label>
        {resume ? "Next instruction" : "What needs to get done?"}
        <textarea
          autoFocus
          name="prompt"
          required
          maxLength={8000}
          rows={5}
          value={prompt}
          onChange={(e) => setPrompt(e.target.value)}
          placeholder="Describe the outcome, useful context, and how to check the result."
          disabled={busy}
        />
      </label>
      <div className="form-columns">
        <label>
          Teammate
          <select
            name="agentId"
            aria-label="Teammate"
            value={agentId}
            onChange={(e) => setAgent(e.target.value)}
            disabled={busy || resume}
          >
            {agents.map((a) => (
              <option key={a.id} value={a.id}>
                {a.name} — {a.role}
              </option>
            ))}
          </select>
        </label>
        <label>
          Account
          <select
            name="runtimeId"
            aria-label="Account"
            value={runtimeId}
            required
            onChange={(e) => setRuntime(e.target.value)}
            disabled={busy || resume}
          >
            <option value="" disabled>
              Select an account
            </option>
            {initial && !runtimes.some((r) => r.id === initial.runtimeId) && (
              <option value={initial.runtimeId} disabled>
                Account disconnected
              </option>
            )}
            {runtimes.map((r) => (
              <option key={r.id} value={r.id}>
                {r.name}
              </option>
            ))}
          </select>
        </label>
      </div>
      {!runtimes.length && (
        <div className="context-note">
          <Zap size={18} />
          <div>
            <strong>Connect an account first</strong>
            <p>
              Use your Claude or ChatGPT subscription, or explicitly choose API
              billing.
            </p>
            <button
              type="button"
              className="textbutton"
              onClick={onConnections}
            >
              Open connections <ArrowRight size={15} />
            </button>
          </div>
        </div>
      )}
      {resume && !runtime && (
        <p className="dialogerror" role="alert">
          This account is no longer available. Run the task again with an active
          account to start a fresh session.
        </p>
      )}
      {canCode && (
        <fieldset className="task-mode" disabled={busy || resume}>
          <legend>Task access</legend>
          <div>
            <button
              type="button"
              aria-pressed={!coding}
              onClick={() => setCoding(false)}
            >
              <FileText size={17} />
              <span>
                Text task<small>Write, research or plan</small>
              </span>
            </button>
            <button
              type="button"
              aria-pressed={coding}
              onClick={() => setCoding(true)}
            >
              <Code2 size={17} />
              <span>
                Coding task<small>Edit files and run commands</small>
              </span>
            </button>
          </div>
        </fieldset>
      )}
      {isCoding && (
        <div className="workspace-fields">
          <label>
            Workspace path
            <input
              name="workspace"
              value={workspace}
              onChange={(e) => setWorkspace(e.target.value)}
              required
              maxLength={4096}
              placeholder="/absolute/path/to/your-project"
              disabled={busy || resume}
            />
            <small>An existing checkout on the machine running Boss Bot.</small>
          </label>
          <label>
            Model <span className="optional">Optional</span>
            <input
              name="model"
              value={model}
              onChange={(e) => setModel(e.target.value)}
              maxLength={120}
              placeholder="Use the account default"
              disabled={busy}
            />
          </label>
        </div>
      )}
      {runtime && (
        <div className="billing-summary">
          <span>
            {runtime.billing === "api"
              ? "Uses API credits"
              : runtime.billing === "subscription"
                ? "Uses your subscription"
                : "Local runtime"}
          </span>
          <span>
            {isCoding
              ? "File edits and commands · 30 min limit"
              : "Text task · 3 min limit"}
          </span>
        </div>
      )}
      {validation && (
        <p className="dialogerror" role="alert">
          {validation}
        </p>
      )}
      <div className="composer-footer">
        <p>
          <ShieldCheck size={16} />
          You review and approve before work starts.
        </p>
        <button className="primary" disabled={busy || !runtime?.available}>
          {busy ? "Saving task…" : "Review task"} <ArrowRight size={16} />
        </button>
      </div>
    </form>
  );
}
