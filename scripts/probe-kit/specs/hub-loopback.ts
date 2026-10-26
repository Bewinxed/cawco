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
 * 8. The fleet's agent, whose machine id is the hub's: the hub's register
 *    answer says `hostsHub`, and it carries nothing. Then a machine of
 *    another id reaching the hub at 127.0.0.1, at ::1 and at localhost in
 *    turn: each says that is this computer's loopback. None listens on P, a
 *    preview port or 3000 (`ss`, by its pid).
 * 8b. A dev server started on 3000 after the agent registered binds it on
 *    each of 127.0.0.1 and ::1 that 3000 was free on before the agent
 *    started; a family something else held then is said with its holder.
 * 9. The hub's computer, as installed (HOST unset, so every interface): the
 *    installer writes the dashboard on its one port P, 0.0.0.0:P as
 *    `cawco-dashboard.socket` (required) and, where this computer has an
 *    IPv6 loopback, [::1]:P as `cawco-dashboard-local.socket` (`Service=`
 *    the dashboard, wanted through its `Sockets=`), and as as many plist
 *    keys; serve.js, run under `systemd-socket-activate` on those very
 *    listens, answers the dashboard at 127.0.0.1:P and [::1]:P, its `/ws`
 *    gate admits `http://localhost:P` and refuses another origin, and none
 *    of the hub, the agent or serve.js listens on 3000.
 * 9c. serve.js handed the network socket alone (the loopback unit did not
 *    open): it says so, and answers the dashboard there.
 *
 *   bun scripts/probe-kit/run.ts hub-loopback
 */
import { join } from "node:path";
import { $ } from "bun";
import { type Reply, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";
import { freePort, publishBuild, serveUnder } from "../socket-served";

const SPACES = /\s+/u;
const NOT_WORD = /\W/gu;
const LISTEN_STREAM = /^ListenStream=(.+)$/gmu;
const SOCK_NODE = /<key>SockNodeName<\/key>\s*<string>([^<]*)<\/string>/gu;
const SOCKET_KEY = /<key>(dashboard[a-z-]*)<\/key>\s*<array>/gu;
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

const FAMILIES = ["127.0.0.1", "::1"] as const;

/** What held 3000 on each loopback family before the agent started, as `ss` names it; absent where 3000 was free. */
export type HeldBefore = Partial<Record<(typeof FAMILIES)[number], string>>;

/**
 * Who holds 3000 on 127.0.0.1 and on ::1 now, read before the agent starts:
 * a host's own dev server, or an install from before the dashboard moved to
 * 3455 (its cawco-dashboard.socket on `0.0.0.0:3000`), leaves its
 * 127.0.0.1:3000 never free, whatever the agent does.
 */
export const holdersOf3000 = async (): Promise<HeldBefore> => {
  const holders = (await $`ss -Hltnp`.text())
    .split("\n")
    .map((line) => line.split(SPACES))
    .filter((fields) => fields[3]?.endsWith(":3000"))
    .map(
      (fields) =>
        `${fields[3]} ${fields.slice(5).join(" ") || "(a process this user cannot see)"}`
    )
    .join("; ");
  const held: HeldBefore = {};
  for (const hostname of FAMILIES) {
    try {
      Bun.serve({
        hostname,
        port: 3000,
        fetch: () => new Response(null),
      }).stop(true);
    } catch (error) {
      held[hostname] = holders || (error as Error).message;
    }
  }
  return held;
};

/**
 * A dev server on 3000, on each loopback family 3000 was free on before the
 * agent started (`before`, {@link holdersOf3000}): each must bind and answer.
 * A family something else held then is said with its holder and asserts
 * nothing; that the agent holds no 3000 is `ss`'s word on it (1b, 8).
 */
export const devServerOn3000 = async (
  before: HeldBefore
): Promise<{ ok: boolean; said: string[] }> => {
  const said: string[] = [];
  let ok = true;
  for (const hostname of FAMILIES) {
    const holder = before[hostname];
    if (holder) {
      said.push(
        `${hostname}:3000 was held before the agent started, by ${holder}`
      );
      continue;
    }
    try {
      const dev = Bun.serve({
        hostname,
        port: 3000,
        fetch: () => new Response("dev server"),
      });
      const answer = await fetch(
        `http://${hostname.includes(":") ? `[${hostname}]` : hostname}:3000/`
      ).then((one) => one.text());
      said.push(`${hostname}:3000 bound, answers "${answer}"`);
      ok &&= answer === "dev server";
      await dev.stop(true);
    } catch (error) {
      said.push(`${hostname}:3000 ${(error as Error).message}`);
      ok = false;
    }
  }
  return { ok, said };
};

/**
 * The dashboard's sockets as `cawco service install` writes them on the
 * hub's computer (cli service.ts `dashboardSocketTexts`), on the dashboard's
 * port `port` and the installer's default host, every interface (core
 * install-script.ts `HOST`): read from the installing shell's environment,
 * as the installer reads it, and put back after.
 */
const installedSocket = async (port: number) => {
  const names = ["HOST", "CAWCO_LOCAL_DASHBOARD_PORT"] as const;
  const was = names.map((name) => process.env[name]);
  process.env.HOST = "0.0.0.0";
  process.env.CAWCO_LOCAL_DASHBOARD_PORT = String(port);
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

/** The agent's line for a hub on its computer, from `logs`, once said; undefined when it never is. */
export const onThisComputerLine = (
  logs: () => Promise<string>,
  name: string
): Promise<string | undefined> =>
  until(
    `the agent's line for a hub at ${name}`,
    async () =>
      (await logs())
        .split("\n")
        .find((one) => one.includes(`the hub at ${name} is on this computer`)),
    Boolean,
    30_000
  ).catch(() => undefined);

/**
 * 8. The hub on the agent's computer, by the hub's own word and by the
 * address alone: the fleet's agent (its machine id is the hub's, so the
 * register answer says `hostsHub`), then a machine of another id reaching
 * the hub at each loopback name. Each says why and listens on nothing of the
 * hub's (`ss`, by its pid).
 */
async function nothingOnTheHubsComputer(
  kit: Kit,
  fleet: KitFleet,
  agentPid: number
) {
  const { port } = new URL(fleet.base);
  const among = loopbackPorts(fleet);
  const word = await onThisComputerLine(() => fleet.logs("agent"), "127.0.0.1");
  const wordHeld = await listening(agentPid, among);
  kit.check(
    "8: an agent the hub's register answer names its own computer (hostsHub) carries nothing, and listens on neither the loopback port, a preview port nor 3000",
    !!word?.includes("the hub says this is its own computer") &&
      wordHeld.length === 0,
    `${word ?? "no line"}; listening on ${portList(wordHeld)} of ${portList(among)}`
  );
  for (const [name, url] of [
    ["127.0.0.1", `ws://127.0.0.1:${port}/ws`],
    ["[::1]", `ws://[::1]:${port}/ws`],
    ["localhost", `ws://localhost:${port}/ws`],
  ] as const) {
    const machine = await fleet.launchMachine(
      `elsewhere-${name.replace(NOT_WORD, "")}`,
      { CAWCO_HUB_URL: url }
    );
    const line = await onThisComputerLine(machine.logs, name);
    const held = await listening(machine.agent.pid, among);
    kit.check(
      `8: an agent of another machine id that reaches the hub at ${name} carries nothing: that is this computer's loopback, and it listens on neither the loopback port, a preview port nor 3000`,
      !!line?.includes("it is this computer's loopback") && held.length === 0,
      `${line ?? "no line"}; listening on ${portList(held)} of ${portList(among)}`
    );
  }
}

/** `text`'s `ListenStream=` addresses, in order. */
const listensOf = (text: string): string[] =>
  [...text.matchAll(LISTEN_STREAM)].map((match) => match[1] as string);

/** What each of `addresses` answers once it does: `<address> 200 (the dashboard)`, or what came instead. */
const dashboardAt = (addresses: string[], host: string) =>
  Promise.all(
    addresses.map(async (address) => {
      const answer = await until(
        `the dashboard at ${address}`,
        () => fetchOr(`http://${address}/`, { headers: { host } }),
        (one) => one?.status === 200,
        30_000
      ).catch(() => undefined);
      const text = (await answer?.text()) ?? "";
      return `${address} ${answer?.status ?? "no answer"}${text.includes("_app/immutable") ? " (the dashboard)" : ""}`;
    })
  );

/**
 * Whether the installer's loopback socket is as written for this computer:
 * [::1]:`port` alone, wanted by the dashboard and starting it, where it has
 * an IPv6 loopback; none at all where it has not (0.0.0.0 answers
 * 127.0.0.1 already).
 */
const loopbackAsWritten = (
  texts: Awaited<ReturnType<typeof installedSocket>>,
  port: number,
  v6: boolean
): boolean => {
  const [, loopback] = texts.systemd;
  if (!v6) {
    return (
      loopback === undefined &&
      texts.systemd.length === 1 &&
      !texts.service.includes("Sockets=")
    );
  }
  return (
    loopback?.unit === "cawco-dashboard-local.socket" &&
    JSON.stringify(listensOf(loopback.text)) ===
      JSON.stringify([`[::1]:${port}`]) &&
    loopback.text.includes("FileDescriptorName=dashboard-local") &&
    loopback.text.includes("Service=cawco-dashboard.service") &&
    texts.service.includes(
      "Sockets=cawco-dashboard.socket cawco-dashboard-local.socket"
    ) &&
    !texts.service.includes("Requires=cawco-dashboard-local.socket")
  );
};

/**
 * 9. The hub's computer: the dashboard's sockets as the installer writes
 * them, under systemd's own socket activation, with serve.js on the
 * published build; then (9c) serve.js handed the network socket alone, as
 * systemd hands it when the loopback socket unit did not open.
 * `started` is handed each serve.js process, for the spec to end; `fleetPids`
 * are the hub's and the agent's, which with serve.js hold no 3000.
 */
async function hubComputer(
  kit: Kit,
  fleet: KitFleet,
  fleetPids: number[],
  started: (child: ReturnType<typeof Bun.spawn>) => void
): Promise<void> {
  const dashboard = fleet.localDashboardPort;
  const local = `http://localhost:${dashboard}`;
  const v6 = hasIpv6Loopback();
  const texts = await installedSocket(dashboard);
  const [own, loopback] = texts.systemd;
  const networkListens = listensOf(own?.text ?? "");
  const loopbackListens = listensOf(loopback?.text ?? "");
  const nodes = [...texts.launchd.matchAll(SOCK_NODE)].map(
    (match) => match[1] as string
  );
  const keys = [...texts.launchd.matchAll(SOCKET_KEY)].map(
    (match) => match[1] as string
  );
  kit.check(
    `9: the installer writes the dashboard on its one port P (${dashboard}): 0.0.0.0:P as its own socket, required, ${v6 ? "and [::1]:P as the loopback socket, wanted by the dashboard and starting it" : "and no loopback socket (this computer has no ::1)"}, and as ${v6 ? "two plist socket keys" : "one plist socket key"}`,
    own?.unit === "cawco-dashboard.socket" &&
      JSON.stringify(networkListens) ===
        JSON.stringify([`0.0.0.0:${dashboard}`]) &&
      texts.service.includes("Requires=cawco-dashboard.socket") &&
      loopbackAsWritten(texts, dashboard, v6) &&
      JSON.stringify(keys) ===
        JSON.stringify(["dashboard", ...(v6 ? ["dashboard-local"] : [])]) &&
      JSON.stringify(nodes) ===
        JSON.stringify(["0.0.0.0", ...(v6 ? ["::1"] : [])]),
    `${own?.unit}: ${networkListens.join(", ")}; ${loopback?.unit ?? "no loopback unit"}: ${loopbackListens.join(", ") || "none"}; plist keys ${keys.join(", ")}, SockNodeName ${nodes.join(", ")}`
  );
  kit.note(
    `9: the socket units as written:\n${texts.systemd.map((one) => `# ${one.unit}\n${one.text}`).join("\n")}`
  );
  await publishBuild();
  const serveLog = join(kit.out, "serve.log");
  const both = serveUnder(
    fleet,
    [
      ...networkListens.map((address) => ({ address, name: "dashboard" })),
      ...loopbackListens.map((address) => ({
        address,
        name: "dashboard-local",
      })),
    ],
    serveLog
  );
  started(both);
  const loads = await dashboardAt(
    [`127.0.0.1:${dashboard}`, ...(v6 ? [`[::1]:${dashboard}`] : [])],
    `localhost:${dashboard}`
  );
  const ws = `ws://127.0.0.1:${dashboard}/ws/dashboard`;
  const heard = await socketHeard(ws, {
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
    "9: on the hub's computer serve.js answers on every address its sockets name: localhost:P is the dashboard by each loopback family, and its /ws gate admits that origin and refuses another",
    loads.every((line) => line.endsWith("(the dashboard)")) &&
      heard === "heard" &&
      foreign.startsWith("closed"),
    `${loads.join("; ")}; /ws ${local}: ${heard}, ${FOREIGN}: ${foreign}; serve.js said: ${said}`
  );
  const on3000 = await Promise.all(
    [...fleetPids, both.pid].map(
      async (pid) => `${pid}: ${portList(await listening(pid, [3000]))}`
    )
  );
  kit.check(
    "9: with the dashboard up on P, none of the hub, the agent or serve.js listens on 3000",
    on3000.every((line) => line.endsWith(": none")),
    `3000 held by pid ${on3000.join("; ")}`
  );
  both.kill();
  await both.exited;

  // 9c. The loopback socket unit did not open: systemd hands the service
  // the network socket's descriptors alone (src/core/service.c
  // `service_collect_fds`).
  const alone = await freePort();
  const aloneLog = join(kit.out, "serve-alone.log");
  const networkOnly = serveUnder(
    fleet,
    [{ address: `127.0.0.1:${alone}`, name: "dashboard" }],
    aloneLog
  );
  started(networkOnly);
  const [aloneLoad = ""] = await dashboardAt(
    [`127.0.0.1:${alone}`],
    `127.0.0.1:${alone}`
  );
  const aloneSaid =
    `${await Bun.file(aloneLog).text()}${await Bun.file(`${aloneLog}.err`).text()}`.trim();
  kit.check(
    "9c: with the loopback socket missing (its unit did not open), serve.js says so and the dashboard answers on its network address",
    aloneLoad.endsWith("(the dashboard)") &&
      aloneSaid.includes("no dashboard-local socket was handed over"),
    `${aloneLoad}; serve.js said: ${aloneSaid}`
  );
}

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond, { bind: "::", at: "127.0.0.1" });
  /** serve.js under systemd's socket activation: the hub's computer (9). */
  let hubSide: ReturnType<typeof Bun.spawn> | undefined;
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    const hub = fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();
    const before = await holdersOf3000();
    const agent = fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    // 8.
    await nothingOnTheHubsComputer(kit, fleet, agent.pid);

    // 8b.
    const devServer = await devServerOn3000(before);
    kit.check(
      "8b: a dev server started on 3000 after the agent registered binds it on each loopback family 3000 was free on before",
      devServer.ok,
      devServer.said.join("; ")
    );

    // 9.
    await hubComputer(kit, fleet, [hub.pid, agent.pid], (child) => {
      hubSide = child;
    });
  } finally {
    hubSide?.kill();
    await hubSide?.exited;
  }
};

const spec: Spec = {
  group: "The hub and machines",
  name: "hub-loopback",
  run,
};
export default spec;
