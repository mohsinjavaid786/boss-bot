import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Store } from "./store.ts";
import { route, type AgentRuntime } from "../../../packages/core/src/index.ts";
async function body(req: IncomingMessage) {
  let value = "";
  for await (const part of req) {
    value += part;
    if (Buffer.byteLength(value) > 32000) throw new Error("Request too large");
  }
  return JSON.parse(value || "{}");
}
export function app(
  store: Store,
  providers: AgentRuntime[],
  webRoot = resolve("apps/web/dist"),
) {
  const token = randomBytes(32).toString("hex");
  const server = createServer(async (req, res) => {
    const send = (status: number, data: unknown) => {
      res.writeHead(status, {
        "Content-Type": "application/json",
        "Cache-Control": "no-store",
        "X-Content-Type-Options": "nosniff",
      });
      res.end(JSON.stringify(data));
    };
    try {
      const hostname = req.headers.host?.split(":")[0];
      if (!["localhost", "127.0.0.1"].includes(hostname || ""))
        return send(403, { error: "Local access only" });
      const url = new URL(req.url || "/", "http://localhost");
      if (url.pathname.startsWith("/api/")) {
        if (
          req.headers.origin &&
          ![
            "http://localhost:5173",
            "http://127.0.0.1:5173",
            `http://${req.headers.host}`,
          ].includes(req.headers.origin)
        )
          return send(403, { error: "Origin denied" });
        if (req.method !== "GET") {
          const candidate = Buffer.from(
            String(req.headers["x-boss-token"] || ""),
          );
          const expected = Buffer.from(token);
          if (
            candidate.length !== expected.length ||
            !timingSafeEqual(candidate, expected)
          )
            return send(403, { error: "Refresh the page and try again." });
          if (!req.headers["content-type"]?.startsWith("application/json"))
            return send(415, { error: "JSON required" });
        }
        if (req.method === "GET" && url.pathname === "/api/state")
          return send(200, {
            agents: store.agents(),
            tasks: store.tasks(),
            runtimes: providers.map((p) => p.info),
            token,
          });
        if (req.method === "POST" && url.pathname === "/api/agents") {
          const data = z
            .object({
              name: z.string().trim().min(1).max(40),
              role: z.string().trim().min(1).max(80),
              instructions: z.string().trim().min(1).max(4000),
            })
            .parse(await body(req));
          return send(201, {
            id: store.addAgent(data.name, data.role, data.instructions),
          });
        }
        const memory = url.pathname.match(/^\/api\/agents\/([^/]+)\/memory$/);
        if (req.method === "PUT" && memory) {
          const data = z
            .object({ memory: z.string().max(12000) })
            .parse(await body(req));
          store.memory(memory[1], data.memory);
          return send(200, { ok: true });
        }
        if (req.method === "POST" && url.pathname === "/api/tasks") {
          const data = z
            .object({
              agentId: z.string().uuid(),
              prompt: z.string().trim().min(1).max(8000),
              runtimeId: z.string(),
            })
            .parse(await body(req));
          route(
            providers.map((p) => p.info),
            "local",
            data.runtimeId,
            ["text"],
          );
          if (!store.agents().some((a) => a.id === data.agentId))
            return send(404, { error: "Agent not found" });
          return send(
            201,
            store.createTask(data.agentId, data.prompt, data.runtimeId),
          );
        }
        const action = url.pathname.match(
          /^\/api\/tasks\/([^/]+)\/(approve|reject|events)$/,
        );
        if (action) {
          const task = store.tasks().find((t) => t.id === action[1]);
          if (!task) return send(404, { error: "Task not found" });
          if (req.method === "GET" && action[2] === "events")
            return send(200, store.events(task.id));
          if (req.method === "POST" && action[2] === "reject")
            return send(store.reject(task.id) ? 200 : 409, { ok: true });
          if (req.method === "POST" && action[2] === "approve") {
            route(
              providers.map((p) => p.info),
              "local",
              task.runtimeId,
              ["text"],
            );
            if (!store.claim(task.id))
              return send(409, { error: "Task has already been reviewed." });
            const agent = store.agents().find((a) => a.id === task.agentId)!;
            const runtime = providers.find(
              (p) => p.info.id === task.runtimeId,
            )!;
            const signal = AbortSignal.timeout(180000);
            void runtime
              .execute(
                {
                  instructions: agent.instructions,
                  memory: agent.memory,
                  prompt: task.prompt,
                },
                signal,
              )
              .then((output) =>
                store.finish(task.id, "completed", output.slice(0, 100000)),
              )
              .catch((error) =>
                store.finish(
                  task.id,
                  "failed",
                  signal.aborted
                    ? "Execution timed out. Review before starting again."
                    : error instanceof Error
                      ? error.message
                      : "Execution failed.",
                ),
              );
            return send(202, { ok: true });
          }
        }
        return send(404, { error: "Not found" });
      }
      if (req.method !== "GET")
        return send(405, { error: "Method not allowed" });
      const requested = resolve(
        webRoot,
        "." + decodeURIComponent(url.pathname),
      );
      if (!requested.startsWith(webRoot + sep) && requested !== webRoot)
        return send(403, { error: "Invalid path" });
      let file = requested;
      let content: Buffer;
      try {
        content = await readFile(file);
      } catch {
        file = resolve(webRoot, "index.html");
        try {
          content = await readFile(file);
        } catch {
          return send(503, {
            error: "Build the web app with npm run build, or use npm run dev.",
          });
        }
      }
      const mime: Record<string, string> = {
        ".html": "text/html",
        ".js": "text/javascript",
        ".css": "text/css",
        ".svg": "image/svg+xml",
      };
      res.writeHead(200, {
        "Content-Type": mime[extname(file)] || "application/octet-stream",
        "X-Content-Type-Options": "nosniff",
        "Content-Security-Policy":
          "default-src 'self'; script-src 'self'; style-src 'self'; img-src 'self' data:; connect-src 'self'; frame-ancestors 'none'",
      });
      res.end(content);
    } catch (error) {
      send(400, {
        error:
          error instanceof z.ZodError
            ? "Check the required fields and text lengths."
            : error instanceof Error
              ? error.message
              : "Request failed",
      });
    }
  });
  return server;
}
