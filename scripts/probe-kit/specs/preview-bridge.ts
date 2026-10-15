/**
 * A preview's stop wins over its bridge still opening (preview-bridge.ts): a
 * stop that comes while `open()` spawns the socat into the workspace's
 * network leaves no bridge process and no socket, and the open says it was
 * stopped.
 *
 * Drives the real module in-process. Only boundary.ts is swapped, by a
 * runtime Bun plugin, for `workspaceNetworks` naming a network namespace this
 * spec starts with bwrap (a user and network namespace, as a boundary's), a
 * server listening in it: the bridge's own setsid, setpriv, nsenter and socat
 * run as they do for a workspace. Runs where unprivileged user namespaces
 * are allowed: on the host, not inside a workspace boundary.
 *
 * 1. Each round starts `reachWorkspace` and issues `closeBridge` after a
 *    delay (0 to 60 ms, across the spawn); after both settle no process
 *    listens on the round's socket (`pgrep -f UNIX-LISTEN:<socket>`) and the
 *    socket is gone.
 * 2. At least one round's stop landed while its open spawned: the open
 *    answered that it was stopped.
 * 3. A bridge left to open stands (its socat runs, its socket is there, a
 *    request through it reaches the server), and `closeBridge` takes it all.
 */
import { existsSync } from "node:fs";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { Kit, Spec } from "../kit";

const PORT = 47_311;
const DELAYS_MS = [0, 1, 2, 4, 6, 8, 10, 15, 20, 30, 45, 60];
const BOUNDARY = /packages\/agent\/src\/boundary\.ts$/;
const STOPPED = "was stopped while its way into the workspace opened";

const bridgeAlive = async (socket: string): Promise<string> =>
  (await Bun.$`pgrep -f ${`UNIX-LISTEN:${socket}`}`.nothrow().quiet()).stdout
    .toString()
    .trim();

const run = async (kit: Kit) => {
  // The sandbox: a user and network namespace with a server on PORT inside.
  const sandbox = Bun.spawn(
    [
      "bwrap",
      "--unshare-user",
      "--unshare-net",
      "--die-with-parent",
      "--ro-bind",
      "/",
      "/",
      "--dev",
      "/dev",
      "--proc",
      "/proc",
      "socat",
      `TCP-LISTEN:${PORT},fork,reuseaddr,bind=127.0.0.1`,
      "SYSTEM:echo HTTP/1.0 200 OK; echo; echo bridged",
    ],
    { stdout: "ignore", stderr: "pipe" }
  );
  const children = `/proc/${sandbox.pid}/task/${sandbox.pid}/children`;
  let inner = 0;
  const deadline = Date.now() + 3000;
  while (!inner && Date.now() < deadline && sandbox.exitCode === null) {
    // biome-ignore lint/performance/noAwaitInLoops: waits for bwrap's child to exist
    await Bun.sleep(20);
    inner = Number(
      (await readFile(children, "utf8").catch(() => "")).trim().split(" ")[0]
    );
  }
  if (!inner) {
    kit.check(
      "0: a user and network namespace starts here (bwrap)",
      false,
      sandbox.exitCode === null
        ? "bwrap made no child in 3 s"
        : await new Response(sandbox.stderr).text()
    );
    return;
  }

  // Only boundary.ts is swapped: the bridge's code is the module's own.
  const networks = [{ inner }];
  (globalThis as { __probeNetworks?: unknown }).__probeNetworks = networks;
  Bun.plugin({
    name: "probe-boundary",
    setup(build) {
      build.onLoad({ filter: BOUNDARY }, () => ({
        contents:
          "export const workspaceNetworks = async () => globalThis.__probeNetworks;",
        loader: "ts",
      }));
    },
  });
  const runtime = await mkdtemp(join(tmpdir(), "pb-"));
  process.env.XDG_RUNTIME_DIR = runtime;
  const { closeBridge, reachWorkspace } =
    await import("../../../packages/agent/src/preview-bridge");
  const workspace = crypto.randomUUID();

  try {
    let stoppedMidSpawn = 0;
    const rounds: string[] = [];
    let clean = true;
    for (const [round, delay] of DELAYS_MS.entries()) {
      const instanceId = `race-${round}`;
      const socket = join(runtime, "cawco", "previews", `${instanceId}.sock`);
      const reaching = reachWorkspace(instanceId, workspace, PORT).then(
        () => "opened",
        (error: Error) => error.message
      );
      // biome-ignore lint/performance/noAwaitInLoops: one race at a time, each at its own delay
      await Bun.sleep(delay);
      await closeBridge(instanceId);
      const opened = await reaching;
      const alive = await bridgeAlive(socket);
      const there = existsSync(socket);
      if (opened.includes(STOPPED)) {
        stoppedMidSpawn += 1;
      }
      clean &&= !(alive || there);
      rounds.push(
        `${delay}ms: ${opened.includes(STOPPED) ? "stopped mid-spawn" : opened.slice(0, 60)}${alive ? `, alive ${alive}` : ""}${there ? ", socket left" : ""}`
      );
    }
    kit.check(
      "1: after each stop no bridge process listens on its socket and the socket is gone",
      clean,
      rounds.join("; ")
    );
    kit.check(
      "2: a stop landed while its open spawned, and that open said it was stopped",
      stoppedMidSpawn > 0,
      `${stoppedMidSpawn} of ${DELAYS_MS.length} rounds`
    );

    // 3. Left to open, a bridge stands and carries a request; the stop takes it.
    const socket = join(runtime, "cawco", "previews", "standing.sock");
    const at = await reachWorkspace("standing", workspace, PORT);
    const reply = await fetch(`http://localhost:${PORT}/`, { unix: at })
      .then((response) => response.text())
      .catch((error: Error) => error.message);
    const before = await bridgeAlive(socket);
    await closeBridge("standing");
    const after = await bridgeAlive(socket);
    kit.check(
      "3: a bridge left to open runs and carries a request; closeBridge takes its process and socket",
      at === socket &&
        reply.includes("bridged") &&
        before !== "" &&
        after === "" &&
        !existsSync(socket),
      `socket ${at}; reply ${JSON.stringify(reply.trim())}; pids before ${before || "none"}, after ${after || "none"}`
    );
  } finally {
    sandbox.kill("SIGKILL");
    await rm(runtime, { recursive: true, force: true });
  }
};

const spec: Spec = { name: "preview-bridge", run };
export default spec;
