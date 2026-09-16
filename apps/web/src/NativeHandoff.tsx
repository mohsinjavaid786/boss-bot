import { useEffect, useState } from "react";
export function NativeHandoff({
  id,
  busy,
  save,
}: {
  id: string;
  busy: boolean;
  save: (output: string) => Promise<void>;
}) {
  const [prompt, setPrompt] = useState("");
  const [error, setError] = useState("");
  const [copied, setCopied] = useState(false);
  useEffect(() => {
    let active = true;
    fetch(`/api/tasks/${id}/native-prompt`)
      .then(async (r) => {
        if (!r.ok) throw new Error("Could not load the approved task.");
        return r.json();
      })
      .then((value) => {
        if (active) setPrompt(value.prompt);
      })
      .catch((e) => {
        if (active) setError(e.message);
      });
    return () => {
      active = false;
    };
  }, [id]);
  return (
    <section className="native-handoff">
      <h4>Continue in your own Claude Code session</h4>
      <ol>
        <li>
          Open a terminal in the folder you want Claude to work on and run{" "}
          <code>claude</code>.
        </li>
        <li>
          Sign in through Claude’s own flow. Check <code>/status</code> and
          confirm your account and billing before submitting the task. Boss Bot
          cannot verify your native billing.
        </li>
        <li>
          Copy the approved task below into Claude. Review tool permissions in
          Claude itself.
        </li>
        <li>Paste the result below to save it in Boss Bot.</li>
      </ol>
      <p className="formhint">
        No task has been executed by Boss Bot. This uses your native session; no
        Claude subscription token is stored here.
      </p>
      {error && <p role="alert">{error}</p>}
      <label>
        Approved task context
        <textarea readOnly value={prompt} rows={7} />
      </label>
      <button
        className="secondary"
        disabled={!prompt}
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(prompt);
            setCopied(true);
          } catch {
            setError(
              "Select and copy the task text above. Clipboard access is unavailable.",
            );
          }
        }}
      >
        {copied ? "Copied" : "Copy task for Claude"}
      </button>
      <form
        onSubmit={(e) => {
          e.preventDefault();
          const data = new FormData(e.currentTarget);
          void save(String(data.get("output") || ""));
        }}
      >
        <label>
          Result from your Claude session
          <textarea
            name="output"
            required
            maxLength={24000}
            rows={7}
            placeholder="Paste the answer or work summary you reviewed in Claude."
            disabled={busy}
          />
        </label>
        <p className="formhint">
          Saved as a result supplied by you. Boss Bot does not verify external
          execution or usage.
        </p>
        <button className="primary" disabled={busy}>
          {busy ? "Saving…" : "Save reviewed result"}
        </button>
      </form>
    </section>
  );
}
