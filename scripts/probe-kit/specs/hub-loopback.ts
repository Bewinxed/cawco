/**
 * On the hub's own computer `http://localhost:P` (P the dashboard's loopback
 * port, core `localDashboardPort`, 3455 in production) is the dashboard's own
 * socket, and the agent there carries nothing; nothing of CawCo's takes 3000.
 * The agent's relay to a hub elsewhere (agent hub-loopback.ts) is proven by
 * hub-loopback-relay, on the host: a workspace has no address off loopback.
 *
 * A scratch fleet whose hub listens on every address (`::`), so an agent
 * reaches it at each loopback name.
 *
 * 8. The agent, connected to the hub at 127.0.0.1, at ::1 and at localhost
 *    in turn: each time it says the hub is on its computer and listens on
 *    neither P nor any preview port nor 3000 (`ss`, by its pid).
 * 8b. A dev server started on 3000 after the agent registered binds it on
 *    127.0.0.1 and ::1.
 * 9. The hub's computer: the dashboard's socket unit and plist as the
 *    installer writes them name the network address, 127.0.0.1:P and, where
 *    this computer has an IPv6 loopback, [::1]:P; serve.js, run under
 *    `systemd-socket-activate` on those very listens, answers the dashboard
 *    on each, and its `/ws` gate admits `http://localhost:P` and refuses
 *    another origin.
 *
 *   bun scripts/probe-kit/run.ts hub-loopback
 */
import { join } from "node:path";
import { $ } from "bun";
import { type Reply, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, ROOT, type Spec } from "../kit";

const SPACES = /\s+/;
const LISTEN_STREAM = /^ListenStream=(.+)$/gm;
const SOCK_NODE = /<key>SockNodeName<\/key>\s*<string>([^<]*)<\/string>/g;
/** Another origin, for the `/ws` gate to refuse. */
const FOREIGN = "http://localhost:9";

export const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/**
 * A socket at `url` with `headers`: `heard` once the hub speaks on it, or
 * how it closed. Every relay hop (core `previewWebSocket`) takes the
 * browser's socket before it opens its own, so a socket the gate behind it
 * refuses opens too, then closes: only the hub's own word says it got through.
 */
export const socketHeard = (url: string, headers: Record<string, string>) =>
  new Promise<string>((done) => {
    const ws = new (
      WebSocket as unknown as new (
        url: string,
        options: { headers: Record<string, string> }
      ) => WebSocket
    )(url, { headers });
    const timer = setTimeout(() => {
      ws.close();
      done("open, and silent for 10 s");
    }, 10_000);
    ws.onmessage = () => {
      clearTimeout(timer);
      ws.close();
      done("heard");
    };
    ws.onclose = (event) => {
      clearTimeout(timer);
      done(`closed ${event.code} ${event.reason}`.trim());
    };
  });

/** `ports` as runs: `41405–41416`. */
export const portList = (ports: number[]): string => {
  const sorted = ports.toSorted((a, b) => a - b);
  const runs: string[] = [];
  for (const port of sorted) {
    const last = runs.at(-1);
    const end = Number(last?.split("–").at(-1));
    if (last && port === end + 1) {
      runs[runs.length - 1] = `${last.split("–")[0]}–${port}`;
    } else {
      runs.push(String(port));
    }
  }
  return runs.join(", ") || "none";
};

/** The ports a fleet's agent may listen on for its hub: P, the preview range, and 3000 (which it never may). */
export const loopbackPorts = (fleet: KitFleet): number[] => {
  const [first = 0, last = -1] = (fleet.env.CAWCO_PREVIEW_PORTS ?? "")
    .split("-")
    .map(Number);
  const ports = [fleet.localDashboardPort, 3000];
  for (let port = first; port <= last; port += 1) {
    ports.push(port);
  }
  return ports;
};

/** The ports of `among` process `pid` listens on now, as `ss` lists them. */
export const listening = async (
  pid: number,
  among: number[]
): Promise<number[]> =>
  (await $`ss -Hltnp`.text())
    .split("\n")
    .filter((line) => line.includes(`pid=${pid},`))
    .map((line) => Number(line.split(SPACES)[3]?.split(":").at(-1)))
    .filter((port) => among.includes(port))
    .sort((a, b) => a - b);

/** Whether this computer can listen on `::1` (cli service.ts `hasIpv6Loopback`). */
export const hasIpv6Loopback = (): boolean => {
  try {
    Bun.serve({
      hostname: "::1",
      port: 0,
      fetch: () => new Response(null),
    }).stop(true);
    return true;
  } catch {
    // No `::1` here.
    return false;
  }
};

/** A dev server on 3000, on 127.0.0.1 and ::1 in turn: each bound and answering, or why not. */
export const devServerOn3000 = async (): Promise<string[]> => {
  const said: string[] = [];
  for (const hostname of ["127.0.0.1", "::1"]) {
    try {
      const dev = Bun.serve({
        hostname,
        port: 3000,
        fetch: () => new Response("dev server"),
      });
      // biome-ignore lint/performance/noAwaitInLoops: one dev server at a time on 3000, each stopped before the next binds
      const answer = await fetch(
        `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:3000/`
      ).then((one) => one.text());
      said.push(`${hostname}:3000 bound, answers "${answer}"`);
      await dev.stop(true);
    } catch (error) {
      said.push(`${hostname}:3000 ${(error as Error).message}`);
    }
  }
  return said;
};

const freePort = async (): Promise<number> => {
  const lease = Bun.serve({
    hostname: "127.0.0.1",
    port: 0,
    fetch: () => new Response(null),
  });
  const port = lease.port as number;
  await lease.stop(true);
  return port;
};

/**
 * The dashboard's socket as `cawco service install` writes it on the hub's
 * computer (cli service.ts `dashboardSocketTexts`), its network address at
 * 127.0.0.1:`network` and its loopback port `local`: read from the
 * installing shell's environment, as the installer reads it, and put back after.
 */
const installedSocket = async (network: number, local: number) => {
  const names = ["PORT", "HOST", "CAWCO_LOCAL_DASHBOARD_PORT"] as const;
  const was = names.map((name) => process.env[name]);
  process.env.PORT = String(network);
  process.env.HOST = "127.0.0.1";
  process.env.CAWCO_LOCAL_DASHBOARD_PORT = String(local);
  try {
    const { dashboardSocketTexts } =
      await import("../../../packages/cli/src/service");
    return dashboardSocketTexts();
  } finally {
    for (const [index, name] of names.entries()) {
      if (was[index] === undefined) {
        delete process.env[name];
      } else {
        process.env[name] = was[index];
      }
    }
  }
};

/** `url` fetched, or undefined when nothing answered. */
const fetchOr = async (url: string, init: RequestInit) => {
  try {
    return await fetch(url, init);
  } catch {
    // Nothing listens there yet: the caller asks again.
  }
};

/**
 * 8. The agent reaching its hub at each loopback name: the hub is on its
 * computer, and it listens on nothing of the hub's (`ss`, by its pid).
 */
async function nothingOnTheHubsComputer(kit: Kit, fleet: KitFleet) {
  const { port } = new URL(fleet.base);
  const among = loopbackPorts(fleet);
  for (const [name, url] of [
    ["127.0.0.1", `ws://127.0.0.1:${port}/ws`],
    ["[::1]", `ws://[::1]:${port}/ws`],
    ["localhost", `ws://localhost:${port}/ws`],
  ] as const) {
    // biome-ignore lint/performance/noAwaitInLoops: one agent at a time, each stopped before the next starts
    await fleet.stop("agent");
    const agent = fleet.launch("agent", [], { CAWCO_HUB_URL: url });
    await fleet.agentUp();
    const line = await until(
      `the agent's line for a hub at ${name}`,
      async () =>
        (await fleet.logs("agent"))
          .split("\n")
          .find((one) =>
            one.includes(`the hub at ${name} is on this computer`)
          ),
      Boolean,
      30_000
    ).catch(() => undefined);
    const held = await listening(agent.pid, among);
    kit.check(
      `8: an agent that reaches its hub at ${name} carries nothing: the hub is on its computer, and it listens on neither the loopback port, a preview port nor 3000`,
      !!line && held.length === 0,
      `${line ?? "no line"}; listening on ${portList(held)} of ${portList(among)}`
    );
  }
}

/**
 * 9. The hub's computer: the dashboard's socket as the installer writes it,
 * under systemd's own socket activation (`systemd-socket-activate`, one
 * `--listen` per `ListenStream=`), with serve.js on the published build.
 * `started` is handed serve.js's process, for the spec to end.
 */
async function hubComputer(
  kit: Kit,
  fleet: KitFleet,
  started: (child: ReturnType<typeof Bun.spawn>) => void
): Promise<void> {
  const dashboard = fleet.localDashboardPort;
  const local = `http://localhost:${dashboard}`;
  const network = await freePort();
  const v6 = hasIpv6Loopback();
  const texts = await installedSocket(network, dashboard);
  const listens = [...texts.systemd.matchAll(LISTEN_STREAM)].map(
    (match) => match[1] as string
  );
  const nodes = [...texts.launchd.matchAll(SOCK_NODE)].map(
    (match) => match[1] as string
  );
  kit.check(
    `9: the installer's dashboard socket listens where the network reaches it and on 127.0.0.1${v6 ? " and ::1" : " (this computer has no ::1)"} at the loopback port, in its systemd unit and its plist`,
    JSON.stringify(listens) ===
      JSON.stringify([
        `127.0.0.1:${network}`,
        `127.0.0.1:${dashboard}`,
        ...(v6 ? [`[::1]:${dashboard}`] : []),
      ]) &&
      JSON.stringify(nodes) ===
        JSON.stringify(["127.0.0.1", "127.0.0.1", ...(v6 ? ["::1"] : [])]),
    `ListenStream ${listens.join(", ")}; SockNodeName ${nodes.join(", ")}`
  );
  kit.note(`9: the socket unit as written:\n${texts.systemd}`);
  await $`bun ${join(ROOT, "apps/dashboard/scripts/publish-build.ts")}`.quiet();
  const serveLog = join(kit.out, "serve.log");
  started(
    Bun.spawn(
      [
        "systemd-socket-activate",
        ...listens.map((address) => `--listen=${address}`),
        `--fdname=${listens.map(() => "dashboard").join(":")}`,
        `--setenv=CAWCO_HUB_URL=${fleet.base}`,
        "node",
        join(ROOT, "apps/dashboard/serve.js"),
      ],
      {
        cwd: join(ROOT, "apps/dashboard"),
        env: { ...process.env, CAWCO_HUB_URL: fleet.base },
        stdout: Bun.file(serveLog),
        stderr: "pipe",
      }
    )
  );
  const loads = await Promise.all(
    listens.map(async (address) => {
      const answer = await until(
        `the dashboard at ${address}`,
        () =>
          fetchOr(`http://${address}/`, {
            headers: { host: `localhost:${dashboard}` },
          }),
        (one) => one?.status === 200,
        30_000
      ).catch(() => undefined);
      const text = (await answer?.text()) ?? "";
      return `${address} ${answer?.status ?? "no answer"}${text.includes("_app/immutable") ? " (the dashboard)" : ""}`;
    })
  );
  const ws = `ws://127.0.0.1:${dashboard}/ws/dashboard`;
  const own = await socketHeard(ws, {
    host: `localhost:${dashboard}`,
    origin: local,
    "sec-fetch-site": "same-origin",
  });
  const foreign = await socketHeard(ws, {
    host: `localhost:${dashboard}`,
    origin: FOREIGN,
    "sec-fetch-site": "same-site",
  });
  const said = (await Bun.file(serveLog).text()).trim();
  kit.check(
    "9: on the hub's computer serve.js answers on every address its socket names: localhost:P is the dashboard, and its /ws gate admits that origin and refuses another",
    loads.every((line) => line.endsWith("(the dashboard)")) &&
      own === "heard" &&
      foreign.startsWith("closed"),
    `${loads.join("; ")}; /ws ${local}: ${own}, ${FOREIGN}: ${foreign}; serve.js said: ${said}`
  );
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond, { bind: "::", at: "127.0.0.1" });
  /** serve.js under systemd's socket activation: the hub's computer (9). */
  let hubSide: ReturnType<typeof Bun.spawn> | undefined;
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // 8.
    await nothingOnTheHubsComputer(kit, fleet);

    // 8b.
    const devServer = await devServerOn3000();
    kit.check(
      "8b: a dev server started on 3000 after the agent registered binds it on 127.0.0.1 and ::1",
      devServer.every((line) => line.includes('answers "dev server"')),
      devServer.join("; ")
    );

    // 9.
    await hubComputer(kit, fleet, (child) => {
      hubSide = child;
    });
  } finally {
    hubSide?.kill();
    await hubSide?.exited;
  }
};

const spec: Spec = { name: "hub-loopback", run };
export default spec;
