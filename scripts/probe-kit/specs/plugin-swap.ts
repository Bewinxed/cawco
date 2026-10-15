/**
 * A fleet plugin's files are always on disk while a session can run its
 * hooks, and the hub resends a plugin only when what it carries has changed.
 *
 * On 2026-10-16 every Bash call in Claude Code intermittently failed its
 * PostToolUse hook, `python3: can't open file '…/plugins/axiom/hooks/
 * posttool-bash-hints.py'`: the agent removed the plugin's folder and wrote
 * it back file by file, and it did so on every sync, because running the
 * Python hook made `hooks/__pycache__`, which changed the folder's hash, so
 * the hub sent the bytes again.
 *
 * A scratch hub (on a machine id of its own, so the agent vendors the
 * plugin from bytes as any other machine does) links a marketplace that is a
 * directory on it, holding one plugin whose hook is a Python script that
 * imports a sibling module (so running it makes `__pycache__`). The hook is
 * run as Claude Code runs it: `python3 ${CLAUDE_PLUGIN_ROOT}/hooks/hook.py`
 * with the plugin root the vendored `plugins/<name>` path itself (Claude
 * Code sets it to that path, not to what it links to).
 *
 * (a) Run 20 times while the hub runs 5 syncs, the hook never fails to find
 *     its script or its module, and every run prints the plugin's value.
 * (b) After the first sync, no sync writes the plugin again: the agent's
 *     `[fleet] <plugin>@<marketplace> written` lines stay at one, and the
 *     machine reports the hub's own hash for it with `__pycache__` on disk.
 * (c) A real upstream change still lands: the source's module is changed
 *     three times and the plugin refreshed each time, with the hook running
 *     in a tight loop throughout. Each change is written once, the disk ends
 *     on the last value, and no run of the hook failed: each printed an old
 *     value or a new one.
 *
 *   bun scripts/probe-kit/run.ts plugin-swap
 */
import { existsSync } from "node:fs";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type {
  FleetSyncReport,
  MarketplaceLink,
} from "../../../packages/core/src/fleet";
import { MACHINE, until } from "../../scratch-fleet";
import type { Spec } from "../kit";

const MARKETPLACE = "probe-swap";
const PLUGIN = "pyhook";
const ID = `${PLUGIN}@${MARKETPLACE}`;
const HOOK_RUNS = 20;
const SYNCS = 5;
const CHANGES = ["v2", "v3", "v4"];
/** What Claude Code sets to the plugin's own path when it runs a hook. */
const PLUGIN_ROOT = "CLAUDE_PLUGIN_ROOT";

interface AgentRow {
  fleet?: FleetSyncReport;
  machineId: string;
}

interface Run {
  code: number;
  err: string;
  out: string;
}

const spec: Spec = {
  name: "plugin-swap",
  run: async (kit) => {
    const { check } = kit;
    const fleet = await kit.fleet(() => ({ everyMs: 10, words: ["ok"] }));

    // The source: a marketplace that is a directory on the hub.
    const source = join(fleet.sandbox, "hub-market");
    const pluginSource = join(source, "plugins", PLUGIN);
    const writeHelper = (value: string) =>
      Bun.write(
        join(pluginSource, "hooks", "helper.py"),
        `VALUE = "${value}"\n`
      );
    await Bun.write(
      join(source, ".claude-plugin", "marketplace.json"),
      JSON.stringify({
        name: MARKETPLACE,
        owner: { name: "probe" },
        plugins: [{ name: PLUGIN, source: `./plugins/${PLUGIN}` }],
      })
    );
    await Bun.write(
      join(pluginSource, ".claude-plugin", "plugin.json"),
      JSON.stringify({ name: PLUGIN, version: "1.0.0" })
    );
    await Bun.write(
      join(pluginSource, "hooks", "hooks.json"),
      JSON.stringify({
        hooks: {
          PostToolUse: [
            {
              matcher: "Bash",
              hooks: [
                {
                  type: "command",
                  command: `python3 \${${PLUGIN_ROOT}}/hooks/hook.py`,
                },
              ],
            },
          ],
        },
      })
    );
    await Bun.write(
      join(pluginSource, "hooks", "hook.py"),
      "import helper\nprint(helper.VALUE)\n"
    );
    await writeHelper("v1");

    // The vendored copy, where Claude Code runs the hook from.
    const root = join(
      fleet.home,
      CLAUDE_DIR_NAME,
      "cawco-marketplaces",
      MARKETPLACE,
      "plugins",
      PLUGIN
    );
    const hook = async (): Promise<Run> => {
      const child = Bun.spawn(["python3", join(root, "hooks", "hook.py")], {
        env: { ...process.env, [PLUGIN_ROOT]: root },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [out, err, code] = await Promise.all([
        new Response(child.stdout).text(),
        new Response(child.stderr).text(),
        child.exited,
      ]);
      return { code, out: out.trim(), err: err.trim() };
    };
    const writes = async () =>
      (await fleet.logs("agent"))
        .split("\n")
        .filter((line) => line.includes(`[fleet] ${ID} written`)).length;
    const machine = async () =>
      (await fleet.api<AgentRow[]>("/api/agents")).find(
        (row) => row.machineId === MACHINE
      );
    const hubHash = () =>
      fleet.query<{ hash: string | null }>(
        "SELECT hash FROM plugins WHERE id = ?",
        ID
      )[0]?.hash ?? "";
    /** The machine's first report after `since` that holds `hash` for the plugin. */
    const reportHolding = (what: string, since: number, hash: string) =>
      until(
        what,
        async () => (await machine())?.fleet,
        (report) =>
          report !== undefined &&
          report.at > since &&
          report.plugins[ID]?.state === "applied" &&
          report.have?.plugins?.[ID] === hash,
        240_000
      ).catch(async () => (await machine())?.fleet);
    const send = async (method: string, path: string, body?: unknown) => {
      const response = await fetch(`${fleet.base}${path}`, {
        method,
        ...(body === undefined
          ? {}
          : {
              headers: { "content-type": "application/json" },
              body: JSON.stringify(body),
            }),
        signal: AbortSignal.timeout(120_000),
      });
      const text = await response.text();
      if (!response.ok) {
        throw new Error(`${method} ${path}: ${response.status} ${text}`);
      }
      return text ? (JSON.parse(text) as unknown) : undefined;
    };

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    // The hub on a machine id of its own: with the agent's, it would take
    // the agent for its own machine and have it link the hub's directory.
    fleet.env.CAWCO_MACHINE_ID = `${MACHINE}-hub`;
    fleet.launch("hub");
    fleet.env.CAWCO_MACHINE_ID = MACHINE;
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    // Linked and installed: the first sync writes the plugin once.
    const linked = await fleet.fetched<MarketplaceLink>(
      (frame) => (frame.link?.source === source ? frame.link : undefined),
      () => send("POST", "/api/fleet/marketplace-links", { source })
    );
    check(
      `the hub's directory links as ${MARKETPLACE}`,
      linked.marketplace?.name === MARKETPLACE,
      JSON.stringify(linked)
    );
    const t0 = Date.now();
    await send("PUT", `/api/fleet/plugins/${encodeURIComponent(ID)}`, {
      enabled: true,
    });
    const first = await until(
      "the hub carrying the plugin",
      async () => hubHash(),
      (hash) => hash !== "",
      120_000
    );
    const installed = await reportHolding("the plugin installed", t0, first);
    check(
      "the first sync installs the plugin and reports the hub's hash for it",
      installed?.have?.plugins?.[ID] === first,
      `hub ${first.slice(0, 7)}; machine ${JSON.stringify(installed?.plugins[ID])} holding ${installed?.have?.plugins?.[ID]?.slice(0, 7)}`
    );
    const warm = await hook();
    check(
      "the hook runs from the vendored plugin and makes __pycache__ beside its module",
      warm.code === 0 &&
        warm.out === "v1" &&
        existsSync(join(root, "hooks", "__pycache__")),
      JSON.stringify(warm)
    );
    const afterFirst = await writes();
    check(
      "the agent wrote the plugin once",
      afterFirst === 1,
      `${afterFirst} write lines`
    );

    // (a) and (b): 20 hook runs across 5 syncs that carry nothing new.
    const runs: Run[] = [];
    /** What the hook loops run until: set false once their phase is over. */
    const live: Record<"syncing" | "changing", boolean> = {
      syncing: true,
      changing: true,
    };
    const spread = (async () => {
      while (live.syncing || runs.length < HOOK_RUNS) {
        // biome-ignore lint/performance/noAwaitInLoops: one hook at a time, as a session runs them
        runs.push(await hook());
        await Bun.sleep(live.syncing ? 400 : 0);
      }
    })();
    const reports: (FleetSyncReport | undefined)[] = [];
    for (let i = 0; i < SYNCS; i += 1) {
      const at = Date.now();
      // An unchanged row, saved again: the hub tells every machine.
      // biome-ignore lint/performance/noAwaitInLoops: each sync's report is read before the next sync starts
      await send("PATCH", `/api/fleet/plugins/${encodeURIComponent(ID)}`, {
        enabled: true,
      });
      reports.push(await reportHolding(`sync ${i + 1}'s report`, at, first));
    }
    live.syncing = false;
    await spread;
    const failed = runs.filter((run) => run.code !== 0 || run.out !== "v1");
    check(
      `(a) ${runs.length} hook runs across ${SYNCS} syncs all found their script and module`,
      runs.length >= HOOK_RUNS && failed.length === 0,
      failed.length > 0 ? JSON.stringify(failed.slice(0, 3)) : ""
    );
    check(
      `(b) every one of the ${SYNCS} syncs reports the hub's hash with __pycache__ on disk`,
      reports.length === SYNCS &&
        reports.every((report) => report?.have?.plugins?.[ID] === first) &&
        existsSync(join(root, "hooks", "__pycache__")),
      reports
        .map((report) => report?.have?.plugins?.[ID]?.slice(0, 7))
        .join(", ")
    );
    const afterSyncs = await writes();
    check(
      "(b) no sync after the first wrote the plugin again",
      afterSyncs === afterFirst,
      `${afterFirst} write lines before the syncs, ${afterSyncs} after`
    );

    // (c) Real upstream changes, refreshed, under a tight loop of hook runs.
    const seen: Run[] = [];

    const tight = (async () => {
      while (live.changing) {
        // biome-ignore lint/performance/noAwaitInLoops: back to back, to land runs inside each swap
        seen.push(await hook());
      }
    })();
    const landed: boolean[] = [];
    let previous = first;
    for (const value of CHANGES) {
      // biome-ignore lint/performance/noAwaitInLoops: each change lands before the next is made
      await writeHelper(value);
      const at = Date.now();
      await send(
        "POST",
        `/api/fleet/plugins/${encodeURIComponent(ID)}/refresh`
      );
      const hash = await until(
        `the hub's hash after ${value}`,
        async () => hubHash(),
        (now) => now !== "" && now !== previous,
        120_000
      );
      const report = await reportHolding(`${value} on the machine`, at, hash);
      landed.push(report?.have?.plugins?.[ID] === hash);
      previous = hash;
    }
    live.changing = false;
    await tight;
    const values = ["v1", ...CHANGES];
    const broken = seen.filter(
      (run) => run.code !== 0 || !values.includes(run.out)
    );
    const disk = await hook();
    const afterChanges = await writes();
    check(
      `(c) each of ${CHANGES.length} upstream changes reached the machine's report`,
      landed.length === CHANGES.length && landed.every(Boolean),
      JSON.stringify(landed)
    );
    check(
      `(c) the disk ends on ${CHANGES.at(-1)}, written once per change`,
      disk.out === CHANGES.at(-1) &&
        afterChanges === afterSyncs + CHANGES.length,
      `hook prints ${JSON.stringify(disk)}; ${afterChanges - afterSyncs} writes for ${CHANGES.length} changes`
    );
    check(
      `(c) ${seen.length} hook runs through the swaps all found their script and module`,
      seen.length > 0 && broken.length === 0,
      broken.length > 0 ? JSON.stringify(broken.slice(0, 3)) : ""
    );
  },
};

export default spec;
