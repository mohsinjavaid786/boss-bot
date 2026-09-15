import { DatabaseSync } from "node:sqlite";
import {
  mkdirSync,
  readFileSync,
  writeFileSync,
  chmodSync,
  statSync,
  existsSync,
} from "node:fs";
import { join, isAbsolute } from "node:path";
import {
  randomBytes,
  randomUUID,
  createCipheriv,
  createDecipheriv,
} from "node:crypto";
import { z } from "zod";
import { runtimes } from "./runtimes.ts";

export const connectionInput = z
  .object({
    provider: z.enum(["github", "gitlab", "claude", "codex"]),
    label: z.string().trim().min(1).max(60),
    secret: z.string().trim().min(1).max(8000),
    model: z.string().trim().max(120).default(""),
  })
  .superRefine((value, ctx) => {
    if (value.provider === "claude" && !value.model)
      ctx.addIssue({ code: "custom", message: "Choose a Claude API model." });
    if (value.provider === "codex" && !isAbsolute(value.secret))
      ctx.addIssue({
        code: "custom",
        message: "Use an absolute dedicated Codex directory.",
      });
  });
type Input = z.infer<typeof connectionInput>;
type RecordRow = {
  id: string;
  provider: Input["provider"];
  label: string;
  model: string;
  encrypted: string;
  status: string;
  identity: string;
  checkedAt: string;
};
export type SavedConnection = Omit<RecordRow, "encrypted">;

/** Local-owner vault. Provider credentials never appear in public connection records. */
export class Connections {
  private db: DatabaseSync;
  private key: Buffer;
  constructor(
    directory: string,
    private transport: typeof fetch = fetch,
  ) {
    mkdirSync(directory, { recursive: true, mode: 0o700 });
    const keyFile = join(directory, "connections.key");
    if (!existsSync(keyFile) && existsSync(join(directory, "connections.db")))
      throw new Error(
        "Connection vault key is missing. Restore it from your backup.",
      );
    try {
      writeFileSync(keyFile, randomBytes(32), { flag: "wx", mode: 0o600 });
    } catch (error) {
      if ((error as NodeJS.ErrnoException).code !== "EEXIST") throw error;
    }
    this.key = readFileSync(keyFile);
    if (this.key.length !== 32) throw new Error("Invalid connection vault key");
    chmodSync(keyFile, 0o600);
    const dbFile = join(directory, "connections.db");
    this.db = new DatabaseSync(dbFile);
    chmodSync(dbFile, 0o600);
    this.db.exec(`CREATE TABLE IF NOT EXISTS connections (
      id TEXT PRIMARY KEY, provider TEXT NOT NULL, label TEXT NOT NULL,
      model TEXT NOT NULL, encrypted TEXT NOT NULL, status TEXT NOT NULL,
      identity TEXT NOT NULL DEFAULT '', checkedAt TEXT NOT NULL DEFAULT ''
    )`);
  }
  list(): SavedConnection[] {
    return this.db
      .prepare(
        "SELECT id, provider, label, model, status, identity, checkedAt FROM connections ORDER BY rowid",
      )
      .all() as SavedConnection[];
  }
  add(raw: unknown): SavedConnection {
    const value = connectionInput.parse(raw);
    if (value.provider === "codex" && !statSync(value.secret).isDirectory())
      throw new Error("Codex directory not found");
    const id = randomUUID();
    const iv = randomBytes(12);
    const cipher = createCipheriv("aes-256-gcm", this.key, iv);
    cipher.setAAD(Buffer.from(id));
    const encrypted = Buffer.concat([
      iv,
      cipher.update(value.secret, "utf8"),
      cipher.final(),
      cipher.getAuthTag(),
    ]).toString("base64");
    this.db
      .prepare(
        "INSERT INTO connections(id,provider,label,model,encrypted,status) VALUES(?,?,?,?,?,?)",
      )
      .run(
        id,
        value.provider,
        value.label,
        value.model,
        encrypted,
        "configured",
      );
    return this.list().find((c) => c.id === id)!;
  }
  get(id: string) {
    const row = this.db
      .prepare("SELECT * FROM connections WHERE id = ?")
      .get(id) as RecordRow | undefined;
    if (!row)
      throw new Error("Connection not found. Select an active account.");
    const bytes = Buffer.from(row.encrypted, "base64");
    const decipher = createDecipheriv(
      "aes-256-gcm",
      this.key,
      bytes.subarray(0, 12),
    );
    decipher.setAAD(Buffer.from(id));
    decipher.setAuthTag(bytes.subarray(-16));
    return {
      ...row,
      secret: Buffer.concat([
        decipher.update(bytes.subarray(12, -16)),
        decipher.final(),
      ]).toString("utf8"),
    };
  }
  remove(id: string) {
    this.db.prepare("DELETE FROM connections WHERE id = ?").run(id);
  }
  runtimes() {
    return this.list()
      .filter((c) => c.provider === "claude" || c.provider === "codex")
      .map((c) => {
        const runtime = () => {
          const account = this.get(c.id);
          const env =
            account.provider === "codex"
              ? { ...process.env, BOSS_CODEX_HOME: account.secret }
              : {
                  ...process.env,
                  ANTHROPIC_API_KEY: account.secret,
                  ANTHROPIC_MODEL: account.model,
                };
          return runtimes(env).find((r) => r.info.id === account.provider)!;
        };
        return {
          info: {
            ...runtime().info,
            id: `connection:${c.id}`,
            name: `${c.label} · ${c.provider === "codex" ? "Codex subscription" : "Claude API"}`,
          },
          execute: ((input, signal) =>
            runtime().execute(input, signal)) as ReturnType<
            typeof runtimes
          >[number]["execute"],
        };
      });
  }
  private async gitRequest(id: string, path: string) {
    const c = this.get(id);
    if (c.provider !== "github" && c.provider !== "gitlab")
      throw new Error("Select a GitHub or GitLab connection.");
    const root =
      c.provider === "github"
        ? "https://api.github.com"
        : "https://gitlab.com/api/v4";
    const headers: Record<string, string> =
      c.provider === "github"
        ? {
            Authorization: `Bearer ${c.secret}`,
            Accept: "application/vnd.github+json",
            "X-GitHub-Api-Version": "2022-11-28",
            "User-Agent": "Boss-Bot",
          }
        : { "PRIVATE-TOKEN": c.secret };
    try {
      const response = await this.transport(root + path, {
        headers,
        redirect: "error",
        signal: AbortSignal.timeout(15000),
      });
      if (!response.ok) {
        this.db
          .prepare("UPDATE connections SET status='needs_attention' WHERE id=?")
          .run(id);
        throw new Error(
          `Connection returned HTTP ${response.status}. Check its token, permissions and rate limit.`,
        );
      }
      const data = await response.json();
      this.get(id); // A disconnect during the request invalidates its result.
      return data;
    } catch (error) {
      if (
        error instanceof Error &&
        error.message.startsWith("Connection returned")
      )
        throw error;
      throw new Error("Connection request failed. Check access and try again.");
    }
  }
  async verify(id: string) {
    const c = this.get(id);
    const data = await this.gitRequest(id, "/user?");
    const identity = c.provider === "github" ? data.login : data.username;
    if (typeof identity !== "string")
      throw new Error("Provider did not return an account identity.");
    this.db
      .prepare(
        "UPDATE connections SET status='verified', identity=?, checkedAt=? WHERE id=?",
      )
      .run(identity, new Date().toISOString(), id);
    return this.list().find((c) => c.id === id);
  }
  async repositories(id: string, page: number) {
    const c = this.get(id);
    const data = await this.gitRequest(
      id,
      c.provider === "github"
        ? `/user/repos?per_page=30&page=${page}&sort=updated`
        : `/projects?membership=true&per_page=30&page=${page}&order_by=last_activity_at&sort=desc`,
    );
    if (!Array.isArray(data))
      throw new Error("Provider returned an invalid repository list.");
    const host = c.provider === "github" ? "github.com" : "gitlab.com";
    return {
      items: data.map((r) => {
        const url = new URL(c.provider === "github" ? r.html_url : r.web_url);
        if (
          url.protocol !== "https:" ||
          url.hostname !== host ||
          url.username ||
          url.password
        )
          throw new Error("Provider returned an invalid repository link.");
        return {
          id: String(r.id),
          name: String(
            c.provider === "github" ? r.full_name : r.path_with_namespace,
          ),
          url: url.href,
          private:
            c.provider === "github" ? !!r.private : r.visibility !== "public",
        };
      }),
      page,
      hasMore: data.length === 30,
    };
  }
  close() {
    this.db.close();
  }
}
