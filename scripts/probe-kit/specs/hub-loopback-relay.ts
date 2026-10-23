/**
 * A hub at this computer's own interface address is on this computer, and the
 * agent carries nothing there (agent hub-loopback.ts `onThisComputer`):
 * obelisk's agent reached its hub at 192.168.3.100, its own LAN address, took
 * 3455 and the preview range, and the dashboard socket's 3455 listen failed
 * (2026-10-18).
 *
 * HOST ONLY. The scratch hub stands on this computer's first IPv4 address off
 * loopback. A workspace has no such address: its network namespace holds
 * `lo` alone, and its proxy refuses this host's own addresses and private
 * ranges (core boundary-reach.ts `DENIED_RESOLVED_ADDRESSES`; "srt's own
 * guard refuses loopback, link-local, multicast, cloud metadata and this
 * host's own addresses besides"), so there this spec fails at its first
 * check, saying so. The relay to a hub on another computer is proven by
 * stage 2's joined machine (scripts/binary/prove-stage2.sh, rig install).
 *
 * 0. Runs anywhere, first: the relay over the tailnet's HTTPS. A scratch hub
 *    serves HTTPS on the tailnet stub's address `::1` (tailnet-https.ts's
 *    stub), where plain http answers the door's 308 alone; the agent's relay
 *    carries it as an agent on another computer does (agent hub-loopback.ts
 *    `carryElsewhere`, past the check that finds every address here this
 *    computer's own), told by the hub's word that it serves the name on
 *    `::1`. `http://localhost:<P>/session` answers 200 with the dashboard
 *    and its `/ws` opens through the relay and hears the hub; told HTTPS
 *    stopped, the same listeners carry plain http (the door's 308 comes
 *    back), and told again, 200, with no restart. The stub's certificate is
 *    its own, so this process takes it unverified
 *    (NODE_TLS_REJECT_UNAUTHORIZED, which Bun reads per request); verifying
 *    the real name is the two-computer check's (the Mac on obelisk).
 * 1. The fleet's agent, whose machine id is the hub's: the register answer
 *    says `hostsHub`; it carries nothing, and listens on neither P, a
 *    preview port nor 3000 (`ss`, by its pid).
 * 2. A machine of another id reaching the hub at this computer's LAN
 *    address: the address is this computer's own; it carries nothing and
 *    listens on none of them.
 * 3. A dev server started on 3000 afterwards binds it on each loopback
 *    family 3000 was free on before the agents started.
 *
 *   bun scripts/probe-kit/run.ts hub-loopback-relay   # on the host, outside every workspace
 */
import { networkInterfaces } from "node:os";
import { carryElsewhere } from "../../../packages/agent/src/hub-loopback";
import { until } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { freePort } from "../socket-served";
import {
  devServerOn3000,
  holdersOf3000,
  listening,
  loopbackPorts,
  onThisComputerLine,
  portList,
  respond,
  socketHeard,
} from "./hub-loopback";
import { NAME, plainAt, tailnetStub } from "./tailnet-https";

/** This computer's first IPv4 address off loopback, or none. */
const ownAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flat()
    .find((one) => one && !one.internal && one.family === "IPv4")?.address;

/** 0: the relay over the tailnet's HTTPS, on this one computer. */
const overTailnet = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const stub = await tailnetStub(fleet);
  await stub.set("on");
  fleet.launch("hub", [], stub.env);
  await fleet.hubUp();
  // The hub again, its dashboard port the built dashboard's, which its TLS
  // listener relays to on loopback (as tailnet-https.ts stands it).
  const dashboardPort = Number(new URL(await fleet.dashboard()).port);
  await fleet.stop("hub");
  fleet.launch("hub", [], {
    ...stub.env,
    CAWCO_DASHBOARD_PORT: String(dashboardPort),
  });
  await fleet.hubUp();
  const serving = await until(
    "the hub serving HTTPS on the stub's tailnet address",
    async () =>
      (await (await fetch(`${fleet.base}/api/tailnet-https`)).json()) as {
        state: string;
      },
    (read) => read.state === "serving",
    45_000
  );
  const plainOnTailnet = await plainAt(dashboardPort, "/session");
  kit.check(
    "0: the hub serves HTTPS on ::1, where plain http to the dashboard port answers the door's 308 alone",
    serving.state === "serving" &&
      plainOnTailnet === `308 https://${NAME}:${dashboardPort}/session`,
    `${JSON.stringify(serving)}; plain http on ::1: ${plainOnTailnet}`
  );

  const local = await freePort();
  const tailnet = { name: NAME, ips: ["::1"] };
  const rejecting = process.env.NODE_TLS_REJECT_UNAUTHORIZED;
  process.env.NODE_TLS_REJECT_UNAUTHORIZED = "0";
  const loopback = await carryElsewhere(
    "[::1]",
    ["::1"],
    {
      dashboard: { hub: dashboardPort, local },
      previews: { first: 1, last: 0 },
    },
    tailnet
  );
  const session = async () => {
    const answer = await fetch(`http://localhost:${local}/session`, {
      redirect: "manual",
    });
    const body = await answer.text();
    return `${answer.status} ${answer.headers.get("location") ?? ""} ${body.includes("<html") ? "html" : body.slice(0, 80)}`.trim();
  };
  try {
    const page = await session();
    const heard = await socketHeard(`ws://localhost:${local}/ws/dashboard`, {
      origin: `http://localhost:${local}`,
    });
    kit.check(
      "0: told the hub serves HTTPS on the address it reaches, the relay carries http://localhost:<P>/session over https: 200 with the dashboard, and its /ws opens through the relay and hears the hub",
      page === "200  html" && heard === "heard",
      `session: ${page}; socket: ${heard}`
    );
    loopback.follow(undefined);
    const plain = await session();
    loopback.follow(tailnet);
    const again = await session();
    kit.check(
      "0: told HTTPS stopped, the same listeners carry plain http (the door's 308 comes back to the browser); told again, 200, with no restart",
      plain.startsWith(`308 https://${NAME}:${dashboardPort}/session`) &&
        again === "200  html",
      `stopped: ${plain}; again: ${again}`
    );
  } finally {
    await loopback.stop();
    if (rejecting === undefined) {
      delete process.env.NODE_TLS_REJECT_UNAUTHORIZED;
    } else {
      process.env.NODE_TLS_REJECT_UNAUTHORIZED = rejecting;
    }
    await stub.set("absent");
    await fleet.stop("hub");
  }
};

const run = async (kit: Kit) => {
  await overTailnet(kit);
  const address = ownAddress();
  if (!address) {
    kit.check(
      "0: this computer has an address off loopback for the hub (run this spec on the host, outside every workspace)",
      false,
      "no interface but lo: a workspace's network namespace has lo alone"
    );
    return;
  }
  const fleet = await kit.fleet(respond, { bind: address, at: address });
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  const before = await holdersOf3000();
  const agent = fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const among = loopbackPorts(fleet);

  // 1.
  const word = await onThisComputerLine(() => fleet.logs("agent"), address);
  const wordHeld = await listening(agent.pid, among);
  kit.check(
    `1: the agent the hub names its own computer (hostsHub), reaching it at ${address}, carries nothing and listens on neither the loopback port, a preview port nor 3000`,
    !!word?.includes("the hub says this is its own computer") &&
      wordHeld.length === 0,
    `${word ?? "no line"}; listening on ${portList(wordHeld)} of ${portList(among)}`
  );

  // 2.
  const other = await fleet.launchMachine("elsewhere-lan", {
    CAWCO_HUB_URL: `ws://${address}:${new URL(fleet.base).port}/ws`,
  });
  const line = await onThisComputerLine(other.logs, address);
  const held = await listening(other.agent.pid, among);
  kit.check(
    `2: an agent of another machine id reaching the hub at ${address}, this computer's own LAN address, carries nothing and listens on none of them`,
    !!line?.includes(`${address} is this computer's own address`) &&
      held.length === 0,
    `${line ?? "no line"}; listening on ${portList(held)} of ${portList(among)}`
  );

  // 3.
  const devServer = await devServerOn3000(before);
  kit.check(
    "3: a dev server started on 3000 after the agents registered binds it on each loopback family 3000 was free on before",
    devServer.ok,
    devServer.said.join("; ")
  );
};

const spec: Spec = { name: "hub-loopback-relay", run };
export default spec;
