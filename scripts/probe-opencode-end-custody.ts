/** Private native-adapter integration: real sessiond and SDK HTTP, no model turns. */
import assert from "node:assert/strict";
import { mkdir, readFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "..");
const [, , role, scratch] = process.argv;

// biome-ignore lint/style/noNegationElse: launch the isolated subprocess before reading any native adapter in the private-HOME branch
if (role !== "child") {
  const directory = join(
    root,
    ".context",
    "ownership",
    `native-${crypto.randomUUID()}`
  );
  await mkdir(join(directory, "home", ".cawco"), { recursive: true });
  const child = Bun.spawn(
    [
      "/usr/bin/env",
      `HOME=${join(directory, "home")}`,
      `CAWCO_SESSIOND_ENDPOINT=${join(directory, "sessiond.sock")}`,
      "CAWCO_HUB_URL=ws://127.0.0.1:1/ws",
      "CAWCO_NO_MDNS=1",
      process.execPath,
      import.meta.path,
      "child",
      directory,
    ],
    {
      cwd: root,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
      stdout: "pipe",
      stderr: "pipe",
    }
  );
  const output = await new Response(child.stdout).text();
  const error = await new Response(child.stderr).text();
  assert.equal(await child.exited, 0, `${output}\n${error}`);
  assert.ok(output.includes("native-ownership-proofs-pass"));
  console.log(output.trim());
  console.log(`Native private evidence: ${directory}`);
} else {
  assert.equal(homedir(), join(scratch, "home"));
  const endpoint = join(scratch, "sessiond.sock");
  const sessiond = Bun.spawn(
    [process.execPath, join(root, "packages/sessiond/src/main.ts")],
    {
      cwd: root,
      env: process.env,
      stdout: Bun.file(join(scratch, "sessiond.log")),
      stderr: Bun.file(join(scratch, "sessiond.err")),
    }
  );
  const { SessiondClient, endProc } = await import(
    "../packages/agent/src/sessiond-client"
  );
  const { OpencodeHarness } = await import(
    "../packages/agent/src/harnesses/opencode"
  );
  const { SessionAddressRefused } = await import(
    "../packages/agent/src/harness"
  );
  const until = async <T>(
    read: () => Promise<T>,
    accept: (value: T) => boolean
  ): Promise<T> => {
    const deadline = Date.now() + 10_000;
    for (;;) {
      // biome-ignore lint/performance/noAwaitInLoops: bounded private sessiond/HTTP observation
      const value = await read();
      if (accept(value)) {
        return value;
      }
      assert.ok(
        Date.now() < deadline,
        "Private native operation did not settle."
      );
      await Bun.sleep(20);
    }
  };
  const client = await until(
    () => SessiondClient.connect(endpoint, 100).catch(() => undefined),
    Boolean
  );
  assert.ok(client);
  const key = "ses_native_ownership_proof";
  let state: "busy" | "idle" = "busy";
  const requests: string[] = [];
  const server = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch(request) {
      const path = new URL(request.url).pathname;
      requests.push(path);
      if (path.endsWith("/session/status")) {
        return Response.json({ [key]: { type: state } });
      }
      if (path.endsWith("/abort")) {
        state = "idle";
        return Response.json(true);
      }
      if (path.endsWith("/instance/dispose")) {
        return Response.json(true);
      }
      if (path.endsWith(`/session/${key}`)) {
        return Response.json({
          id: key,
          directory: scratch,
          title: "private",
          version: "private",
          time: { created: 1, updated: 1 },
        });
      }
      return Response.json({});
    },
  });
  const recordPath = join(
    homedir(),
    ".cawco",
    `opencode-server-${new Bun.CryptoHasher("sha256").update(endpoint).digest("hex").slice(0, 16)}.json`
  );
  const procId = "opencode-server-native-proof";
  const context = (recordSessionAddress: (id: string) => Promise<void>) => ({
    instanceId: "native-review",
    cwd: scratch,
    recordSessionAddress,
    busy: () => undefined,
    failed: () => undefined,
    frame: () => undefined,
    permission: () => undefined,
    rejected: () => undefined,
    session: () => undefined,
    emit: () => undefined,
  });
  const spec = {
    instanceId: "native-review",
    cwd: scratch,
    harness: "opencode" as const,
    reattachOnly: true as const,
    resume: { sessionKey: key },
  };
  const native = () => {
    const harness = new OpencodeHarness();
    harness.setCustodyReadiness(() => true);
    return harness;
  };
  try {
    await Bun.write(recordPath, JSON.stringify({ active: null, retired: [] }));
    await native().endSession(key, scratch, "native-review");
    assert.equal(requests.length, 0);
    await client.spawnProc(procId, {
      command: "/bin/sleep",
      args: ["600"],
      cwd: scratch,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    await assert.rejects(
      native().endSession(key, scratch, "native-review"),
      /incomplete/
    );
    assert.equal(
      requests.filter((path) => path.endsWith("/instance/dispose")).length,
      0
    );
    const listed = await client.list();
    const proc = listed.procs.find(
      (entry) => entry.procId === procId && entry.alive
    );
    assert.ok(proc);
    const stat = await readFile(`/proc/${proc.pid}/stat`, "utf8");
    const identity = {
      epoch: listed.epoch,
      procId,
      pid: proc.pid,
      startedAt: stat.slice(stat.lastIndexOf(")") + 2).split(" ")[19],
      url: `http://127.0.0.1:${server.port}`,
    };
    await Bun.write(
      recordPath,
      JSON.stringify({ active: identity, retired: [] })
    );
    await client.spawnProc("opencode-server-unrecorded-proof", {
      command: "/bin/sleep",
      args: ["600"],
      cwd: scratch,
      env: { PATH: process.env.PATH ?? "/usr/bin:/bin" },
    });
    await assert.rejects(
      native().endSession(key, scratch, "native-review"),
      /incomplete/
    );
    assert.equal(
      requests.filter((path) => path.endsWith("/instance/dispose")).length,
      0
    );
    await endProc(client, "opencode-server-unrecorded-proof");
    await until(
      () => client.list(),
      (reading) =>
        !reading.procs.some(
          (entry) =>
            entry.procId === "opencode-server-unrecorded-proof" && entry.alive
        )
    );

    state = "busy";
    const pendingHarness = native();
    const address = Promise.withResolvers<void>();
    let awaitingAddress = false;
    const recovery = pendingHarness.reattach(
      spec,
      context(() => {
        awaitingAddress = true;
        return address.promise;
      })
    );
    recovery.catch(() => undefined);
    await until(async () => awaitingAddress, Boolean);
    const abortsBeforePending = requests.filter((path) =>
      path.endsWith("/abort")
    ).length;
    await assert.rejects(
      pendingHarness.endSession(key, scratch, "native-review"),
      /incomplete/
    );
    assert.equal(
      requests.filter((path) => path.endsWith("/abort")).length,
      abortsBeforePending + 1
    );
    assert.equal(state, "idle");
    address.reject(new SessionAddressRefused("private final refusal"));
    await assert.rejects(recovery, /private final refusal/);
    console.log(
      "SECOND 6 native Stop aborts its conversation during pending operations, gates receipt on completeness, and confirms an empty server reading"
    );

    const beforeShared = requests.length;
    state = "busy";
    await pendingHarness.endSession(key, scratch, "other-row", [key]);
    assert.equal(requests.length, beforeShared);
    assert.equal(state, "busy");
    console.log(
      "REVIEW 6-native another row's claimed conversation receives no abort or disposal"
    );

    let refusals = 0;
    const refusedHarness = native();
    await assert.rejects(
      refusedHarness.reattach(
        spec,
        context(() => {
          refusals += 1;
          return Promise.reject(
            new SessionAddressRefused("private final refusal")
          );
        })
      ),
      /private final refusal/
    );
    assert.equal(refusals, 1);
    await refusedHarness.endSession(key, scratch, "native-review");
    assert.equal(state, "idle");
    assert.ok(
      requests.filter((path) => path.endsWith("/abort")).length >
        abortsBeforePending
    );
    assert.equal(
      requests.filter((path) => path.endsWith("/instance/dispose")).length,
      1
    );
    console.log(
      "REVIEW 2-native final address refusal is not retried and releases native recovery before end"
    );
    console.log("native-ownership-proofs-pass");
  } finally {
    await server.stop(true);
    client.close();
    sessiond.kill("SIGTERM");
    await sessiond.exited;
  }
}
