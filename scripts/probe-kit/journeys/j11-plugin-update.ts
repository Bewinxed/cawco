/**
 * J11, a plugin update reaching a running machine. A fleet plugin with a
 * PostToolUse hook on Bash (a Python script that imports a sibling module,
 * so running it makes `__pycache__`) is installed; a session on the machine
 * runs a command and the hook runs the installed version. The plugin's
 * source changes upstream; the person opens Skills & plugins and fetches
 * the plugin again. Then the same running session's next command runs the
 * new version of the hook.
 *
 * It carries the protection of the plugin-swap probe (2026-10-16, every
 * Bash call's hook intermittently failing with `can't open file
 * …/hooks/posttool-bash-hints.py` while the agent rewrote the plugin on
 * every sync): through the update, a tight loop of the hook, run as Claude
 * Code runs it, never fails to find its script or module, and the machine
 * writes the plugin once for the change.
 *
 * The hub runs under a machine id of its own, so the agent is sent the
 * plugin's bytes as any other machine is.
 */
import { existsSync } from "node:fs";
import { mkdir, readFile } from "node:fs/promises";
import { join } from "node:path";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
import type {
  FleetSyncReport,
  MarketplaceLink,
} from "../../../packages/core/src/fleet";
import { MACHINE, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { say } from "./mock";
import { eventually, expect, type Journey, type Leg, shows } from "./suite";

const MARKETPLACE = "journey-plugins";
const PLUGIN = "pyhook";
const ID = `${PLUGIN}@${MARKETPLACE}`;
const HOOK = "JOURNEY-HOOK";
const RAN = "hook-ran.txt";
const HELPER_VALUE = /VALUE = "([^"]*)"/;
/** What Claude Code sets to the plugin's own path, and to the session's folder, when it runs a hook. */
const PLUGIN_ROOT = "CLAUDE_PLUGIN_ROOT";
const PROJECT_DIR = "CLAUDE_PROJECT_DIR";

interface AgentRow {
  fleet?: FleetSyncReport;
  machineId: string;
}

interface HookRun {
  code: number;
  err: string;
  out: string;
}

const sourceOf = (fleet: KitFleet) =>
  join(fleet.sandbox, "hub-market", "plugins", PLUGIN);
/** The vendored copy on the machine, where Claude Code runs the hook from. */
const rootOf = (fleet: KitFleet) =>
  join(
    fleet.home,
    CLAUDE_DIR_NAME,
    "cawco-marketplaces",
    MARKETPLACE,
    "plugins",
    PLUGIN
  );
const writeHelper = (fleet: KitFleet, value: string) =>
  Bun.write(
    join(sourceOf(fleet), "hooks", "helper.py"),
    `VALUE = "${value}"\n`
  );
const hubHash = (fleet: KitFleet) =>
  fleet.query<{ hash: string | null }>(
    "SELECT hash FROM plugins WHERE id = ?",
    ID
  )[0]?.hash ?? "";
const reportOf = async (fleet: KitFleet) =>
  (await fleet.api<AgentRow[]>("/api/agents")).find(
    (row) => row.machineId === MACHINE
  )?.fleet;
/** The machine's report holds `hash` for the plugin, applied. */
const holding = (fleet: KitFleet, hash: string, what: string) =>
  eventually(
    what,
    () => reportOf(fleet),
    (report) =>
      report?.plugins[ID]?.state === "applied" &&
      report.have?.plugins?.[ID] === hash,
    240_000
  );
/** The agent's lines saying it wrote the plugin to disk. */
const writes = async (fleet: KitFleet) =>
  (await fleet.logs("agent"))
    .split("\n")
    .filter((line) => line.includes(`[fleet] ${ID} written`)).length;

/** The hook run as Claude Code runs it, from the vendored plugin. */
async function hook(fleet: KitFleet, project: string): Promise<HookRun> {
  const root = rootOf(fleet);
  const child = Bun.spawn(["python3", join(root, "hooks", "hook.py")], {
    env: { ...process.env, [PLUGIN_ROOT]: root, [PROJECT_DIR]: project },
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  return { code, out: out.trim(), err: err.trim() };
}

/** The version on the machine's disk now. */
const installedValue = async (fleet: KitFleet) =>
  HELPER_VALUE.exec(
    await readFile(join(rootOf(fleet), "hooks", "helper.py"), "utf8")
  )?.[1] ?? "";

let linked = false;

/** The marketplace on the hub's disk, linked, and the plugin installed: once per fleet. */
async function seed(fleet: KitFleet): Promise<null> {
  if (linked) {
    return null;
  }
  const source = join(fleet.sandbox, "hub-market");
  const plugin = sourceOf(fleet);
  await Bun.write(
    join(source, ".claude-plugin", "marketplace.json"),
    JSON.stringify({
      name: MARKETPLACE,
      owner: { name: "journeys" },
      plugins: [{ name: PLUGIN, source: `./plugins/${PLUGIN}` }],
    })
  );
  await Bun.write(
    join(plugin, ".claude-plugin", "plugin.json"),
    JSON.stringify({ name: PLUGIN, version: "1.0.0" })
  );
  await Bun.write(
    join(plugin, "hooks", "hooks.json"),
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
    join(plugin, "hooks", "hook.py"),
    [
      "import os",
      "import helper",
      `where = os.environ.get("${PROJECT_DIR}") or os.getcwd()`,
      `with open(os.path.join(where, "${RAN}"), "a") as ran:`,
      "    ran.write(helper.VALUE + '\\n')",
      "print(helper.VALUE)",
      "",
    ].join("\n")
  );
  await writeHelper(fleet, "v1");
  await fleet.fetched<MarketplaceLink>(
    (frame) => (frame.link?.source === source ? frame.link : undefined),
    () => fleet.api("/api/fleet/marketplace-links", { source })
  );
  const put = await fetch(
    `${fleet.base}/api/fleet/plugins/${encodeURIComponent(ID)}`,
    {
      method: "PUT",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ enabled: true }),
    }
  );
  if (!put.ok) {
    throw new Error(`installing ${ID}: ${put.status} ${await put.text()}`);
  }
  const first = await eventually(
    "the hub carrying the plugin",
    () => hubHash(fleet),
    (hash) => hash !== "",
    120_000
  );
  await holding(fleet, first, "the plugin installed on the machine");
  linked = true;
  return null;
}

/** The lines the session's hook has written in its folder. */
const ranIn = async (dir: string) =>
  existsSync(join(dir, RAN))
    ? (await readFile(join(dir, RAN), "utf8")).split("\n").filter(Boolean)
    : [];

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const value = `v-${leg.id}`;
  const dir = join(fleet.sandbox, `hook-${leg.id}`);
  await mkdir(dir, { recursive: true });
  const session = await fleet.spawn("claude", leg.title("Ship the hooks"), dir);
  const before = await installedValue(fleet);

  await leg.step(
    "A session runs a command",
    () => fleet.send(session, `${HOOK} ${leg.id}-1 list the folder.`),
    () =>
      eventually(
        `the plugin's hook ran the installed version (${before}) in the session's folder`,
        () => ranIn(dir),
        (lines) => lines.at(-1) === before,
        120_000
      )
  );

  // Upstream, the plugin's module changes: what the person fetches.
  await writeHelper(fleet, value);
  const previous = hubHash(fleet);

  await leg.step(
    "Open Skills & plugins",
    () => page.goto(`${base}/config/skills`, { waitUntil: "domcontentloaded" }),
    () => shows(page.getByText(ID, { exact: true }), `the plugin's row, ${ID}`)
  );

  await leg.step(
    "Fetch the plugin again",
    async () => {
      const writtenBefore = await writes(fleet);
      const runs: HookRun[] = [];
      const loopDir = join(dir, "loop");
      await mkdir(loopDir, { recursive: true });
      let swapping = true;
      // The hook run back to back through the swap, as a busy session runs it.
      const loop = (async () => {
        while (swapping) {
          // biome-ignore lint/performance/noAwaitInLoops: back to back, to land runs inside the swap
          runs.push(await hook(fleet, loopDir));
        }
      })();
      try {
        await page.getByRole("button", { name: `More for ${ID}` }).click();
        await page.getByRole("menuitem", { name: "Fetch again" }).click();
        const hash = await eventually(
          "the hub holds the new version",
          () => hubHash(fleet),
          (now) => now !== "" && now !== previous,
          120_000
        );
        await holding(fleet, hash, "the machine holds the new version");
      } finally {
        swapping = false;
        await loop;
      }
      const broken = runs.filter(
        (run) => run.code !== 0 || ![before, value].includes(run.out)
      );
      expect(
        `the hook, run ${runs.length} times through the update, always found its script and module`,
        runs.length > 0 && broken.length === 0,
        JSON.stringify(broken.slice(0, 3))
      );
      const writtenAfter = await writes(fleet);
      expect(
        "the machine wrote the plugin once for the change",
        writtenAfter === writtenBefore + 1,
        `${writtenAfter - writtenBefore} writes`
      );
    },
    () =>
      eventually(
        `the machine's disk holds the new version (${value})`,
        () => installedValue(fleet),
        (now) => now === value
      )
  );

  await leg.step(
    "The same session runs a command again",
    () => fleet.send(session, `${HOOK} ${leg.id}-2 list the folder again.`),
    () =>
      eventually(
        `the hook ran the new version (${value})`,
        () => ranIn(dir),
        (lines) => lines.at(-1) === value,
        120_000
      )
  );
}

const journey: Journey = {
  name: "j11-plugin-update",
  flow: "A plugin update reaching a running machine",
  respond: (seen: Seen) => {
    if (seen.tools && seen.last.includes(HOOK) && !seen.afterTool) {
      return {
        everyMs: 20,
        words: [],
        tool: {
          name: "Bash",
          input: { command: "ls", description: "List the folder" },
        },
      };
    }
    return say("Listed.");
  },
  hubMachine: `${MACHINE}-hub`,
  seed,
  leg: walk,
};

export default journey;
