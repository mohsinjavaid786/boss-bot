import { test } from "node:test";
import assert from "node:assert/strict";
import {
  mkdtempSync,
  writeFileSync,
  chmodSync,
  mkdirSync,
  rmSync,
} from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { claudeCode } from "../apps/server/src/claude-code.ts";

test("Claude Code executes approved text through isolated subscription login, without API environment or tools", async () => {
  const dir = mkdtempSync(join(tmpdir(), "boss-claude-test-"));
  const bin = join(dir, "claude");
  writeFileSync(
    bin,
    `#!${process.execPath}\nconst fs=require('node:fs'); const status=JSON.parse(fs.readFileSync(process.env.CLAUDE_CONFIG_DIR+'/status.json','utf8')); if(process.argv.includes('status')){console.log(JSON.stringify(status));}else{let text='';process.stdin.on('data',c=>text+=c);process.stdin.on('end',()=>console.log(JSON.stringify({result:JSON.stringify({text,home:process.env.CLAUDE_CONFIG_DIR,api:process.env.ANTHROPIC_API_KEY||null,oauth:process.env.CLAUDE_CODE_OAUTH_TOKEN||null,provider:process.env.CLAUDE_CODE_USE_BEDROCK||null,args:process.argv.slice(2)})})));}\n`,
  );
  chmodSync(bin, 0o700);
  try {
    for (const account of ["one", "two"]) {
      mkdirSync(join(dir, account));
      writeFileSync(
        join(dir, account, "status.json"),
        JSON.stringify({
          loggedIn: true,
          authMethod: "claude.ai",
          subscriptionType: "max",
        }),
      );
    }
    const adapters = ["one", "two"].map((account) =>
      claudeCode({
        ...process.env,
        BOSS_CLAUDE_BIN: bin,
        BOSS_CLAUDE_HOME: join(dir, account),
        ANTHROPIC_API_KEY: "must-not-pass",
        CLAUDE_CODE_OAUTH_TOKEN: "must-not-pass",
        CLAUDE_CODE_USE_BEDROCK: "1",
      }),
    );
    const answers = await Promise.all(
      adapters.map((a) =>
        a.execute(
          { instructions: "Instructions", memory: "Memory", prompt: "Task" },
          AbortSignal.timeout(10000),
        ),
      ),
    );
    answers.forEach((answer, i) => {
      const r = JSON.parse(answer);
      assert.equal(r.home, join(dir, i === 0 ? "one" : "two"));
      assert.equal(r.api, null);
      assert.equal(r.oauth, null);
      assert.equal(r.provider, null);
      assert.match(r.text, /Memory/);
      assert.equal(r.args[r.args.indexOf("--tools") + 1], "");
      assert.ok(r.args.includes("--safe-mode"));
    });
    writeFileSync(
      join(dir, "one", "status.json"),
      JSON.stringify({
        loggedIn: true,
        authMethod: "api_key",
        subscriptionType: "max",
      }),
    );
    await assert.rejects(
      adapters[0].execute(
        { instructions: "", memory: "", prompt: "Task" },
        AbortSignal.timeout(10000),
      ),
      /subscription login is required/,
    );
    writeFileSync(
      join(dir, "one", "status.json"),
      JSON.stringify({ loggedIn: false, authMethod: "none" }),
    );
    await assert.rejects(
      adapters[0].execute(
        { instructions: "", memory: "", prompt: "Task" },
        AbortSignal.timeout(10000),
      ),
      /subscription login is required/,
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
});
