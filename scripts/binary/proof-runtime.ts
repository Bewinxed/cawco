import { Database } from "bun:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessiondClient } from "../../packages/agent/src/sessiond-client";
import { renderCanvas } from "../../packages/agent/src/stage-render";
import { readWithin } from "../../packages/core/src/bounded";
import {
  type ReleaseManifest,
  signManifest,
  verifyManifest,
} from "../../packages/core/src/release-manifest";
import { runtimeTree } from "../../packages/core/src/runtime";
import { SESSIOND_V1 } from "../../packages/core/src/sessiond";
import { REPORT_PATH, type RenderReport } from "../../packages/core/src/stage";
import { parseMany } from "../../packages/jsonl-parser/src/pool";
import { welcomed } from "../lib/keeper-dial";

const [, , verb] = Bun.argv;
const home = process.env.HOME;
if (!home?.includes("binary")) {
  throw new Error("Proof requires scratch HOME");
}
function required(name: string): string {
  const value = process.env[name];
  if (!value) {
    throw new Error(`Proof requires ${name}`);
  }
  return value;
}
if (verb === "proof-stack") {
  await import("./proof-stack");
} else if (verb === "proof-relay") {
  await import("./proof-relay");
} else if (verb === "proof-signing") {
  const dir = join(home, "test-release-signing");
  mkdirSync(dir, { recursive: true });
  try {
    const keys = generateKeyPairSync("ec", {
      namedCurve: "prime256v1",
      privateKeyEncoding: { type: "pkcs8", format: "pem" },
      publicKeyEncoding: { type: "spki", format: "pem" },
    });
    writeFileSync(join(dir, "TEST-private.pem"), keys.privateKey, {
      mode: 0o600,
    });
    writeFileSync(join(dir, "TEST-public.pem"), keys.publicKey);
    const manifest: ReleaseManifest = {
      version: "0.1.0-proof",
      commit: "proof",
      channel: "nightly",
      protocol: { min: 1, max: 1 },
      sequence: 1,
      schemaVersion: 1,
      sessiondProtocol: SESSIOND_V1,
      notes: "Proof only",
      testSigned: true,
      artifacts: [],
    };
    writeFileSync(join(dir, "release.json"), JSON.stringify(manifest));
    const signature = signManifest(manifest, keys.privateKey);
    let refused = false;
    try {
      verifyManifest(manifest, signature);
    } catch (error) {
      refused = String(error).includes("Test-signed release refused");
    }
    if (!refused) {
      throw new Error("Test key accepted without explicit public key");
    }
    verifyManifest(manifest, signature, keys.publicKey);
    console.log(
      "test-signed manifest refused by default; explicit test public key verifies"
    );
  } finally {
    rmSync(dir, { recursive: true, force: true });
  }
  console.log("throwaway TEST keys and manifest deleted");
} else if (verb === "proof-isolation") {
  for (const name of ["bun", "node", "git"]) {
    if (Bun.which(name)) {
      throw new Error(`${name} must be absent`);
    }
  }
  try {
    const live = await readWithin(1000, (signal) =>
      fetch("http://192.168.3.100:3456/health", { signal })
    );
    switch (live.kind) {
      case "answered":
        throw new Error("Live hub reachable");
      case "unanswered":
        console.log(
          `live hub unreachable: did not answer within ${live.after} ms (${live.reason})`
        );
        break;
      default: {
        const unhandled: never = live;
        throw new Error(`unhandled read: ${JSON.stringify(unhandled)}`);
      }
    }
  } catch (error) {
    if (String(error).includes("Live hub reachable")) {
      throw error;
    }
    console.log(`live hub unreachable: ${error}`);
  }
  console.log(`no bun, node or git; standalone runtime ${Bun.version}`);
} else if (verb === "proof-fixture") {
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
    "CREATE TABLE binary_proof_history (value text); INSERT INTO binary_proof_history VALUES ('preserved')"
  );
  db.close();
  console.log("existing database fixture created before final migration");
} else if (verb === "proof-worker") {
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
} else if (verb === "proof-render") {
  // The component canvas's renderer (agent stage-render.ts) driving the
  // machine's Chromium through the bundled playwright-core, on a loopback
  // page that answers as a stage's canvas and report do. Chromium's own
  // sandbox is off: the proof runs inside a workspace's boundary.
  const report: RenderReport = {
    at: new Date().toISOString(),
    by: "stage",
    page: { errors: [] },
    sections: [],
    unnamed: [],
  };
  // The canvas's picture answers (stage-host canvas runtime.ts `CanvasState`), for one frame standing whole at its own size.
  const page = `<!doctype html><body style="margin:0"><div id="cawco-canvas" style="position:fixed;inset:0"><div class="cawco-frame" data-cawco-story="Proof" data-cawco-interaction="rest" data-cawco-key="proof"><div class="cawco-frame-body" style="width:120px;height:40px;background:#c33">proof</div></div></div><script>
const body = () => document.querySelector(".cawco-frame-body");
globalThis.__cawcoCanvas = {
  reports: 1,
  swept: true,
  frameNamed: async (name) => name === "Proof" ? { key: "proof" } : { refused: "No story " + name + "." },
  lacks: () => ({ w: 0, h: 0 }),
  pose: () => ({ w: 0, h: 0 }),
  settled: () => document.fonts.status === "loaded",
  picture: () => {
    const rect = body().getBoundingClientRect();
    return { rect: { x: rect.x, y: rect.y, w: rect.width, h: rect.height }, own: { w: body().offsetWidth, h: body().offsetHeight }, scale: devicePixelRatio, whole: true, view: "the proof's page" };
  },
};
</script></body>`;
  const stage = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: (request) =>
      new URL(request.url).pathname === REPORT_PATH
        ? Response.json(report)
        : new Response(page, { headers: { "content-type": "text/html" } }),
  });
  try {
    const rendered = await renderCanvas(
      "host",
      Number(stage.port),
      { files: ["proof.stories.ts"], png: true, state: { story: "Proof" } },
      false
    );
    console.log(
      `stage-render drew the canvas: report by ${rendered.report.by}, frame PNG ${Buffer.from(rendered.png ?? "", "base64").length} bytes`
    );
  } finally {
    stage.stop(true);
  }
} else if (verb === "proof-playwright") {
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
} else if (verb === "proof-pi") {
  // pi's runtime as pi's own code runs it in the binary: config.js names
  // the codemode worker, image-resize.js spawns the resize worker by the
  // name pi's Bun binary gives it, and that worker loads photon-node from
  // the published tree (scripts/build-binary.ts, the binary's root).
  const { getCodemodeWorkerSpecifier } = await import("cawco:pi-config");
  const { resizeImage } = await import("cawco:proof-pi");
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
} else if (verb === "proof-pi-clipboard") {
  // pi-tui's native clipboard helper, found where its own lookup looks
  // (/$bunfs/root/native/…, scripts/build-binary.ts) and loaded, then its
  // read called as pi's clipboard.js calls it. pi-tui loads the helper only
  // when DISPLAY is set (native-platform.js `getNativeClipboard`), so this
  // runs only on a machine with a display. What the read answers is said,
  // not judged: an empty clipboard and an unreachable display both answer
  // nothing.
  const { getNativeClipboard } = await import("cawco:proof-pi-tui");
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
} else if (verb === "proof-child") {
  process.stdin.resume();
  process.stdin.on("data", (chunk) => process.stdout.write(chunk));
  console.log("stub child ready");
  await new Promise<void>((resolve) => process.stdin.on("end", resolve));
} else if (verb === "proof-custody-start") {
  const endpoint = required("CAWCO_SESSIOND_ENDPOINT");
  const client = welcomed(endpoint, await SessiondClient.connect(endpoint));
  await client.spawnProc("binary-stub", {
    command: process.execPath,
    args: ["proof-child"],
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
} else if (verb === "proof-custody-check") {
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
} else if (verb === "proof-migration-check") {
  // The hub is up and writing beside this read. Its file is in WAL (hub
  // db/wal.ts), where a writer does not block a reader, so the read runs
  // beside the hub's commits with no wait (nightly 6786381cb failed it
  // SQLITE_BUSY while the hub kept a rollback journal).
  const db = new Database(required("CAWCO_DB_PATH"));
  if (
    db
      .query<{ value: string }, []>("SELECT value FROM binary_proof_history")
      .get()?.value !== "preserved"
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
} else if (verb === "proof-loop-held") {
  // The loop watch's thread from the binary's own entry, its loop held
  // (proof-loop-held.ts); the probe kit's loop-held-said reads its lines.
  (await import("./proof-loop-held")).holdLoop();
} else {
  throw new Error(`Unknown proof command ${verb}`);
}
