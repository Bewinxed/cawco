/**
 * A scratch fleet talks only to its own hub (scratch-fleet.ts). On
 * 2026-10-20 a decision-pages run failed with "SQLiteError: no such table:
 * accounts": its hub's database was empty and its logs blank, yet `hubUp`
 * had passed, because something else answered `/health` on the hub's port.
 * The port came from a bind to port 0, closed at once, which the kernel
 * can hand the next run's bind, or any connection's local end, before the
 * hub binds it.
 *
 * 1. The fleet's service ports are leased (`PortPool`): its hub's port lies
 *    in a leased block outside the kernel's ephemeral range, and four more
 *    pools leased beside it in this process hand out none of its ports nor
 *    each other's (each block is held by `flock`, one holder at a time).
 * 2. A stand-in on the fleet's own hub port answers `/health` as another
 *    hub: `hubUp` refuses it at once, naming what answered and this fleet's
 *    hub id, and nothing runs against it.
 * 3. With the stand-in gone, the fleet's hub starts there and `hubUp`
 *    passes: `/health` says the id the fleet wrote beside its database.
 *
 *   bun scripts/probe-kit/run.ts fleet-own-hub
 */
import { readFile } from "node:fs/promises";
import { join } from "node:path";
import { PortPool } from "../../scratch-fleet";
import type { Kit, Spec } from "../kit";
import { respond } from "./hub-loopback";

/** Runs of whitespace, as the kernel lays its two numbers out. */
const SPACES = /\s+/u;

/** The kernel's ephemeral ports, as Linux says them. */
const ephemeral = async () => {
  const [first = 0, last = 0] = (
    await readFile("/proc/sys/net/ipv4/ip_local_port_range", "utf8")
  )
    .trim()
    .split(SPACES)
    .map(Number);
  return { first, last };
};

/** `count` ports from `pool`. */
const take = async (pool: PortPool, count: number) => {
  const ports: number[] = [];
  for (let n = 0; n < count; n += 1) {
    ports.push(await pool.next());
  }
  return ports;
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  const hubPort = Number(new URL(fleet.base).port);

  // 1.
  const range = await ephemeral();
  const pools = [
    new PortPool(),
    new PortPool(),
    new PortPool(),
    new PortPool(),
  ];
  const drawn = await Promise.all(pools.map((pool) => take(pool, 16)));
  for (const pool of pools) {
    pool.release();
  }
  const all = drawn.flat();
  kit.check(
    "1: the hub's port is leased, outside the kernel's ephemeral range, and four more pools leased beside the fleet draw none of its ports nor each other's",
    hubPort >= 20_000 &&
      hubPort < 60_000 &&
      (hubPort < range.first || hubPort > range.last) &&
      !all.includes(hubPort) &&
      new Set(all).size === all.length,
    JSON.stringify({
      hubPort,
      ephemeral: range,
      pools: drawn.map((p) => `${p[0]}-${p.at(-1)}`),
    })
  );

  // 2.
  const stranger = Bun.serve({
    hostname: "127.0.0.1",
    port: hubPort,
    fetch: () => Response.json({ ok: true, hubId: "another-run's-hub" }),
  });
  fleet.launch("hub");
  const started = Date.now();
  const refused = await fleet.hubUp().then(
    () => "",
    (error: Error) => error.message
  );
  const took = Date.now() - started;
  const own = (
    await readFile(join(fleet.sandbox, "hub", "hub-id"), "utf8")
  ).trim();
  await stranger.stop(true);
  kit.check(
    "2: a stand-in answering /health on the fleet's own hub port as another hub is refused at once, the refusal naming what answered and this fleet's hub id",
    refused.includes(`answered as "another-run's-hub"`) &&
      refused.includes(`not this fleet's hub ${own}`) &&
      refused.includes("nothing runs against it") &&
      took < 5000,
    JSON.stringify({ refused, took })
  );

  // 3.
  await fleet.stop("hub");
  fleet.launch("hub");
  const passed = await fleet.hubUp().then(
    () => "",
    (error: Error) => error.message
  );
  const health = (await fetch(`${fleet.base}/health`).then((r) =>
    r.json()
  )) as { hubId?: string };
  kit.check(
    "3: with the port its own again, the fleet's hub answers there with the id the fleet wrote beside its database, and hubUp passes",
    passed === "" && health.hubId === own,
    JSON.stringify({ passed, own, health: health.hubId })
  );
};

const spec: Spec = {
  group: "The probe kit's own rig",
  name: "fleet-own-hub",
  run,
};
export default spec;
