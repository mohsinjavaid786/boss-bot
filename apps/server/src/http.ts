import { createServer, type IncomingMessage } from "node:http";
import { readFile } from "node:fs/promises";
import { resolve, extname, sep } from "node:path";
import { randomBytes, timingSafeEqual } from "node:crypto";
import { z } from "zod";
import { Connections, connectionInput } from "./connections.ts";
import { Store } from "./store.ts";
import { route, type AgentRuntime } from "../../../packages/core/src/index.ts";
import { workspacePath } from "./coding.ts";
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
  connections?: Connections,
) {
  const token = randomBytes(32).toString("hex");
  const busyWorkspaces = new Set<string>();
  const executions = new Map<string, AbortController>();
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
      const activeProviders = [
        ...providers,
        ...(connections?.runtimes() || []),
      ];
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
            runtimes: activeProviders.map((p) => p.info),
            connections: connections?.list() || [],
            token,
          });
        if (
          connections &&
          req.method === "POST" &&
          url.pathname === "/api/connections"
        ) {
          return send(
            201,
            connections.add(connectionInput.parse(await body(req))),
          );
        }
        const connectionAction = url.pathname.match(
          /^\/api\/connections\/([^/]+)(?:\/(verify|repositories))?$/,
        );
        if (connections && connectionAction) {
          const id = z.string().uuid().parse(connectionAction[1]);
          if (req.method === "DELETE" && !connectionAction[2]) {
            connections.remove(id);
            return send(200, { ok: true });
          }
          if (req.method === "POST" && connectionAction[2] === "verify")
            return send(200, await connections.verify(id));
          if (req.method === "POST" && connectionAction[2] === "repositories") {
            const { page } = z
              .object({ page: z.number().int().min(1).max(1000).default(1) })
              .parse(await body(req));
            return send(200, await connections.repositories(id, page));
          }
        }
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
              workspace: z.string().trim().max(4096).default(""),
              model: z
                .string()
                .trim()
                .max(120)
                .regex(/^[a-zA-Z0-9._:/-]*$/)
                .default(""),
              resumeTaskId: z
                .union([z.string().uuid(), z.literal("")])
                .default(""),
            })
            .parse(await body(req));
          route(
            activeProviders.map((p) => p.info),
            "local",
            data.runtimeId,
            data.workspace ? ["text", "coding"] : ["text"],
          );
          if (!store.agents().some((a) => a.id === data.agentId))
            return send(404, { error: "Agent not found" });
          const workspace = data.workspace
            ? await workspacePath(data.workspace)
            : undefined;
          if ((data.model || data.resumeTaskId) && !workspace)
            throw new Error(
              "Model selection and continuation require a coding workspace.",
            );
          if (data.resumeTaskId) {
            const parent = store
              .tasks()
              .find((t) => t.id === data.resumeTaskId);
            if (
              !parent?.execution?.sessionId ||
              parent.runtimeId !== data.runtimeId ||
              parent.agentId !== data.agentId ||
              parent.execution.workspace !== workspace ||
              !["completed", "failed", "interrupted", "cancelled"].includes(parent.status)
            )
              throw new Error(
                "Continue a finished coding task using the same teammate, account and workspace.",
              );
          }
          return send(
            201,
            store.createTask(
              data.agentId,
              data.prompt,
              data.runtimeId,
              workspace
                ? {
                    workspace,
                    model: data.model,
                    resumeTaskId: data.resumeTaskId,
                  }
                : undefined,
            ),
          );
        }
        const action = url.pathname.match(
          /^\/api\/tasks\/([^/]+)\/(approve|reject|stop|events|native-prompt|native-result)$/,
        );
        if (action) {
          const task = store.tasks().find((t) => t.id === action[1]);
          if (!task) return send(404, { error: "Task not found" });
          if (req.method === "POST" && action[2] === "stop") {
            const controller = executions.get(task.id);
            if (!controller || !store.requestStop(task.id)) return send(409, { error: "Only a running task can be stopped." });
            controller.abort();
            return send(202, { ok: true });
          }
          if (req.method === "GET" && action[2] === "events")
            return send(200, store.events(task.id));
          if (req.method === "GET" && action[2] === "native-prompt")
            return send(200, { prompt: store.nativePrompt(task.id) });
          if (req.method === "POST" && action[2] === "native-result") {
            const { output } = z
              .object({ output: z.string().trim().min(1).max(24000) })
              .parse(await body(req));
            return send(store.importNative(task.id, output) ? 200 : 409, {
              ok: true,
            });
          }
          if (req.method === "POST" && action[2] === "reject")
            return send(store.reject(task.id) ? 200 : 409, { ok: true });
          if (req.method === "POST" && action[2] === "approve") {
            route(
              activeProviders.map((p) => p.info),
              "local",
              task.runtimeId,
              task.execution?.workspace ? ["text", "coding"] : ["text"],
            );
            if (task.runtimeId === "claude-native")
              return send(store.handoff(task.id) ? 202 : 409, { ok: true });
            const workspace = task.execution?.workspace;
            if (workspace) {
              if ((await workspacePath(workspace)) !== workspace)
                throw new Error(
                  "Workspace changed. Create a new task after reviewing it.",
                );
              if (busyWorkspaces.has(workspace))
                return send(409, {
                  error:
                    "This workspace is already running a coding task. Wait for it to finish.",
                });
            }
            if (!store.claim(task.id))
              return send(409, { error: "Task has already been reviewed." });
            const agent = store.agents().find((a) => a.id === task.agentId)!;
            const runtime = activeProviders.find(
              (p) => p.info.id === task.runtimeId,
            )!;
            if (workspace) busyWorkspaces.add(workspace);
            const parent = store
              .tasks()
              .find((t) => t.id === task.execution?.resumeTaskId);
            const controller = new AbortController();
            executions.set(task.id, controller);
            const signal = AbortSignal.any([controller.signal, AbortSignal.timeout(workspace ? 1800000 : 180000)]);
            const finishCancelled = () => store.finish(task.id, "cancelled", ((store.tasks().find(t => t.id === task.id)?.output || "") + "\nStopped by you. Review any file changes before running again.").trim());
            void Promise.resolve().then(() => runtime
              .execute(
                {
                  instructions: agent.instructions,
                  memory: agent.memory,
                  prompt: task.prompt,
                  workspace,
                  model: task.execution?.model,
                  resumeSessionId: parent?.execution?.sessionId,
                  onSession: (id) => store.session(task.id, id),
                  onProgress: (text) => store.progress(task.id, text),
                },
                signal,
              ))
              .then((output) => controller.signal.aborted ? finishCancelled() :
                store.finish(task.id, "completed", output.slice(0, 100000)),
              )
              .catch((error) => controller.signal.aborted ? finishCancelled() :
                store.finish(
                  task.id,
                  "failed",
                  signal.aborted
                    ? "Execution timed out. Review before starting again."
                    : error instanceof Error
                      ? error.message
                      : "Execution failed.",
                ),
              )
              .finally(() => {
                executions.delete(task.id);
                if (workspace) busyWorkspaces.delete(workspace);
              });
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
