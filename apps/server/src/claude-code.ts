import { spawn } from "node:child_process";
import { mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { AgentRuntime } from "../../../packages/core/src/index.ts";

/** Owner-operated CLI adapter. Authentication stays with the installed Claude Code. */
export function claudeCode(env: NodeJS.ProcessEnv): AgentRuntime {
  const childEnv: NodeJS.ProcessEnv = {
    PATH: env.PATH,
    HOME: env.HOME,
    TMPDIR: env.TMPDIR,
    CLAUDE_CONFIG_DIR: env.BOSS_CLAUDE_HOME,
    CLAUDE_CODE_SAFE_MODE: "1",
  };
  async function run(
    args: string[],
    cwd: string,
    input: string,
    signal: AbortSignal,
  ) {
    return new Promise<any>((resolve, reject) => {
      const child = spawn(env.BOSS_CLAUDE_BIN || "claude", args, {
        cwd,
        env: childEnv,
        signal,
        stdio: ["pipe", "pipe", "ignore"],
      });
      let output = "";
      let exceeded = false;
      child.stdout.on("data", (chunk) => {
        output += chunk.toString();
        if (Buffer.byteLength(output) > 1_000_000) {
          exceeded = true;
          child.kill("SIGKILL");
        }
      });
      child.stdin.on("error", () => {});
      child.stdin.end(input);
      child.on("error", () =>
        reject(
          new Error(
            "Claude Code could not start. Check the installed binary and account directory.",
          ),
        ),
      );
      child.on("close", (code) => {
        if (exceeded)
          return reject(
            new Error("Claude Code response exceeded the size limit."),
          );
        if (code !== 0)
          return reject(
            new Error(
              "Claude Code failed. Check its login, model access and subscription allowance. No API fallback was used.",
            ),
          );
        try {
          resolve(JSON.parse(output));
        } catch {
          reject(
            new Error(
              "Claude Code returned an unsupported response. Check the CLI version.",
            ),
          );
        }
      });
    });
  }
  return {
    info: {
      id: "claude-code",
      name: "Claude Code subscription",
      ownerId: "local",
      available: !!env.BOSS_CLAUDE_HOME,
      billing: "subscription",
      capabilities: ["text"],
      description:
        "Runs approved text tasks through your local Claude Code login. No API-key fallback; tools are disabled.",
    },
    async execute(input, signal) {
      if (!env.BOSS_CLAUDE_HOME)
        throw new Error("Configure a dedicated Claude Code login directory.");
      const cwd = await mkdtemp(join(tmpdir(), "boss-claude-"));
      try {
        const status = await run(["auth", "status", "--json"], cwd, "", signal);
        if (
          status.loggedIn !== true ||
          status.authMethod !== "claude.ai" ||
          !["pro", "max", "team", "enterprise"].includes(
            String(status.subscriptionType).toLowerCase(),
          )
        )
          throw new Error(
            "A verified Claude subscription login is required. Sign in through Claude Code for this directory. API and unknown authentication methods are refused.",
          );
        const args = [
          "--print",
          "--output-format",
          "json",
          "--safe-mode",
          "--setting-sources",
          "",
          "--tools",
          "",
          "--strict-mcp-config",
          "--mcp-config",
          '{"mcpServers":{}}',
          "--no-session-persistence",
          "--permission-mode",
          "dontAsk",
        ];
        if (env.BOSS_CLAUDE_MODEL) args.push("--model", env.BOSS_CLAUDE_MODEL);
        const result = await run(
          args,
          cwd,
          `${input.instructions}\n\nOwner-curated memory:\n${input.memory}\n\nTask:\n${input.prompt}`,
          signal,
        );
        if (
          result.is_error ||
          typeof result.result !== "string" ||
          !result.result.trim()
        )
          throw new Error(
            "Claude Code did not complete the task. Check model access and allowance. No fallback was used.",
          );
        return result.result.slice(0, 100000);
      } finally {
        await rm(cwd, { recursive: true, force: true });
      }
    },
  };
}
