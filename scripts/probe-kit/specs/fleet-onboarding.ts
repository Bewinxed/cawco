/**
 * A machine's first minutes on a hub whose fleet is not empty, read per
 * commit on a scratch fleet (real hub, agent and sessiond; Claude Code
 * against the mock model). Before the machine joins, the fleet holds three
 * npx MCP rows (`pkg@latest`) whose npm is pointed at a port nothing listens
 * on, as slow as a machine with no route to its registry; a stdio server
 * limited to `linux` (core `FleetMcpServer.platforms`); and two plugins of a
 * marketplace on the hub's disk. The machine joins under a machine id the
 * hub has never seen.
 *
 * - It is joined (online) only once it has answered its welcome (READY,
 *   hub fleet-sync.ts): the row is never online with the welcome
 *   unacknowledged, and the hub's log says the welcome was acknowledged.
 * - A Claude session asked within 5 s of it joining starts: the welcome's
 *   policy is written before READY, so nothing a start needs waits on npm.
 * - Each item's converge shows on its row (`fleetItems`): "setting up n/m"
 *   while the npx rows are in npm; each settles within 120 s of joining,
 *   the npx rows failed in npm's words.
 * - The server limited to `linux` reaches the new machine on its welcome
 *   and reads applied: the hub reads its platform off its register's `os`.
 * - One MCP row changed sends exactly one delta item, the agent takes that
 *   one item, and no other item's converge is said again.
 * - Nothing moved, nothing sent: three places opened and archived on a
 *   project with no rows, and a fleet change that moves nothing, send the
 *   machine no delta (the hub says why).
 *
 *   bun scripts/probe-kit/run.ts fleet-onboarding
 */
import { mkdir } from "node:fs/promises";
import { join } from "node:path";
import type { AgentRow, FleetPlugin } from "../../../packages/core/src/index";
import { MACHINE, type Reply, until } from "../../scratch-fleet";
import type { KitFleet, Spec } from "../kit";

const NPX_ROWS = ["probe-npx-a", "probe-npx-b", "probe-npx-c"];
/** The server only a linux machine runs. */
const LINUX_ROW = "probe-linux-only";
const MARKETPLACE = "onboard-plugins";
const PLUGINS = ["onboard-one", "onboard-two"];
/** How soon after joining a session is asked for. */
const START_WITHIN_MS = 5000;
/** How long after the last quiet change the agent's log is read for a delta it should not have had. */
const QUIET_MS = 10_000;
/** How soon after the machine joins every item must have settled. */
const OUTCOME_MS = 120_000;

/** What the hub's and the agent's logs say before a fleet line. */
const FLEET_PREFIX = /^.*\[fleet\] /;

const respond = (): Reply => ({ everyMs: 5, words: ["ok"] });

/** A marketplace with {@link PLUGINS} on the hub's disk, linked, each plugin in the fleet. */
const plugins = async (fleet: KitFleet): Promise<string> => {
  const source = join(fleet.sandbox, "onboard-market");
  await Bun.write(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: MARKETPLACE,
      owner: { name: "probe" },
      plugins: PLUGINS.map((name) => ({ name, source: `./plugins/${name}` })),
    })
  );
  for (const name of PLUGINS) {
    const dir = join(source, "plugins", name);
    // biome-ignore lint/performance/noAwaitInLoops: two small plugins, written one after the other
    await Bun.write(
      join(dir, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name, version: "1.0.0" })
    );
    await Bun.write(
      join(dir, "skills", "noop", "SKILL.md"),
      `---\nname: ${name}-noop\ndescription: does nothing\n---\nNothing.\n`
    );
  }
  await fleet.fetched(
    (frame) => (frame.link?.source === source ? frame.link : undefined),
    () => fleet.api("/api/fleet/marketplace-links", { source })
  );
  for (const name of PLUGINS) {
    // biome-ignore lint/performance/noAwaitInLoops: one plugin's PUT at a time
    await fetch(`${fleet.base}/api/fleet/plugins/${name}@${MARKETPLACE}`, {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    });
  }
  const held = await until(
    "both plugins fetched by the hub",
    async () =>
      (await fleet.api<{ config: { plugins: FleetPlugin[] } }>("/api/fleet"))
        .config.plugins,
    (rows) =>
      PLUGINS.every((name) =>
        rows.some((row) => row.id === `${name}@${MARKETPLACE}` && row.hash)
      ),
    60_000
  ).catch(() => []);
  return `${held.length} plugin row(s)`;
};

const spec: Spec = {
  name: "fleet-onboarding",
  async run(kit) {
    const { check } = kit;
    const fleet = await kit.fleet(respond);
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.fileAccount();

    const gone = Bun.serve({
      port: 0,
      hostname: "127.0.0.1",
      fetch: () => new Response(),
    });
    const deadPort = gone.port;
    await gone.stop(true);
    const pids = join(fleet.sandbox, "probe-linux-pids");
    await mkdir(pids, { recursive: true });
    const put = async (name: string, body: object) =>
      (
        await fetch(`${fleet.base}/api/fleet/mcp/${name}`, {
          method: "PUT",
          headers: { "content-type": "application/json" },
          body: JSON.stringify(body),
        })
      ).status;
    const puts = await Promise.all([
      ...NPX_ROWS.map((name) =>
        put(name, {
          config: {
            command: "npx",
            args: ["-y", `${name}@latest`],
            env: { npm_config_registry: `http://127.0.0.1:${deadPort}/` },
          },
          enabled: true,
        })
      ),
      put(LINUX_ROW, {
        config: {
          command: process.execPath,
          args: [join(import.meta.dir, "../fixtures/shared-mcp-server.ts")],
          env: { PROBE_MCP_PIDS: pids },
        },
        enabled: true,
        platforms: ["linux"],
      }),
    ]);
    const pluginRows = await plugins(fleet);
    check(
      `the fleet holds 3 npx rows (npm at a dead port), ${LINUX_ROW} (linux only) and 2 plugins before the machine joins (${puts.join(", ")}; ${pluginRows})`,
      puts.every((status) => status === 200) &&
        pluginRows === "2 plugin row(s)",
      JSON.stringify({ puts, pluginRows })
    );

    const row = async () =>
      (await fleet.api<AgentRow[]>("/api/agents")).find(
        (agent) => agent.machineId === MACHINE
      );
    // Every reading of the row from its first, until it is online.
    const seen: { fleetSync?: string; status: string }[] = [];
    fleet.launch("agent");
    const joined = await until(
      "the machine online",
      async () => {
        const read = await row();
        if (read) {
          seen.push({ status: read.status, fleetSync: read.fleetSync?.state });
        }
        return read;
      },
      (agent) => agent.status === "online",
      120_000
    );
    const joinedAt = Date.now();
    const welcomed = (await fleet.logs("hub"))
      .split("\n")
      .find(
        (line) =>
          line.includes("[fleet] welcome rev") && line.includes("acknowledged")
      );
    check(
      `joined only once its welcome is acknowledged (READY): online with the welcome ${joined.fleetSync?.state}; ${welcomed?.replace(FLEET_PREFIX, "")}`,
      joined.fleetSync?.state === "acked" &&
        seen.every(
          (one) => one.status !== "online" || one.fleetSync === "acked"
        ) &&
        welcomed !== undefined,
      JSON.stringify(seen)
    );

    // A session asked within 5 s of joining, once the account is signed in.
    await fleet.agentUp();
    await fleet.accountSignedIn();
    const askedIn = Date.now() - joinedAt;
    const instanceId = await fleet
      .spawn("claude", "starts as the machine joins")
      .catch((error: unknown) => {
        kit.note(
          `the start: ${error instanceof Error ? error.message : String(error)}`
        );
      });
    const runningAt = Date.now();
    const refusal = instanceId
      ? undefined
      : (await fleet.logs("agent"))
          .split("\n")
          .find((line) => line.includes("Not started:"));
    check(
      `a session asked ${(askedIn / 1000).toFixed(1)} s after the machine joined (within ${START_WITHIN_MS / 1000} s) starts, running ${((runningAt - joinedAt) / 1000).toFixed(1)} s after it joined`,
      instanceId !== undefined && askedIn <= START_WITHIN_MS,
      refusal ?? "no refusal in the agent's log"
    );

    // Each item on the row as it converges.
    const npxIds = NPX_ROWS.map((name) => `mcp:${name}`);
    const pluginIds = PLUGINS.map((name) => `plugin:${name}@${MARKETPLACE}`);
    const settingUp = (await row())?.fleetItems ?? {};
    kit.note(
      `items as the session started: ${Object.values(settingUp)
        .map((item) => `${item.id} ${item.state}`)
        .join(", ")}`
    );
    const settled = await until(
      "every item settled",
      row,
      (agent) =>
        [...npxIds, ...pluginIds, `mcp:${LINUX_ROW}`].every((id) =>
          ["ok", "failed"].includes(agent.fleetItems?.[id]?.state ?? "")
        ),
      Math.max(1000, joinedAt + OUTCOME_MS - Date.now())
    ).catch(() => undefined);
    const items = settled?.fleetItems ?? (await row())?.fleetItems ?? {};
    check(
      `each item's converge shows on the row and settles within ${OUTCOME_MS / 1000} s of joining (${Math.round((Date.now() - joinedAt) / 1000)} s): ${[...npxIds, ...pluginIds, `mcp:${LINUX_ROW}`].map((id) => `${id} ${items[id]?.state ?? "absent"}`).join(", ")}`,
      settled !== undefined &&
        npxIds.every(
          (id) =>
            items[id]?.state === "failed" &&
            (items[id]?.error ?? "").includes("timed out after")
        ),
      JSON.stringify(items)
    );

    const applied = await until(
      `${LINUX_ROW} applied on the machine`,
      row,
      (agent) => agent.fleet?.mcp[LINUX_ROW]?.state === "applied",
      OUTCOME_MS
    ).catch(() => undefined);
    const last = applied ?? (await row());
    check(
      `the server limited to linux reaches the new machine and reads applied (${last?.fleet?.mcp[LINUX_ROW]?.state ?? "not in its report"})`,
      applied !== undefined,
      JSON.stringify({
        os: last?.os,
        platform: last?.machineCapabilities?.platform,
        row: last?.fleet?.mcp[LINUX_ROW],
      })
    );

    // One MCP row changed: one delta item, and no other item said again.
    const before = (await row())?.fleetItems ?? {};
    const hubMark = await fleet.logMark("hub");
    const agentMark = await fleet.logMark("agent");
    const changedStatus = await put(LINUX_ROW, {
      config: {
        command: process.execPath,
        args: [join(import.meta.dir, "../fixtures/shared-mcp-server.ts")],
        env: { PROBE_MCP_PIDS: pids, PROBE_CHANGED: "1" },
      },
      enabled: true,
      platforms: ["linux"],
    });
    const linuxId = `mcp:${LINUX_ROW}`;
    const after = await until(
      "the changed row converged again",
      row,
      (agent) =>
        agent.fleetItems?.[linuxId]?.state === "ok" &&
        agent.fleetItems[linuxId]?.hash !== before[linuxId]?.hash,
      60_000
    ).catch(() => undefined);
    const deltas = (await hubMark.since())
      .split("\n")
      .filter(
        (line) => line.includes("[fleet] delta rev") && line.includes("sent →")
      );
    const took = (await agentMark.since())
      .split("\n")
      .filter((line) => line.includes("[fleet] sync from the hub"));
    const others = Object.keys(before).filter((id) => id !== linuxId);
    const untouched = others.filter(
      (id) =>
        JSON.stringify(after?.fleetItems?.[id]) === JSON.stringify(before[id])
    );
    check(
      `one changed MCP row (${changedStatus}) sends one delta of one item (${deltas.map((line) => line.replace(FLEET_PREFIX, "")).join(" | ")}), the agent takes that one item (${took.map((line) => line.replace(FLEET_PREFIX, "")).join(" | ")}), and ${untouched.length} of ${others.length} other items are not converged again`,
      changedStatus === 200 &&
        deltas.length === 1 &&
        deltas[0]?.includes(": 1 item(s)") === true &&
        took.length === 1 &&
        took[0]?.includes(", 1 item(s)") === true &&
        untouched.length === others.length,
      JSON.stringify({ deltas, took, before, after: after?.fleetItems })
    );

    // Nothing moved, nothing sent: a project with no rows gains and loses a
    // place three times, and a fleet change that moves nothing fans out.
    const quietHub = await fleet.logMark("hub");
    const quietAgent = await fleet.logMark("agent");
    const folder = join(fleet.sandbox, "rowless");
    await Bun.$`mkdir -p ${folder} && git init -q -b main ${folder}`.quiet();
    const { id: project } = await fleet.api<{ id: string }>("/api/projects", {
      name: "Rowless",
      caw: false,
    });
    await fleet.api(`/api/projects/${project}/places`, {
      machineId: MACHINE,
      path: folder,
    });
    for (const n of [1, 2, 3]) {
      const cut = join(fleet.sandbox, `rowless-${n}`);
      // biome-ignore lint/performance/noAwaitInLoops: one place's open and archive at a time, as the hub sees workspaces come and go
      await Bun.$`mkdir -p ${cut} && git init -q -b main ${cut}`.quiet();
      const added = await fleet.api<{ place?: { id?: string } }>(
        `/api/projects/${project}/places`,
        { machineId: MACHINE, path: cut }
      );
      await fetch(
        `${fleet.base}/api/projects/${project}/places/${added.place?.id}`,
        { method: "DELETE" }
      );
    }
    const unchanged = await put(LINUX_ROW, {
      config: {
        command: process.execPath,
        args: [join(import.meta.dir, "../fixtures/shared-mcp-server.ts")],
        env: { PROBE_MCP_PIDS: pids, PROBE_CHANGED: "1" },
      },
      enabled: true,
      platforms: ["linux"],
    });
    await Bun.sleep(QUIET_MS);
    const quietTook = (await quietAgent.since())
      .split("\n")
      .filter((line) => line.includes("[fleet] sync from the hub"));
    const elided = (await quietHub.since())
      .split("\n")
      .filter((line) => line.includes("[fleet] no delta for"));
    check(
      `three places opened and archived on a project with no rows, and a fleet change that moved nothing (${unchanged}): the agent took ${quietTook.length} delta(s); the hub sent none (${elided.length} "no delta" line(s))`,
      unchanged === 200 && quietTook.length === 0 && elided.length > 0,
      [...quietTook, ...elided].join("\n")
    );
  },
};

export default spec;
