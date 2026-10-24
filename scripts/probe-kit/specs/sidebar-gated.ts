/**
 * A session started from a page an agent opened in its project's browser
 * is that agent's check, nested under it, never the person's: the agent's
 * DevTools gate marks every page the agent opens (gate.ts `#mark`, core
 * `GATED_PAGE_HEADER`) before the page loads anything, the dashboard's
 * relay carries the mark to the hub on the page's socket, and the hub
 * stamps a start from that socket `check` under the session that owns the
 * page (server.ts `gatedOwner`), in that session's project.
 *
 *   bun scripts/probe-kit/run.ts sidebar-gated
 *
 * A scratch fleet with a project at the fleet's home and one at
 * `~/cockpit`, and a person's session P in cockpit. The machine's browser
 * registry and its gate run as the agent runs them (browser-gate-host.ts),
 * the browser on the local host; P's own door (a session outside every
 * workspace). As P's browser tool does, a raw CDP connection to the gate as
 * P opens a page on the dashboard (`Target.createTarget`: the gate opens it
 * blank, marks it and takes it there); from that page's own socket, a New
 * session start in the home folder that names neither parent nor project.
 *
 * Asserted: the gate gave P a page of its own; the start's row is `check`,
 * under P, in cockpit, though its folder is the home project's.
 *
 * Run on the host, outside every workspace boundary: the gate's Chromium
 * keeps its sandbox, which needs user namespaces a boundary refuses ("No
 * usable sandbox!").
 */
import { mkdir, mkdtemp, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import type { BrowserKey } from "../../../packages/core/src/browser";
import { MACHINE, MODEL, type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** How the gate host answers (browser-gate-host.ts). */
const HOST_LINE = "GATE-HOST ";

/** The machine's browser registry and its gates, in a process run with the fleet's HOME. */
const gateHostOf = (env: Record<string, string>) => {
  const child = Bun.spawn(
    [process.execPath, join(import.meta.dir, "..", "browser-gate-host.ts")],
    { env, stdin: "pipe", stdout: "pipe", stderr: "inherit" }
  );
  let next = 0;
  const waiting = new Map<
    number,
    { reject: (error: Error) => void; resolve: (value: unknown) => void }
  >();
  (async () => {
    const decoder = new TextDecoder();
    let pending = "";
    for await (const chunk of child.stdout) {
      pending += decoder.decode(chunk);
      const lines = pending.split("\n");
      pending = lines.pop() ?? "";
      for (const line of lines) {
        if (!line.startsWith(HOST_LINE)) {
          continue;
        }
        const body = JSON.parse(line.slice(HOST_LINE.length)) as {
          error?: string;
          id: number;
          ok: boolean;
          value?: unknown;
        };
        const one = waiting.get(body.id);
        waiting.delete(body.id);
        if (body.ok) {
          one?.resolve(body.value);
        } else {
          one?.reject(new Error(body.error));
        }
      }
    }
  })();
  return {
    call: (verb: string, args: object = {}): Promise<unknown> => {
      next += 1;
      const id = next;
      const answer = new Promise<unknown>((resolve, reject) => {
        waiting.set(id, { resolve, reject });
      });
      child.stdin.write(`${JSON.stringify({ id, verb, ...args })}\n`);
      child.stdin.flush();
      return answer;
    },
    end: async () => {
      child.kill("SIGTERM");
      await child.exited;
    },
  };
};

/** One raw CDP connection, as an agent's browser tool holds one through its gate. */
const cdpAt = (endpoint: string, headers: Record<string, string>) =>
  new Promise<{
    close: () => void;
    send: (
      method: string,
      params?: object,
      sessionId?: string
    ) => Promise<{
      error?: { message: string };
      result?: Record<string, unknown>;
    }>;
  }>((resolve, reject) => {
    const socket = new WebSocket(endpoint, { headers } as unknown as string[]);
    let next = 0;
    const waiting = new Map<number, (message: never) => void>();
    socket.onmessage = (event) => {
      const message = JSON.parse(String(event.data)) as { id?: number };
      if (message.id !== undefined) {
        waiting.get(message.id)?.(message as never);
      }
    };
    socket.onerror = () => reject(new Error(`the gate refused ${endpoint}`));
    socket.onopen = () =>
      resolve({
        close: () => socket.close(),
        send: (method, params, sessionId) =>
          new Promise((answer) => {
            next += 1;
            waiting.set(next, answer);
            socket.send(
              JSON.stringify({
                id: next,
                method,
                params: params ?? {},
                ...(sessionId ? { sessionId } : {}),
              })
            );
          }),
      });
  });

/**
 * A session started from a page an agent opened through its gate: P's own
 * door (a session outside every workspace), a page on the dashboard opened
 * as P's tool opens one (`Target.createTarget`, which the gate opens blank,
 * marks as P's and takes to the address), and from that page's own socket
 * a New session start that names neither parent nor project. Its id.
 */
async function gatedStart(
  kit: Kit,
  fleet: KitFleet,
  base: string,
  owner: string,
  projectId: string
): Promise<string> {
  const { home } = fleet;
  const data = await mkdtemp(join(tmpdir(), "cawco-sidebar-gate-"));
  const port = (() => {
    const probe = Bun.listen({
      hostname: "127.0.0.1",
      port: 0,
      socket: { data: () => undefined },
    });
    const free = probe.port;
    probe.stop(true);
    return free;
  })();
  const host = gateHostOf({
    ...(process.env as Record<string, string>),
    HOME: fleet.home,
    XDG_DATA_HOME: data,
    CAWCO_BROWSER_GATE_PORT: String(port),
    DOCKER_HOST: "unix:///nonexistent",
  });
  const key: BrowserKey = `project:${projectId}`;
  const instanceId = crypto.randomUUID();
  try {
    await host.call("watch");
    await host.call("runtime", { hidden: true });
    const door = (await host.call("door", {
      workspace: owner,
      project: projectId,
    })) as { endpoint: string; headers: Record<string, string> };
    await host.call("start", { key });
    const cdp = await cdpAt(door.endpoint, door.headers);
    const made = await cdp.send("Target.createTarget", {
      url: `${base}/session`,
    });
    const targetId = String(made.result?.targetId ?? "");
    kit.check(
      "the gate: P's tool opens a page of its own on the dashboard",
      targetId !== "",
      JSON.stringify(made)
    );
    const attached = await cdp.send("Target.attachToTarget", {
      targetId,
      flatten: true,
    });
    const session = String(attached.result?.sessionId ?? "");
    const evaluate = async (expression: string): Promise<unknown> =>
      (
        await cdp.send(
          "Runtime.evaluate",
          { expression, awaitPromise: true, returnByValue: true },
          session
        )
      ).result?.result;
    await until(
      "the gated page's dashboard connected to the hub",
      () =>
        evaluate(
          "location.pathname === '/session' && globalThis.__cawcoSocket?.readyState === 1"
        ),
      (value) => (value as { value?: unknown } | undefined)?.value === true,
      90_000
    );
    const envelope = {
      verb: "spawn",
      machineId: MACHINE,
      instanceId,
      requestId: crypto.randomUUID(),
      payload: {
        instanceId,
        cwd: home,
        harness: "claude",
        model: MODEL.claude,
        title: "Gated start",
        permissionMode: "bypassPermissions",
      },
    };
    await evaluate(`new Promise((resolve, reject) => {
      const ws = new WebSocket(\`\${location.protocol === "https:" ? "wss" : "ws"}://\${location.host}/ws/dashboard?protocol=6\`);
      ws.onopen = () => { ws.send(${JSON.stringify(JSON.stringify(envelope))}); resolve(true); };
      ws.onerror = () => reject(new Error("socket"));
    })`);
    await until(
      "the gated start's session",
      () => fleet.instance(instanceId)?.status,
      (status) => status === "running" || status === "sleeping",
      180_000
    );
    cdp.close();
    await host.call("stop", { key }).catch(() => undefined);
    await host.call("remove", { key }).catch(() => undefined);
  } finally {
    await host.end();
    await rm(data, { recursive: true, force: true });
  }
  return instanceId;
}

const run = async (kit: Kit): Promise<void> => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const cockpitDir = join(fleet.home, "cockpit");
  await mkdir(cockpitDir, { recursive: true });
  await Bun.$`git init -q -b main && echo code > README.md && git -c user.name=O -c user.email=o@probe.test add -A && git -c user.name=O -c user.email=o@probe.test commit -qm 'First commit'`
    .cwd(cockpitDir)
    .quiet();
  const project = async (name: string, cwd: string) =>
    (
      await fleet.api<{ id: string }>("/api/projects", {
        name,
        machineId: MACHINE,
        cwd,
        caw: false,
      })
    ).id;
  await project("Home folder", fleet.home);
  const cockpitId = await project("Cockpit", cockpitDir);
  const P = await fleet.spawn("claude", "Person in cockpit", cockpitDir, {
    projectId: cockpitId,
  });
  const base = await fleet.dashboard();
  const G = await gatedStart(kit, fleet, base, P, cockpitId);
  const [row] = fleet.query<{
    origin: string;
    parent_instance_id: string | null;
    project_id: string | null;
  }>(
    "SELECT origin, parent_instance_id, project_id FROM instances WHERE id = ?",
    G
  );
  kit.check(
    "the hub: a start from the page P's gate opened, in the home folder, naming no parent or project, is P's `check` in cockpit",
    row?.origin === "check" &&
      row.parent_instance_id === P &&
      row.project_id === cockpitId,
    JSON.stringify(row)
  );
};

export default {
  name: "sidebar-gated",
  host: "its gate's Chromium keeps its sandbox, which needs user namespaces a workspace's boundary refuses",
  run,
} satisfies Spec;
