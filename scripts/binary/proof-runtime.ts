import { Database } from "bun:sqlite";
import { generateKeyPairSync } from "node:crypto";
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import { SessiondClient } from "../../packages/agent/src/sessiond-client";
import {
  type ReleaseManifest,
  signManifest,
  verifyManifest,
} from "../../packages/core/src/release-manifest";
import { materializeTree } from "../../packages/core/src/runtime";
import {
  programInputs,
  typecheckProgram,
  WORKER_URL,
  writeProgram,
} from "../../packages/core/src/workflow-sandbox";
import { parseMany } from "../../packages/jsonl-parser/src/pool";

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
    const keys = generateKeyPairSync("ed25519", {
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
    await fetch("http://192.168.3.100:3456/health", {
      signal: AbortSignal.timeout(1000),
    });
    throw new Error("Live hub reachable");
  } catch (error) {
    if (String(error).includes("Live hub reachable")) {
      throw error;
    }
    console.log(`live hub unreachable: ${error}`);
  }
  console.log(`no bun, node or git; standalone runtime ${Bun.version}`);
} else if (verb === "proof-fixture") {
  const dir = materializeTree("drizzle");
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
  const program =
    'import { z } from "zod"; export const inputs = z.object({ name:z.string() }); export default async function(w: Workflow<typeof inputs>) { await w.checkpoint("binary",w.inputs); return {name:w.inputs.name}; }';
  const errors = typecheckProgram(program);
  if (errors.length) {
    throw new Error(JSON.stringify(errors));
  }
  if (
    !typecheckProgram(program.replace("w.inputs.name", "w.inputs.missing"))
      .length
  ) {
    throw new Error(
      "Embedded type declarations did not reject an invalid input property"
    );
  }
  const inputs = await programInputs(program);
  if (inputs.length !== 1) {
    throw new Error("Workflow input worker failed");
  }
  await new Promise<void>((resolve, reject) => {
    const worker = new Worker(WORKER_URL);
    const timer = setTimeout(() => {
      worker.terminate();
      reject(new Error("Workflow timed out"));
    }, 10_000);
    worker.onmessage = (event) => {
      const m = event.data;
      if (m.type === "effect") {
        worker.postMessage({ type: "effect-result", id: m.id, result: null });
      }
      if (m.type === "failed") {
        clearTimeout(timer);
        worker.terminate();
        reject(new Error(m.failure.message));
      }
      if (m.type === "done") {
        clearTimeout(timer);
        worker.terminate();
        if (m.result.name === "standalone") {
          resolve();
        } else {
          reject(new Error("Wrong workflow result"));
        }
      }
    };
    worker.onerror = (event) => {
      clearTimeout(timer);
      worker.terminate();
      reject(new Error(event.message));
    };
    worker.postMessage({
      mode: "run",
      path: writeProgram(program),
      runId: "binary-proof",
      inputs: { name: "standalone" },
    });
  });
  console.log("workflow typecheck, input worker, effect and result passed");
} else if (verb === "proof-child") {
  process.stdin.resume();
  process.stdin.on("data", (chunk) => process.stdout.write(chunk));
  console.log("stub child ready");
  await new Promise<void>((resolve) => process.stdin.on("end", resolve));
} else if (verb === "proof-custody-start") {
  const client = await SessiondClient.connect(
    required("CAWCO_SESSIOND_ENDPOINT")
  );
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
  const client = await SessiondClient.connect(
    required("CAWCO_SESSIOND_ENDPOINT")
  );
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
} else {
  throw new Error(`Unknown proof command ${verb}`);
}
