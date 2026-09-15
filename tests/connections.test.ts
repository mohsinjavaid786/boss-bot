import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtempSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { Connections } from "../apps/server/src/connections.ts";

test("saved accounts stay independent, encrypted and revocable across restarts", () => {
  const dir = mkdtempSync(join(tmpdir(), "boss-connections-"));
  let vault = new Connections(dir);
  try {
    const ids = Array.from(
      { length: 11 },
      (_, i) =>
        vault.add({
          provider: "claude",
          label: `Account ${i}`,
          secret: `private-key-${i}`,
          model: "test-model",
        }).id,
    );
    assert.equal(vault.list().length, 11);
    assert.equal(new Set(ids).size, 11);
    assert.ok(!JSON.stringify(vault.list()).includes("private-key"));
    assert.equal(vault.runtimes()[0].info.billing, "api");
    vault.remove(ids[0]);
    assert.equal(vault.runtimes().length, 10);
    assert.throws(() => vault.get(ids[0]), /not found/);
    vault.close();
    assert.ok(
      !readFileSync(join(dir, "connections.db")).includes(
        Buffer.from("private-key"),
      ),
    );
    vault = new Connections(dir);
    assert.equal(vault.list().length, 10);
    assert.equal(vault.get(ids[1]).secret, "private-key-1");
  } finally {
    vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("repository requests use the selected account, fixed hosts and no redirects", async () => {
  const dir = mkdtempSync(join(tmpdir(), "boss-connections-"));
  const calls: { url: string; init: RequestInit }[] = [];
  const vault = new Connections(dir, async (url, init) => {
    calls.push({ url: String(url), init: init! });
    return new Response(
      JSON.stringify(
        String(url).includes("/user?")
          ? { login: "owner", id: 123 }
          : [
              {
                id: 1,
                full_name: "owner/project",
                html_url: "https://github.com/owner/project",
                private: true,
              },
            ],
      ),
    );
  });
  try {
    const a = vault.add({
      provider: "github",
      label: "Work",
      secret: "first-token",
    });
    vault.add({
      provider: "github",
      label: "Personal",
      secret: "second-token",
    });
    await vault.verify(a.id);
    const result = await vault.repositories(a.id, 2);
    assert.equal(result.items[0].name, "owner/project");
    assert.equal(
      calls[1].url,
      "https://api.github.com/user/repos?per_page=30&page=2&sort=updated",
    );
    assert.equal(calls[1].init.redirect, "error");
    assert.equal(
      (calls[1].init.headers as Record<string, string>).Authorization,
      "Bearer first-token",
    );
    assert.equal(vault.list()[0].status, "verified");
    vault.remove(a.id);
    await assert.rejects(vault.repositories(a.id, 1), /not found/);
    assert.equal(calls.length, 2);
  } finally {
    vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("GitLab uses private-token authentication and rejects unsafe repository links", async () => {
  const dir = mkdtempSync(join(tmpdir(), "boss-gitlab-"));
  const vault = new Connections(dir, async (url, init) => {
    assert.equal(
      String(url),
      "https://gitlab.com/api/v4/projects?membership=true&per_page=30&page=1&order_by=last_activity_at&sort=desc",
    );
    assert.equal(
      (init!.headers as Record<string, string>)["PRIVATE-TOKEN"],
      "gitlab-key",
    );
    return new Response(
      JSON.stringify([
        {
          id: 1,
          path_with_namespace: "team/project",
          web_url: "https://evil.example/project",
          visibility: "private",
        },
      ]),
    );
  });
  try {
    const c = vault.add({
      provider: "gitlab",
      label: "GitLab",
      secret: "gitlab-key",
    });
    await assert.rejects(
      vault.repositories(c.id, 1),
      /invalid repository link/,
    );
  } finally {
    vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("provider error bodies never expose credentials and mark the connection for attention", async () => {
  const dir = mkdtempSync(join(tmpdir(), "boss-failure-"));
  const vault = new Connections(
    dir,
    async () => new Response("secret-token", { status: 401 }),
  );
  try {
    const c = vault.add({
      provider: "github",
      label: "Expired",
      secret: "secret-token",
    });
    await assert.rejects(vault.verify(c.id), /HTTP 401/);
    assert.equal(vault.list()[0].status, "needs_attention");
    assert.ok(!JSON.stringify(vault.list()).includes("secret-token"));
  } finally {
    vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});

test("Codex accounts execute with separate native homes and without API credentials", async () => {
  const { writeFileSync, mkdirSync, chmodSync } = await import("node:fs");
  const dir = mkdtempSync(join(tmpdir(), "boss-codex-accounts-"));
  const binary = join(dir, "test-codex");
  writeFileSync(
    binary,
    `#!${process.execPath}\nconst fs=require('node:fs');process.stdin.resume();process.stdin.on('end',()=>{fs.writeFileSync(process.argv[process.argv.indexOf('-o')+1],JSON.stringify({home:process.env.CODEX_HOME,api:process.env.OPENAI_API_KEY||null}));});\n`,
  );
  chmodSync(binary, 0o700);
  const previous = process.env.BOSS_CODEX_BIN;
  process.env.BOSS_CODEX_BIN = binary;
  const vault = new Connections(dir);
  try {
    for (const name of ["first", "second"]) {
      const home = join(dir, name);
      mkdirSync(home);
      vault.add({ provider: "codex", label: name, secret: home });
    }
    const adapters = vault.runtimes();
    assert.equal(adapters[0].info.billing, "subscription");
    const output = await Promise.all(
      adapters.map((r) =>
        r.execute(
          { instructions: "Test", memory: "", prompt: "Test" },
          AbortSignal.timeout(10000),
        ),
      ),
    );
    assert.deepEqual(
      output.map((s) => JSON.parse(s)),
      [
        { home: join(dir, "first"), api: null },
        { home: join(dir, "second"), api: null },
      ],
    );
  } finally {
    if (previous === undefined) delete process.env.BOSS_CODEX_BIN;
    else process.env.BOSS_CODEX_BIN = previous;
    vault.close();
    rmSync(dir, { recursive: true, force: true });
  }
});
