import { test } from "node:test";
import assert from "node:assert/strict";
import { mkdtemp, writeFile, chmod, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { runtimes } from "../apps/server/src/runtimes.ts";
import { Store } from "../apps/server/src/store.ts";

test("coding refuses an API-authenticated Codex login", async () => {
  const dir = await mkdtemp(join(tmpdir(), "boss-coding-auth-"));
  const bin = join(dir, "codex");
  await writeFile(
    bin,
    `#!${process.execPath}\nconsole.log('Logged in using an API key');\n`,
  );
  await chmod(bin, 0o700);
  try {
    const runtime = runtimes({
      ...process.env,
      BOSS_CODEX_BIN: bin,
      BOSS_CODEX_HOME: dir,
    }).find((r) => r.info.id === "codex")!;
    await assert.rejects(
      runtime.execute(
        { instructions: "", memory: "", prompt: "Test", workspace: dir },
        AbortSignal.timeout(10000),
      ),
      /ChatGPT subscription login is required/,
    );
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

test("native coding session and workspace survive an interrupted server restart", async () => {
  const dir = await mkdtemp(join(tmpdir(), "boss-session-restart-"));
  const path = join(dir, "state.db");
  try {
    const store = new Store(path);
    const task = store.createTask(store.agents()[0].id, "Code", "codex", {
      workspace: dir,
      model: "test-model",
    });
    store.claim(task.id);
    store.session(task.id, "native-session");
    store.close();
    const reopened = new Store(path);
    try {
      assert.equal(reopened.tasks()[0].status, "interrupted");
      assert.deepEqual(reopened.tasks()[0].execution, {
        workspace: dir,
        model: "test-model",
        sessionId: "native-session",
      });
    } finally {
      reopened.close();
    }
  } finally {
    await rm(dir, { recursive: true, force: true });
  }
});

for (const provider of ["claude-code", "codex"]) {
  test(`${provider} edits the selected workspace, streams progress and resumes its native session`, async () => {
    const dir = await mkdtemp(join(tmpdir(), "boss-coding-"));
    const bin = join(dir, "cli");
    await writeFile(
      bin,
      `#!${process.execPath}
const fs=require('node:fs'); const args=process.argv.slice(2);
if(args.includes('status')) { console.log(args[0]==='auth' ? JSON.stringify({loggedIn:true,authMethod:'claude.ai',subscriptionType:'max'}) : 'Logged in using ChatGPT'); }
else { let prompt=''; process.stdin.on('data',c=>prompt+=c); process.stdin.on('end',()=>{
  if(process.env.ANTHROPIC_API_KEY || process.env.OPENAI_API_KEY) process.exit(9);
  fs.writeFileSync('edited.txt',prompt);
  fs.writeFileSync('args.json',JSON.stringify(args));
  if(args[0]==='exec') {
    console.log(JSON.stringify({type:'thread.started',thread_id:'thread-test'}));
    console.log(JSON.stringify({type:'item.completed',item:{type:'agent_message',text:'Testing changes'}}));
    fs.writeFileSync(args[args.indexOf('--output-last-message')+1],'Completed coding');
    console.log(JSON.stringify({type:'turn.completed'}));
  } else {
    console.log(JSON.stringify({type:'system',subtype:'init',session_id:'claude-test'}));
    console.log(JSON.stringify({type:'assistant',message:{content:[{type:'text',text:'Testing changes'}]}}));
    console.log(JSON.stringify({type:'result',session_id:'claude-test',result:prompt.includes('DISCUSS_LIMIT') ? 'Explained usage limits' : 'Completed coding',is_error:false}));
  }
  if(prompt.includes('FORCE_FAILURE')) process.exitCode=1;
  if(prompt.includes('FORCE_LIMIT')) console.log(JSON.stringify({type:'error',message:'usage limit reached',is_error:true}));
}); }
`,
    );
    await chmod(bin, 0o700);
    try {
      const runtime = runtimes({
        ...process.env,
        BOSS_CLAUDE_BIN: bin,
        BOSS_CODEX_BIN: bin,
        BOSS_CLAUDE_HOME: dir,
        BOSS_CODEX_HOME: dir,
        ANTHROPIC_API_KEY: "never-forward",
        OPENAI_API_KEY: "never-forward",
      }).find((r) => r.info.id === provider)!;
      let session = "";
      const progress: string[] = [];
      const input = {
        instructions: "Follow instructions",
        memory: "Memory",
        prompt: "Edit and test",
        workspace: dir,
        model: "chosen-model",
        onSession: (s: string) => (session = s),
        onProgress: (s: string) => progress.push(s),
      };
      assert.equal(
        await runtime.execute(input, AbortSignal.timeout(10000)),
        "Completed coding",
      );
      assert.match(
        await readFile(join(dir, "edited.txt"), "utf8"),
        /Edit and test/,
      );
      assert.ok(session);
      assert.ok(progress.some((s) => s.includes("Testing changes")));
      const args = JSON.parse(await readFile(join(dir, "args.json"), "utf8"));
      assert.ok(args.includes("chosen-model"));
      if (provider === "codex")
        assert.equal(args[args.indexOf("--sandbox") + 1], "workspace-write");
      else {
        assert.ok(args.includes("Bash,Read,Edit,Write,Glob,Grep"));
        assert.ok(!args.includes("bypassPermissions"));
      }
      await runtime.execute(
        { ...input, resumeSessionId: session },
        AbortSignal.timeout(10000),
      );
      const resumed = JSON.parse(
        await readFile(join(dir, "args.json"), "utf8"),
      );
      assert.ok(resumed.includes(session));
      if (provider === "claude-code")
        assert.equal(
          await runtime.execute(
            { ...input, prompt: "DISCUSS_LIMIT" },
            AbortSignal.timeout(10000),
          ),
          "Explained usage limits",
        );
      await assert.rejects(
        runtime.execute(
          { ...input, prompt: "FORCE_FAILURE" },
          AbortSignal.timeout(10000),
        ),
        /did not complete/,
      );
      await assert.rejects(
        runtime.execute(
          { ...input, prompt: "FORCE_LIMIT" },
          AbortSignal.timeout(10000),
        ),
        /usage limit reached/,
      );
    } finally {
      await rm(dir, { recursive: true, force: true });
    }
  });
}
