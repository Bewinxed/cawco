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
import type { Kit, Spec } from "../kit";
import {
  devServerOn3000,
  holdersOf3000,
  listening,
  loopbackPorts,
  onThisComputerLine,
  portList,
  respond,
} from "./hub-loopback";

/** This computer's first IPv4 address off loopback, or none. */
const ownAddress = (): string | undefined =>
  Object.values(networkInterfaces())
    .flat()
    .find((one) => one && !one.internal && one.family === "IPv4")?.address;

const run = async (kit: Kit) => {
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
