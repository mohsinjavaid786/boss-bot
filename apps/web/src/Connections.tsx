import { useState } from "react";
import {
  Plus,
  Github,
  GitBranch,
  ExternalLink,
  ShieldCheck,
  X,
} from "lucide-react";
import type { SavedConnection } from "../../server/src/connections.ts";

type Repo = { id: string; name: string; url: string; private: boolean };
const names = {
  github: "GitHub",
  gitlab: "GitLab",
  codex: "Codex subscription",
  claude: "Claude API",
};
export function ConnectionManager({
  connections,
  token,
  refresh,
}: {
  connections: SavedConnection[];
  token: string;
  refresh: () => Promise<void>;
}) {
  const [adding, setAdding] = useState(false);
  const [provider, setProvider] = useState<keyof typeof names>("github");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState("");
  const [catalog, setCatalog] = useState<{
    id: string;
    label: string;
    items: Repo[];
    page: number;
    hasMore: boolean;
  } | null>(null);
  async function request(path: string, method: string, data: unknown = {}) {
    const response = await fetch(path, {
      method,
      headers: { "Content-Type": "application/json", "x-boss-token": token },
      body: JSON.stringify(data),
    });
    const value = await response.json();
    if (!response.ok)
      throw new Error(value.error || "Connection request failed.");
    return value;
  }
  async function action(work: () => Promise<void>) {
    setBusy(true);
    setError("");
    try {
      await work();
      await refresh();
    } catch (error) {
      setError(
        error instanceof Error ? error.message : "Connection request failed.",
      );
    } finally {
      setBusy(false);
    }
  }
  async function browse(c: { id: string; label: string }, page = 1) {
    await action(async () => {
      const result = await request(
        `/api/connections/${c.id}/repositories`,
        "POST",
        { page },
      );
      setCatalog({ ...result, id: c.id, label: c.label });
    });
  }
  return (
    <section className="managed-connections">
      <div className="sectionheading">
        <div>
          <h2>Your saved accounts</h2>
          <p>
            Keep work and personal connections separate. Choose an AI account
            when assigning a task.
          </p>
        </div>
        <button
          className="primary"
          onClick={() => setAdding(!adding)}
          disabled={busy}
        >
          {adding ? <X size={16} /> : <Plus size={16} />}{" "}
          {adding ? "Close setup" : "Add account"}
        </button>
      </div>
      {error && (
        <p role="alert" className="connection-error">
          {error}
        </p>
      )}
      {adding && (
        <form
          className="setup account-form"
          onSubmit={(e) => {
            e.preventDefault();
            const form = e.currentTarget;
            const data = Object.fromEntries(new FormData(form));
            void action(async () => {
              await request("/api/connections", "POST", data);
              form.reset();
              setAdding(false);
            });
          }}
        >
          <h3>Connect an account</h3>
          <label>
            Provider
            <select
              name="provider"
              value={provider}
              onChange={(e) =>
                setProvider(e.target.value as keyof typeof names)
              }
              disabled={busy}
            >
              {Object.entries(names).map(([id, name]) => (
                <option value={id} key={id}>
                  {name}
                </option>
              ))}
            </select>
          </label>
          <label>
            Account label
            <input
              name="label"
              placeholder="e.g. Engineering · work account"
              required
              maxLength={60}
              disabled={busy}
            />
          </label>
          {provider === "github" && (
            <p>
              Create a{" "}
              <a
                href="https://github.com/settings/personal-access-tokens/new"
                target="_blank"
                rel="noreferrer"
              >
                fine-grained GitHub token <ExternalLink size={13} />
              </a>{" "}
              for the repositories you want to browse. Read-only metadata is
              enough for this browser. Organization approval may be required.
            </p>
          )}
          {provider === "gitlab" && (
            <p>
              Create a{" "}
              <a
                href="https://gitlab.com/-/user_settings/personal_access_tokens"
                target="_blank"
                rel="noreferrer"
              >
                GitLab.com personal access token <ExternalLink size={13} />
              </a>{" "}
              with read_api. The browser lists projects where you are a member.
            </p>
          )}
          {provider === "codex" && (
            <div>
              <p>
                Sign in with ChatGPT through the official Codex CLI using a
                separate directory for each account. Then enter that directory
                below. Boss Bot uses the saved native login for approved tasks.
              </p>
              <pre>CODEX_HOME=/absolute/path/to/account codex login</pre>
              <p>
                Use an existing directory on this host. Subscription access is
                checked when a task runs; local files may be readable.
              </p>
            </div>
          )}
          {provider === "claude" && (
            <p>
              This connection uses <strong>API credits</strong>. Obtain a key
              from{" "}
              <a
                href="https://platform.claude.com/"
                target="_blank"
                rel="noreferrer"
              >
                Claude Console
              </a>
              . For a Claude subscription, use the native app described below.
            </p>
          )}
          <label>
            {provider === "codex"
              ? "Dedicated Codex directory"
              : provider === "claude"
                ? "API key"
                : "Access token"}
            <input
              key={provider}
              name="secret"
              type={provider === "codex" ? "text" : "password"}
              autoComplete="off"
              required
              maxLength={8000}
              disabled={busy}
            />
          </label>
          {provider === "claude" && (
            <label>
              Model ID
              <input
                name="model"
                required
                maxLength={120}
                placeholder="Enter a model available to your API account"
                disabled={busy}
              />
            </label>
          )}
          <p className="muted">
            <ShieldCheck size={14} /> Credentials are encrypted on this host and
            never returned to the browser. Saving does not run an AI task.
          </p>
          <button className="primary" disabled={busy}>
            {busy ? "Saving…" : "Save account"}
          </button>
        </form>
      )}
      {!connections.length && (
        <div className="setup">
          <h3>Bring your accounts</h3>
          <p>
            Add a Codex subscription for AI work, or connect GitHub and GitLab
            to browse your repositories. You can save multiple accounts from the
            same provider.
          </p>
        </div>
      )}
      <div className="connectiongrid">
        {connections.map((c) => (
          <article className="connection" key={c.id}>
            <div className="sectionheading">
              {c.provider === "github" ? (
                <Github />
              ) : c.provider === "gitlab" ? (
                <GitBranch />
              ) : (
                <ShieldCheck />
              )}
              <span
                className={`badge ${c.status === "verified" ? "completed" : "disconnected"}`}
              >
                {c.status === "verified"
                  ? "Verified"
                  : c.status === "needs_attention"
                    ? "Needs attention"
                    : "Saved · not verified"}
              </span>
            </div>
            <h2>{c.label}</h2>
            <p>
              {names[c.provider]}
              {c.identity ? ` · @${c.identity}` : ""}
            </p>
            <p className="muted">
              {c.provider === "claude"
                ? `API credits · ${c.model}`
                : c.provider === "codex"
                  ? "Your ChatGPT allowance · explicit task selection"
                  : "Read-only repository browser"}
            </p>
            <div className="account-actions">
              {(c.provider === "github" || c.provider === "gitlab") && (
                <>
                  <button
                    disabled={busy}
                    onClick={() =>
                      void action(async () => {
                        await request(
                          `/api/connections/${c.id}/verify`,
                          "POST",
                        );
                      })
                    }
                  >
                    Verify account
                  </button>
                  <button disabled={busy} onClick={() => void browse(c)}>
                    Repositories
                  </button>
                </>
              )}
              <button
                disabled={busy}
                onClick={() =>
                  void action(async () => {
                    await request(`/api/connections/${c.id}`, "DELETE");
                    if (catalog?.id === c.id) setCatalog(null);
                  })
                }
              >
                Disconnect
              </button>
            </div>
          </article>
        ))}
      </div>
      {catalog && (
        <section className="setup">
          <div className="sectionheading">
            <h3>{catalog.label} · repositories</h3>
            <button
              onClick={() => setCatalog(null)}
              aria-label="Close repository browser"
            >
              <X size={16} />
            </button>
          </div>
          <p className="muted">
            Browse repository links. Code checkout, bot access grants and pull
            requests are not connected yet.
          </p>
          {!catalog.items.length && (
            <p>
              No repositories on this page. Check token access and organization
              approval.
            </p>
          )}
          <ul className="repository-list">
            {catalog.items.map((r) => (
              <li key={r.id}>
                <a href={r.url} target="_blank" rel="noreferrer">
                  {r.name} <ExternalLink size={13} />
                </a>
                <span>{r.private ? "Private" : "Public"}</span>
              </li>
            ))}
          </ul>
          <div className="account-actions">
            <button
              disabled={busy || catalog.page === 1}
              onClick={() => void browse(catalog, catalog.page - 1)}
            >
              Previous
            </button>
            <span>Page {catalog.page}</span>
            <button
              disabled={busy || !catalog.hasMore}
              onClick={() => void browse(catalog, catalog.page + 1)}
            >
              Next
            </button>
          </div>
        </section>
      )}
      <aside className="setup">
        <h3>Using your Claude subscription</h3>
        <p>
          Sign in directly in the unmodified Claude Code or Claude app. Boss Bot
          does not collect Claude subscription tokens or route tasks through
          them. Native Claude sessions run separately from Boss Bot tasks.
        </p>
        <a
          href="https://code.claude.com/docs/en/remote-control"
          target="_blank"
          rel="noreferrer"
        >
          Set up native Claude Remote Control <ExternalLink size={13} />
        </a>
      </aside>
    </section>
  );
}
