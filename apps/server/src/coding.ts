import { spawn, execFile } from "node:child_process";
import { promisify } from "node:util";
import { mkdtemp, readFile, realpath, rm, stat } from "node:fs/promises";
import { tmpdir } from "node:os";
import { isAbsolute, join } from "node:path";
import { StringDecoder } from "node:string_decoder";
import type { RuntimeInput } from "../../../packages/core/src/index.ts";

export async function workspacePath(path: string) {
  if (!isAbsolute(path))
    throw new Error("Use an absolute local workspace path.");
  const canonical = await realpath(path);
  if (!(await stat(canonical)).isDirectory())
    throw new Error("Workspace must be a directory.");
  return canonical;
}

/** Coding is opt-in for a trusted local owner; the CLI still owns authentication. */
export async function runCoding(
  provider: "claude-code" | "codex",
  env: NodeJS.ProcessEnv,
  input: RuntimeInput,
  signal: AbortSignal,
) {
  const cwd = await workspacePath(input.workspace!);
  if (
    input.resumeSessionId &&
    !/^[a-zA-Z0-9_-]{1,160}$/.test(input.resumeSessionId)
  )
    throw new Error("Invalid native session identifier.");
  const dir = await mkdtemp(join(tmpdir(), "boss-coding-"));
  const output = join(dir, "answer.txt");
  const claude = provider === "claude-code";
  const bin = claude
    ? env.BOSS_CLAUDE_BIN || "claude"
    : env.BOSS_CODEX_BIN || "codex";
  const childEnv = {
    PATH: env.PATH,
    HOME: env.HOME,
    TMPDIR: env.TMPDIR,
    ...(claude
      ? { CLAUDE_CONFIG_DIR: env.BOSS_CLAUDE_HOME, CLAUDE_CODE_SAFE_MODE: "1" }
      : { CODEX_HOME: env.BOSS_CODEX_HOME }),
    NODE_OPTIONS: "--max-old-space-size=3072",
  };
  const model =
    input.model || (claude ? env.BOSS_CLAUDE_MODEL : env.BOSS_CODEX_MODEL);
  const args = claude
    ? [
        "--print",
        "--output-format",
        "stream-json",
        "--verbose",
        "--safe-mode",
        "--setting-sources",
        "",
        "--tools",
        "Bash,Read,Edit,Write,Glob,Grep",
        "--strict-mcp-config",
        "--mcp-config",
        '{"mcpServers":{}}',
        "--permission-mode",
        "acceptEdits",
        "--settings",
        JSON.stringify({
          sandbox: {
            enabled: true,
            failIfUnavailable: true,
            autoAllowBashIfSandboxed: true,
          },
        }),
        ...(input.resumeSessionId ? ["--resume", input.resumeSessionId] : []),
      ]
    : [
        "exec",
        ...(input.resumeSessionId ? ["resume"] : []),
        "--json",
        "--ignore-user-config",
        "--ignore-rules",
        // Resume inherits restrictions from the stored session; never resume a text session.
        ...(!input.resumeSessionId
          ? ["--sandbox", "workspace-write", "--skip-git-repo-check"]
          : []),
        "-c",
        'approval_policy="never"',
        "-c",
        'sandbox_mode="workspace-write"',
        "--output-last-message",
        output,
      ];
  if (model) args.push("--model", model);
  if (!claude)
    args.push(...(input.resumeSessionId ? [input.resumeSessionId] : []), "-");
  const prompt = `${input.instructions}\n\nOwner-curated memory:\n${input.memory}\n\nTask:\n${input.prompt}`;
  let result = "";
  let failed = false;
  let limited = false;
  let finished = false;
  try {
    if (!claude) {
      try {
        const status = await promisify(execFile)(bin, ["login", "status"], {
          env: childEnv,
          signal,
          timeout: 10000,
          maxBuffer: 32000,
        });
        if (!/logged in using chatgpt/i.test(status.stdout + status.stderr))
          throw new Error("Not a ChatGPT login");
      } catch {
        throw new Error(
          "A ChatGPT subscription login is required for coding. Run codex login for the selected account. No API fallback was used.",
        );
      }
    }
    await new Promise<void>((resolve, reject) => {
      const child = spawn(bin, args, {
        cwd,
        env: childEnv,
        signal,
        detached: process.platform !== "win32",
        stdio: ["pipe", "pipe", "pipe"],
      });
      let buffer = "";
      let oversized = false;
      let startError = false;
      let killTimer: ReturnType<typeof setTimeout> | undefined;
      const decoder = new StringDecoder("utf8");
      const killTree = (signal: NodeJS.Signals) => {
        try {
          if (process.platform !== "win32" && child.pid)
            process.kill(-child.pid, signal);
          else child.kill(signal);
        } catch {
          /* Already exited. */
        }
      };
      const abort = () => {
        killTree("SIGTERM");
        killTimer = setTimeout(() => killTree("SIGKILL"), 2000);
        killTimer.unref();
      };
      signal.addEventListener("abort", abort, { once: true });
      const consume = (line: string) => {
        if (!line.trim()) return;
        try {
          const e = JSON.parse(line);
          const id = claude
            ? e.session_id
            : e.type === "thread.started"
              ? e.thread_id
              : undefined;
          if (typeof id === "string" && /^[a-zA-Z0-9_-]{1,160}$/.test(id))
            input.onSession?.(id);
          const text = claude
            ? e.type === "assistant"
              ? e.message?.content
                  ?.filter((c: any) => c.type === "text")
                  .map((c: any) => c.text)
                  .join("\n")
              : undefined
            : e.type === "item.completed" && e.item?.type === "agent_message"
              ? e.item.text
              : undefined;
          if (typeof text === "string") input.onProgress?.(text.slice(0, 8000));
          if (e.is_error || e.type === "turn.failed" || e.type === "error")
            failed = true;
          if (
            /usage.limit|rate.limit|quota|429|too many requests|(?:hit|reached|exceeded).{0,40}limit/i.test(
              JSON.stringify(e),
            ) &&
            failed
          )
            limited = true;
          if (claude && e.type === "result") {
            finished = true;
            if (typeof e.result === "string") result = e.result;
          }
          if (!claude && e.type === "turn.completed") finished = true;
        } catch {
          /* Ignore diagnostics that are not JSONL events. */
        }
      };
      child.stdout.on("data", (chunk) => {
        buffer += decoder.write(chunk);
        if (Buffer.byteLength(buffer) > 1_000_000) {
          oversized = true;
          killTree("SIGKILL");
          return;
        }
        let index;
        while ((index = buffer.indexOf("\n")) >= 0) {
          consume(buffer.slice(0, index));
          buffer = buffer.slice(index + 1);
        }
      });
      child.stderr.on("data", () => {}); // Do not persist raw CLI diagnostics or credentials.
      child.stdin.on("error", () => {});
      child.stdin.end(prompt);
      child.on("error", () => {
        startError = true;
      });
      child.on("close", (code) => {
        killTree("SIGKILL");
        signal.removeEventListener("abort", abort);
        if (killTimer) clearTimeout(killTimer);
        consume(buffer + decoder.end());
        if (signal.aborted)
          return reject(
            new Error(
              "Coding stopped or timed out. Review the workspace before continuing.",
            ),
          );
        if (startError)
          return reject(
            new Error(
              "Coding CLI could not start. Check its installation and login.",
            ),
          );
        if (oversized)
          return reject(new Error("Coding CLI event exceeded the size limit."));
        if (limited)
          return reject(
            new Error(
              "Subscription usage limit reached. Continue this task after the provider resets the limit. No API fallback was used.",
            ),
          );
        if (code !== 0 || failed || !finished)
          return reject(
            new Error(
              "Coding did not complete. Check the CLI login, model, sandbox support and allowance. Review changes before continuing. No API fallback was used.",
            ),
          );
        resolve();
      });
    });
    if (!claude) result = await readFile(output, "utf8");
    if (!result.trim()) throw new Error("Coding CLI returned no final answer.");
    return result.slice(0, 100000);
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
}
