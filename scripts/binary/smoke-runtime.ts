import { Database } from "bun:sqlite";
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessiondClient } from "../../packages/agent/src/sessiond-client";
import { runtimeTree } from "../../packages/core/src/runtime";
import { parseMany } from "../../packages/jsonl-parser/src/pool";
import { welcomed } from "../lib/keeper-dial";

const [, , verb] = Bun.argv;
const home = process.env.HOME;
if (!home?.includes("binary")) {
  throw new Error("Smoke test requires scratch HOME");
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Smoke test requires ${name}`);
  }
  return value;
}
if (verb === "smoke-stack") {
  await import("./smoke-stack");
} else if (verb === "smoke-fixture") {
  const dir = runtimeTree("drizzle");
  const journal = JSON.parse(
    readFileSync(join(dir, "meta/_journal.json"), "utf8")
  );
  const db = new Database(required("CAWCO_DB_PATH"), { create: true });
  db.exec(
    'CREATE TABLE "__drizzle_migrations" (id INTEGER PRIMARY KEY AUTOINCREMENT, hash text NOT NULL, created_at numeric)'
  );
  for (const entry of journal.entries.slice(0, -1)) {
    const sql = readFileSync(join(dir, `${entry.tag}.sql`), "utf8");
    db.exec(sql.split("--> statement-breakpoint").join("\n"));
    db.query(
      'INSERT INTO "__drizzle_migrations" (hash,created_at) VALUES (?,?)'
    ).run(new Bun.CryptoHasher("sha256").update(sql).digest("hex"), entry.when);
  }
  db.exec(
    "CREATE TABLE binary_history (value text); INSERT INTO binary_history VALUES ('preserved')"
  );
  db.close();
  console.log("existing database fixture created before final migration");
} else if (verb === "smoke-worker") {
  const dir = join(home, "transcripts");
  mkdirSync(dir, { recursive: true });
  const files = ["a", "b"].map((name) => {
    const path = join(dir, `${name}.jsonl`);
    writeFileSync(
      path,
      `${JSON.stringify({ type: "user", uuid: name, message: { role: "user", content: name } })}\n`
    );
    return path;
  });
  const parsed = await parseMany(files, { mode: "records", workers: 2 });
  if (parsed.length !== 2 || parsed.some((row) => row.records?.length !== 1)) {
    throw new Error("Transcript worker failed");
  }
  console.log("transcript worker parsed two files");
} else if (verb === "smoke-playwright") {
  // playwright-core loaded from the tree the binary publishes (core
  // published-package.ts): its registry reads browsers.json beside itself,
  // and a launch runs its server code from there up to the executable check.
  const { chromium } = await import("playwright-core");
  const loaded = Object.keys(require.cache).filter((path) =>
    path.endsWith("/playwright-core/index.js")
  );
  console.log(`playwright-core loaded from ${loaded.join(", ")}`);
  console.log(`its Chromium revision: ${chromium.executablePath()}`);
  const refused = await chromium
    .launch({ executablePath: "/nonexistent/chromium", headless: true })
    .then(
      () => "launched",
      (error: Error) => error.message.split("\n")[0]
    );
  console.log(`launch with no executable: ${refused}`);
} else if (verb === "smoke-pi") {
  // pi's runtime as pi's own code runs it in the binary: config.js names
  // the codemode worker, image-resize.js spawns the resize worker by the
  // name pi's Bun binary gives it, and that worker loads photon-node from
  // the published tree (scripts/build-binary.ts, the binary's root).
  const { getCodemodeWorkerSpecifier } = await import("cawco:pi-config");
  const { resizeImage } = await import("cawco:smoke-pi");
  const { publishedPackage } =
    await import("../../packages/core/src/published-package");
  publishedPackage("photon-node");
  const photon = Object.keys(require.cache).filter((path) =>
    path.endsWith("/photon_rs.js")
  );
  console.log(`photon-node loaded from ${photon.join(", ")}`);
  // An 8×8 PNG, drawn to 4×4.
  const png = Uint8Array.from(
    Buffer.from(
      "iVBORw0KGgoAAAANSUhEUgAAAAgAAAAICAIAAABLbSncAAAAEUlEQVR4nGM4oaGBFTEMLQkAgl1GAWqNFmsAAAAASUVORK5CYII=",
      "base64"
    )
  );
  const options = { maxWidth: 4, maxHeight: 4 };
  // Spawned as image-resize.js spawns it under Bun, by the same name.
  const { Worker: ThreadWorker } = await import("node:worker_threads");
  const fromWorker = await new Promise<unknown>((resolve, reject) => {
    const worker = new ThreadWorker("./src/utils/image-resize-worker.ts");
    worker.once("message", (message) => {
      worker.terminate();
      resolve(message);
    });
    worker.once("error", (error: Error) => {
      worker.terminate();
      reject(new Error(`pi's image resize worker: ${error.message}`));
    });
    worker.postMessage({ inputBytes: png, mimeType: "image/png", options });
  });
  const { result } = fromWorker as {
    result?: { width: number; height: number; wasResized: boolean };
  };
  if (!result?.wasResized || result.width !== 4) {
    throw new Error(
      `pi's image resize worker answered ${JSON.stringify(fromWorker)}`
    );
  }
  console.log(
    `pi's image resize worker drew the PNG ${result.width}×${result.height}`
  );
  const resized = await resizeImage(png, "image/png", options);
  if (!resized?.wasResized || resized.width !== 4) {
    throw new Error(`pi's resizeImage answered ${JSON.stringify(resized)}`);
  }
  console.log(`pi's resizeImage drew it ${resized.width}×${resized.height}`);
  const codemode = getCodemodeWorkerSpecifier();
  if (typeof codemode !== "string") {
    throw new Error(`pi names its codemode worker ${String(codemode)}`);
  }
  // Spawned as pi-codemode's host does (runtime/host.js), with no workerData:
  // its own `main` answers that with a `crash` message, so a reply is its
  // code loaded and running.
  const crash = await new Promise<{ type?: string; message?: string }>(
    (resolve, reject) => {
      const worker = new ThreadWorker(codemode);
      worker.once("message", (message) => {
        worker.terminate();
        resolve(message);
      });
      worker.once("error", (error: Error) => {
        worker.terminate();
        reject(new Error(`pi's codemode worker ${codemode}: ${error.message}`));
      });
    }
  );
  if (crash.type !== "crash") {
    throw new Error(
      `pi's codemode worker ${codemode} answered ${JSON.stringify(crash)}`
    );
  }
  console.log(
    `pi's codemode worker ${codemode} ran its main: ${crash.message}`
  );
} else if (verb === "smoke-pi-clipboard") {
  // pi-tui's native clipboard helper, found where its own lookup looks
  // (/$bunfs/root/native/…, scripts/build-binary.ts) and loaded, then its
  // read called as pi's clipboard.js calls it. pi-tui loads the helper only
  // when DISPLAY is set (native-platform.js `getNativeClipboard`), so this
  // runs only on a machine with a display. What the read answers is said,
  // not judged: an empty clipboard and an unreachable display both answer
  // nothing.
  const { getNativeClipboard } = await import("cawco:smoke-pi-tui");
  const clipboard = getNativeClipboard();
  if (!clipboard) {
    throw new Error(
      `pi-tui found no native clipboard helper (DISPLAY=${process.env.DISPLAY})`
    );
  }
  const text = await clipboard.getText();
  console.log(
    `pi-tui loaded its native clipboard helper; its read of DISPLAY ${process.env.DISPLAY} answered ${text === undefined ? "undefined" : JSON.stringify(text)}`
  );
} else if (verb === "smoke-child") {
  process.stdin.resume();
  process.stdin.on("data", (chunk) => process.stdout.write(chunk));
  console.log("stub child ready");
  await new Promise<void>((resolve) => process.stdin.on("end", resolve));
} else if (verb === "smoke-custody-start") {
  const endpoint = required("CAWCO_SESSIOND_ENDPOINT");
  const client = welcomed(endpoint, await SessiondClient.connect(endpoint));
  await client.spawnProc("binary-stub", {
    command: process.execPath,
    args: ["smoke-child"],
    cwd: home,
  });
  const proc = (await client.list()).procs.find(
    (p) => p.procId === "binary-stub" && p.alive
  );
  if (!proc) {
    throw new Error("Stub child absent");
  }
  writeFileSync(
    join(home, "child.json"),
    JSON.stringify({ epoch: client.epoch, pid: proc.pid })
  );
  client.close();
  console.log(`sessiond holds stub child ${proc.pid}`);
} else if (verb === "smoke-custody-check") {
  const endpoint = required("CAWCO_SESSIOND_ENDPOINT");
  const client = welcomed(endpoint, await SessiondClient.connect(endpoint));
  const before = JSON.parse(readFileSync(join(home, "child.json"), "utf8"));
  const proc = (await client.list()).procs.find(
    (p) => p.procId === "binary-stub" && p.alive
  );
  if (!proc || proc.pid !== before.pid || client.epoch !== before.epoch) {
    throw new Error("Child did not survive agent restart");
  }
  client.close();
  console.log(`same child ${proc.pid} survived agent restart`);
} else if (verb === "smoke-migration-check") {
  // The hub is up and writing beside this read. Its file is in WAL (hub
  // db/wal.ts), where a writer does not block a reader, so the read runs
  // beside the hub's commits with no wait (nightly 6786381cb failed it
  // SQLITE_BUSY while the hub kept a rollback journal).
  const db = new Database(required("CAWCO_DB_PATH"));
  if (
    db.query<{ value: string }, []>("SELECT value FROM binary_history").get()
      ?.value !== "preserved"
  ) {
    throw new Error("Existing database history lost");
  }
  if (
    !db
      .query<{ name: string }, []>("PRAGMA table_info(agents)")
      .all()
      .some((row) => row.name === "machine_capabilities")
  ) {
    throw new Error("New migration not applied");
  }
  db.close();
  console.log(
    "existing database preserved; embedded capability migration applied"
  );
} else if (verb === "smoke-loop-held") {
  // The loop watch's thread from the binary's own entry, its loop held
  // (smoke-loop-held.ts): the full hold for the probe kit's loop-held-said,
  // `short` for the release's stack test (smoke-stack.ts).
  const { HOLD_MS, SHORT_HOLD_MS, holdLoop } =
    await import("./smoke-loop-held");
  holdLoop(Bun.argv[3] === "short" ? SHORT_HOLD_MS : HOLD_MS);
} else if (verb === "smoke-stores") {
  // The agent's stores thread from the binary's own entry, and the parse
  // threads its transcript index starts from inside it (smoke-stores.ts).
  const { runStores } = await import("./smoke-stores");
  await runStores();
  process.exit(0);
} else {
  throw new Error(`Unknown smoke test command ${verb}`);
}
