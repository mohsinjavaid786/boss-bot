import assert from "node:assert/strict";
import { once } from "node:events";
import { mkdtemp, rm, mkdir } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { chromium } from "playwright";
import { Store } from "../apps/server/src/store.ts";
import { app } from "../apps/server/src/http.ts";
import { Connections } from "../apps/server/src/connections.ts";

const dir = await mkdtemp(join(tmpdir(), "boss-ui-"));
const store = new Store(join(dir, "state.db"));
const connections = new Connections(dir);
const server = app(
  store,
  [
    {
      info: {
        id: "qa",
        name: "QA account",
        ownerId: "local",
        available: true,
        billing: "local",
        capabilities: ["text", "coding"],
        description: "Deterministic UI fixture",
      },
      async execute(input, signal) {
        input.onProgress?.("Reviewing the task");
        input.onSession?.("qa-session");
        return new Promise((_, reject) =>
          signal.addEventListener("abort", () => reject(new Error("Stopped")), {
            once: true,
          }),
        );
      },
    },
  ],
  undefined,
  connections,
);
server.listen(0, "127.0.0.1");
await once(server, "listening");
const base = "http://127.0.0.1:" + server.address().port;
const browser = await chromium.launch({ headless: true });
const page = await browser.newPage({ viewport: { width: 1440, height: 1000 } });
const errors = [];
page.on("pageerror", (e) => errors.push(e.message));
const screenshotDir = "qa-screenshots";
await mkdir(screenshotDir, { recursive: true });
try {
  await page.goto(base);
  await page
    .getByRole("heading", { name: "Your workspace", exact: true })
    .waitFor();
  await page.screenshot({
    path: screenshotDir + "/overview-desktop.png",
    fullPage: true,
  });
  await page.getByRole("button", { name: "New task", exact: true }).click();
  const dialog = page.getByRole("dialog");
  await dialog
    .getByLabel("What needs to get done?")
    .fill("Inspect the checkout flow");
  await dialog.getByLabel("Account", { exact: true }).selectOption("qa");
  await dialog.getByRole("button", { name: "Coding task" }).click();
  await dialog.getByLabel("Workspace path").fill(dir);
  await page.screenshot({
    path: screenshotDir + "/task-composer.png",
    fullPage: true,
  });
  await dialog
    .getByRole("button", { name: "Review task", exact: true })
    .click();
  await page.getByRole("heading", { name: "Approvals", exact: true }).waitFor();
  await page.getByRole("button", { name: /Inspect the checkout flow/ }).click();
  await dialog.getByRole("button", { name: "Approve & run" }).click();
  await dialog
    .getByRole("button", { name: "Stop task", exact: true })
    .waitFor();
  await dialog.getByRole("button", { name: "Stop task", exact: true }).click();
  await dialog.getByText("Stopped", { exact: true }).first().waitFor();
  await dialog.getByText("Stop requested", { exact: true }).waitFor();
  await dialog.getByRole("button", { name: "Run again", exact: true }).click();
  assert.equal(
    await dialog.getByLabel("What needs to get done?").inputValue(),
    "Inspect the checkout flow",
  );
  await dialog.getByRole("button", { name: "Close dialog" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Tasks", exact: true })
    .click();
  await page.getByLabel("Search", { exact: true }).fill("does not match");
  await page.getByRole("heading", { name: "No matching tasks" }).waitFor();
  await page.getByRole("button", { name: "Clear filters" }).click();
  await page
    .getByRole("button", { name: /Inspect the checkout flow/ })
    .waitFor();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Connections", exact: true })
    .click();
  await page.getByRole("button", { name: "Add account", exact: true }).click();
  await page.getByLabel("Account label").fill("Temporary account");
  await page.getByLabel("Dedicated Codex directory").fill(dir);
  await page.getByRole("button", { name: "Save account", exact: true }).click();
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page.getByRole("button", { name: "Keep account", exact: true }).click();
  assert.equal(connections.list().length, 1);
  await page.getByRole("button", { name: "Disconnect", exact: true }).click();
  await page
    .getByRole("button", { name: "Disconnect account", exact: true })
    .click();
  await page.waitForFunction(
    () => !document.body.textContent.includes("Temporary account"),
  );
  assert.equal(connections.list().length, 0);
  await page.setViewportSize({ width: 390, height: 844 });
  await page.getByRole("button", { name: "Toggle navigation" }).click();
  await page
    .getByRole("navigation")
    .getByRole("button", { name: "Overview", exact: true })
    .click();
  await page
    .getByRole("heading", { name: "Your workspace", exact: true })
    .waitFor();
  await page.screenshot({
    path: screenshotDir + "/overview-mobile.png",
    fullPage: true,
  });
  assert.ok(
    await page.evaluate(
      () => document.documentElement.scrollWidth <= window.innerWidth,
    ),
    "Mobile layout overflows",
  );
  const session = await page.context().newCDPSession(page);
  await session.send("Network.enable");
  await session.send("Network.emulateNetworkConditions", {
    offline: true,
    latency: 0,
    downloadThroughput: 0,
    uploadThroughput: 0,
  });
  await page
    .getByRole("alert")
    .filter({ hasText: "Connection interrupted" })
    .waitFor({ timeout: 15000 });
  await session.send("Network.emulateNetworkConditions", {
    offline: false,
    latency: 0,
    downloadThroughput: -1,
    uploadThroughput: -1,
  });
  await page
    .getByRole("status")
    .filter({ hasText: "Connected locally" })
    .waitFor({ timeout: 15000 });
  assert.deepEqual(errors, []);
  console.log("Product browser smoke checks passed");
} finally {
  await browser.close();
  server.close();
  await once(server, "close");
  connections.close();
  store.close();
  await rm(dir, { recursive: true, force: true });
}
