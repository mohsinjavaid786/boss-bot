import { mkdirSync } from "node:fs";
import { Connections } from "./connections.ts";
import { Store } from "./store.ts";
import { app } from "./http.ts";
import { runtimes } from "./runtimes.ts";
mkdirSync("data", { recursive: true });
const store = new Store("data/boss-bot.db");
app(store, runtimes(), undefined, new Connections("data")).listen(
  4310,
  "127.0.0.1",
  () => console.log("Boss Bot is ready at http://127.0.0.1:4310"),
);
