import { claudeCode } from "./claude-code.ts";
import { spawn } from "node:child_process";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type {
  AgentRuntime,
  RuntimeInfo,
} from "../../../packages/core/src/index.ts";
const info = (
  id: string,
  name: string,
  available: boolean,
  billing: RuntimeInfo["billing"],
  description: string,
): RuntimeInfo => ({
  id,
  name,
  available,
  billing,
  description,
  ownerId: "local",
  capabilities: ["text"],
});
async function request(
  url: string,
  headers: Record<string, string>,
  body: unknown,
  signal: AbortSignal,
) {
  const response = await fetch(url, {
    method: "POST",
    redirect: "error",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
    signal,
  });
  if (!response.ok)
    throw new Error(
      `Provider returned HTTP ${response.status}. Check credentials, model access and allowance.`,
    );
  return response.json();
}
export function runtimes(env: NodeJS.ProcessEnv = process.env): AgentRuntime[] {
  return [
    claudeCode(env),
    {
      info: info(
        "claude-native",
        "Claude Code · native handoff",
        true,
        "subscription",
        "Prepare a task for your own Claude Code session. You run it there and paste the result back; Boss Bot does not execute it.",
      ),
      async execute() {
        throw new Error("Native Claude tasks require a user handoff.");
      },
    },
    {
      info: info(
        "codex",
        "Codex",
        !!env.BOSS_CODEX_HOME,
        "subscription",
        "Uses a dedicated local Codex login. Read-only sandbox; local files may be readable.",
      ),
      async execute(input, signal) {
        const dir = await mkdtemp(join(tmpdir(), "boss-codex-"));
        const output = join(dir, "answer.txt");
        try {
          await new Promise<void>((resolve, reject) => {
            const child = spawn(
              env.BOSS_CODEX_BIN || "codex",
              [
                "exec",
                "--ignore-user-config",
                "--ignore-rules",
                "--ephemeral",
                "--skip-git-repo-check",
                "--sandbox",
                "read-only",
                "-c",
                'approval_policy="never"',
                "-C",
                dir,
                "-o",
                output,
                "-",
              ],
              {
                signal,
                stdio: ["pipe", "ignore", "ignore"],
                env: {
                  PATH: env.PATH,
                  HOME: env.HOME,
                  CODEX_HOME: env.BOSS_CODEX_HOME,
                },
              },
            );
            child.stdin.on("error", () => {});
            child.stdin.end(
              `${input.instructions}\n\nOwner-curated memory:\n${input.memory}\n\nTask:\n${input.prompt}`,
            );
            child.on("error", () =>
              reject(
                new Error(
                  "Codex could not start. Check the configured binary and dedicated login.",
                ),
              ),
            );
            child.on("close", (code) =>
              code === 0
                ? resolve()
                : reject(
                    new Error(
                      "Codex execution failed. Check its dedicated login, version and allowance.",
                    ),
                  ),
            );
          });
          const answer = await readFile(output, "utf8");
          if (!answer.trim()) throw new Error("Codex returned no answer.");
          return answer.slice(0, 100000);
        } finally {
          await rm(dir, { recursive: true, force: true });
        }
      },
    },
    {
      info: info(
        "openai",
        "OpenAI API",
        !!(env.OPENAI_API_KEY && env.OPENAI_MODEL),
        "api",
        "Text generation billed to your configured OpenAI API key.",
      ),
      async execute(input, signal) {
        const data = await request(
          "https://api.openai.com/v1/responses",
          { Authorization: `Bearer ${env.OPENAI_API_KEY}` },
          {
            model: env.OPENAI_MODEL,
            instructions: input.instructions + "\nMemory:\n" + input.memory,
            input: input.prompt,
            max_output_tokens: 4096,
          },
          signal,
        );
        const text = data.output
          ?.flatMap((x: any) => x.content || [])
          .filter((x: any) => x.type === "output_text")
          .map((x: any) => x.text)
          .join("\n");
        if (!text) throw new Error("Provider returned no text.");
        return text;
      },
    },
    {
      info: info(
        "claude",
        "Claude API",
        !!(env.ANTHROPIC_API_KEY && env.ANTHROPIC_MODEL),
        "api",
        "Text generation through the Anthropic API. Subscription login is not supported.",
      ),
      async execute(input, signal) {
        const data = await request(
          "https://api.anthropic.com/v1/messages",
          {
            "x-api-key": env.ANTHROPIC_API_KEY!,
            "anthropic-version": "2023-06-01",
          },
          {
            model: env.ANTHROPIC_MODEL,
            max_tokens: 4096,
            system: input.instructions + "\nMemory:\n" + input.memory,
            messages: [{ role: "user", content: input.prompt }],
          },
          signal,
        );
        const text = data.content
          ?.filter((x: any) => x.type === "text")
          .map((x: any) => x.text)
          .join("\n");
        if (!text) throw new Error("Provider returned no text.");
        return text;
      },
    },
    {
      info: info(
        "gemini",
        "Gemini API",
        !!(env.GEMINI_API_KEY && env.GEMINI_MODEL),
        "api",
        "Text generation through the Gemini API. Account-based CLI connection is planned.",
      ),
      async execute(input, signal) {
        const data = await request(
          `https://generativelanguage.googleapis.com/v1beta/models/${encodeURIComponent(env.GEMINI_MODEL!)}:generateContent`,
          { "x-goog-api-key": env.GEMINI_API_KEY! },
          {
            systemInstruction: {
              parts: [
                { text: input.instructions + "\nMemory:\n" + input.memory },
              ],
            },
            contents: [{ parts: [{ text: input.prompt }] }],
            generationConfig: { maxOutputTokens: 4096 },
          },
          signal,
        );
        const text = data.candidates?.[0]?.content?.parts
          ?.map((x: any) => x.text || "")
          .join("\n");
        if (!text) throw new Error("Provider returned no text.");
        return text;
      },
    },
  ];
}
