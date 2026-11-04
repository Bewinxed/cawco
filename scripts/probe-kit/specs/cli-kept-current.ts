/**
 * CawCo keeps each machine's Claude Code at its newest release with no
 * press, and its update cuts off no running session (hub tool-releases.ts,
 * agent tools.ts `install`). The hub's legs run here on the hub's own code
 * against a stand-in of Claude Code's release channel; the machine's legs
 * run in a child with a scratch HOME and a PATH holding only the stand-in's
 * launcher, `ln` and `sleep`. The stand-in `claude` is laid out as the
 * native installer lays it out: each build a file under its `versions/`,
 * its launcher `bin/claude` a link to one, and `claude update` re-pointing
 * the launcher at the channel's build with the old one left in place
 * (code.claude.com/docs/en/setup: "the native installer manages the
 * launcher at `~/.local/bin/claude` as a symlink into
 * `~/.local/share/claude/versions/`").
 *
 * (a) The hub reads the newest release off the channel, and a machine whose
 *     copy says an older version is owed its update, with no press.
 * (b) A machine already on the newest release is owed nothing; nor is one
 *     whose policy pins a version, one with an install in flight, or one
 *     whose copy says no version.
 * (c) On the machine, the install the hub sends lands the newest build,
 *     while a process started from the old build before it runs on
 *     throughout and ends on its own, on the old build: the update stops
 *     nothing. The machine's version read moves to the new build, which is
 *     what retires a session on the old one, only once it is at rest (agent
 *     session.ts `#retire`, claude.ts `outdated`).
 * (d) An update its updater refuses keeps its reason: the copy answers as it
 *     is (it still runs) with the updater's words, and every probe after
 *     says the same while the copy stays there. The hub owes it nothing more
 *     for that release, and owes it again for a newer one or once the
 *     machine connects again.
 * (e) The copy moving by itself takes the reason away; an install sent to a
 *     copy already on the release answers it installed, with no reason.
 * (f) End to end, on a scratch fleet whose hub reads the stand-in channel
 *     (scratch fleet `standIns.toolReleases`): the machine on the old build
 *     is updated to the newest with nobody pressing anything, and its row
 *     says the newest; a second machine already on it is sent nothing.
 * (g) A newer release whose update the first machine's updater refuses:
 *     the hub's row for it keeps the copy's version and the updater's words
 *     through the machine's reports after it, and the update is sent once;
 *     the second machine is updated to it.
 * (h) Configure → CLI tools on that fleet's dashboard, at 1440 and 390: the
 *     refused machine's Claude Code row keeps its version beside the Not
 *     updated mark, a button that opens the updater's words and Retry; the
 *     tool's ledger offers no Update or Reinstall press; Retry pressed, the
 *     row says Updating… beside the version until the update lands, then
 *     the new version alone. Each state read by the rendered checks.
 *
 *   bun scripts/probe-kit/run.ts cli-kept-current
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, readFile, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { machineLabel } from "../../../packages/core/src/machine-names";
import type { ToolStatus } from "../../../packages/core/src/tools";
import { TOOL_CATALOG, toolSpec } from "../../../packages/core/src/tools";
import { toolWords } from "../../../packages/core/src/words/tools";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import {
  readRelease,
  ToolReleases,
  updatesOwed,
} from "../../../packages/hub/src/tool-releases";
import { delay, MACHINE, until } from "../../scratch-fleet";
import { type Kit, open, type Spec, settle } from "../kit";
import { RenderedChecks } from "../rendered-checks";

const ROOT = join(import.meta.dir, "..", "..", "..");

/** The builds the legs move between. */
const BEHIND = "2.1.308";
const NEWEST = "2.1.318";
const NEWER = "2.1.319";

/** The catalog's first way to put Claude Code on: its own updater, which a copy there is updated with. */
const UPDATER = toolSpec("claude")?.install[0]?.label;

/** What the stand-in's updater says when it refuses, as Claude Code's npm update does. */
const REFUSED = "Error: Insufficient permissions to install update";

/** How long the machine's child may run. */
const CHILD_MS = 120_000;

/** The builds every stand-in holds, the old one first. */
const BUILDS = [BEHIND, NEWEST, NEWER];

/**
 * One stand-in build of Claude Code, `version`, under `dir`: the channel's
 * build is `dir/release`, a refusing updater `dir/refuse`, each update it
 * runs goes to `dir/calls`, and waits while `dir/hold` stands; `update`
 * re-points the launcher `dir/bin/claude` at `dir/versions/<release>` and
 * leaves the old build in place; `serve`
 * runs, as a session's process does, until `dir/stop`; any other ask goes
 * to `real`, the host's Claude Code, when there is one.
 */
const build = (
  version: string,
  dir: string,
  real: string | undefined
): string => `#!${systemProgram("bash")}
# A stand-in for Claude Code ${version}, laid out as the native installer lays it out.
V=${version}
S=${JSON.stringify(dir)}
case "$1" in
  --version) echo "$V (Claude Code)" ;;
  update)
    echo "update from $V" >> "$S/calls"
    while [ -e "$S/hold" ]; do sleep 0.1; done
    if [ -e "$S/refuse" ]; then
      echo "${REFUSED}" >&2
      echo "Try running with sudo or fix npm permissions" >&2
      exit 1
    fi
    NEW=$(<"$S/release")
    if [ "$NEW" = "$V" ]; then
      echo "Claude Code is up to date ($V)"
      exit 0
    fi
    ln -sfn "$S/versions/$NEW" "$S/bin/claude"
    echo "Successfully updated from $V to version $NEW"
    ;;
  serve)
    echo $$ > "$S/serving"
    while [ ! -e "$S/stop" ]; do sleep 0.1; done
    echo "$V" > "$S/served"
    ;;
  *) ${real ? `exec ${JSON.stringify(real)} "$@"` : "exit 1"} ;;
esac
`;

/** A stand-in Claude Code ({@link build}) under its own folder. */
interface StandIn {
  /** Its launcher's folder, first on a PATH. */
  bin: string;
  /** Each update its builds ran, in order. */
  calls: () => Promise<string[]>;
  dir: string;
  /** Holds its updater at its start until `false`: the update watched while it runs. */
  hold: (held: boolean) => Promise<void>;
  /** What its channel says, and whether its updater refuses. */
  set: (release: string, refuse: boolean) => Promise<void>;
}

/** A stand-in on `start` under `dir`, every build of {@link BUILDS} in its `versions`. */
const standIn = async (
  dir: string,
  start: string,
  real?: string
): Promise<StandIn> => {
  const bin = join(dir, "bin");
  const versions = join(dir, "versions");
  await Promise.all(
    [bin, versions].map((one) => mkdir(one, { recursive: true }))
  );
  for (const version of BUILDS) {
    const file = join(versions, version);
    await Bun.write(file, build(version, dir, real));
    await chmod(file, 0o755);
  }
  await symlink(join(versions, start), join(bin, "claude"));
  await Bun.write(join(dir, "release"), start);
  return {
    bin,
    dir,
    calls: async () =>
      existsSync(join(dir, "calls"))
        ? (await readFile(join(dir, "calls"), "utf8"))
            .trim()
            .split("\n")
            .filter(Boolean)
        : [],
    hold: async (held) => {
      if (held) {
        await Bun.write(join(dir, "hold"), "");
      } else {
        await rm(join(dir, "hold"), { force: true });
      }
    },
    set: async (release, refuse) => {
      await Bun.write(join(dir, "release"), release);
      if (refuse) {
        await Bun.write(join(dir, "refuse"), "");
      } else {
        await rm(join(dir, "refuse"), { force: true });
      }
    },
  };
};

/** What the machine's child saw, in order. */
interface MachineRead {
  claude?: { after?: string; before?: string };
  failedProbe?: ToolStatus;
  failedUpdate?: ToolStatus;
  landed?: ToolStatus;
  movedProbe?: ToolStatus;
  pressedCurrent?: ToolStatus;
  runningAfter: boolean;
  start?: ToolStatus;
}

/**
 * The machine's legs, as a script for the child: each read in order, then
 * one JSON line. The stand-in's files move it between them.
 */
const machineScript = (dir: string): string => `
  import { existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
  import { join } from "node:path";
  import { installTool, probeTools } from ${JSON.stringify(join(ROOT, "packages/agent/src/tools.ts"))};
  import { claudeHostVersion } from ${JSON.stringify(join(ROOT, "packages/agent/src/claude-version.ts"))};
  const S = ${JSON.stringify(dir)};
  const launcher = join(S, "bin", "claude");
  const claude = async () => (await probeTools()).find((tool) => tool.id === "claude");
  const said = (read) => read.kind === "answered" ? read.value : undefined;
  const out = { runningAfter: false };
  out.start = await claude();
  const before = said(await claudeHostVersion());
  // A process on the old build, as a session's is, started before the update.
  const session = Bun.spawn([launcher, "serve"], { stdout: "ignore", stderr: "ignore" });
  for (let i = 0; i < 100 && !existsSync(join(S, "serving")); i++) await Bun.sleep(20);
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWEST)});
  out.landed = await installTool("claude", undefined, ${JSON.stringify(NEWEST)});
  out.runningAfter = session.exitCode === null && !session.killed;
  out.claude = { before, after: said(await claudeHostVersion()) };
  writeFileSync(join(S, "stop"), "");
  await session.exited;
  // A newer release, and an updater that refuses it.
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWER)});
  writeFileSync(join(S, "refuse"), "");
  out.failedUpdate = await installTool("claude", undefined, ${JSON.stringify(NEWER)});
  out.failedProbe = await claude();
  // The copy moves by itself, as a person's own \`claude update\` moves it.
  rmSync(launcher);
  symlinkSync(join(S, "versions", ${JSON.stringify(NEWER)}), launcher);
  out.movedProbe = await claude();
  rmSync(join(S, "refuse"));
  out.pressedCurrent = await installTool("claude", undefined, ${JSON.stringify(NEWER)});
  console.log(JSON.stringify(out));
`;

/** Runs the machine's legs in a child: a scratch HOME, the stand-in first on a PATH with `ln` and `sleep` alone. */
const machineLegs = async (
  kit: Kit,
  root: string
): Promise<{ calls: string[]; read: MachineRead; served: string }> => {
  const home = join(root, "home");
  const bin = join(root, "bin");
  await Promise.all(
    [home, bin, join(root, "tmp")].map((dir) => mkdir(dir, { recursive: true }))
  );
  const claude = await standIn(join(root, "claude"), BEHIND);
  for (const tool of ["ln", "sleep"]) {
    const at = Bun.which(tool);
    if (at) {
      await symlink(at, join(bin, tool));
    }
  }
  const ran = await readWithin(CHILD_MS, async (signal) => {
    const child = Bun.spawn(
      [process.execPath, "-e", machineScript(claude.dir)],
      {
        cwd: ROOT,
        env: {
          HOME: home,
          PATH: `${claude.bin}:${bin}`,
          TMPDIR: join(root, "tmp"),
        },
        stdout: "pipe",
        stderr: "pipe",
        signal,
        killSignal: "SIGKILL",
      }
    );
    const [out, err] = await Promise.all([
      new Response(child.stdout).text(),
      new Response(child.stderr).text(),
      child.exited,
    ]);
    return { out, err };
  });
  const { out, err } =
    ran.kind === "answered"
      ? ran.value
      : { out: "", err: `the child did not finish within ${CHILD_MS} ms` };
  if (err.trim()) {
    kit.note(`(machine) ${err.trim().split("\n").slice(-6).join(" | ")}`);
  }
  const read = JSON.parse(
    out.trim().split("\n").at(-1) || '{"runningAfter":false}'
  ) as MachineRead;
  const served = existsSync(join(claude.dir, "served"))
    ? (await readFile(join(claude.dir, "served"), "utf8")).trim()
    : "";
  return { calls: await claude.calls(), read, served };
};

/** The hub's legs: the release read off a stand-in channel, and what each machine is owed. */
const hubLegs = async (kit: Kit): Promise<void> => {
  const { check } = kit;
  let channel = NEWEST;
  let channelUp = true;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      channelUp
        ? new Response(`${channel}\n`, {
            headers: { "content-type": "text/plain" },
          })
        : new Response("down", { status: 503 }),
  });
  try {
    const url = `http://127.0.0.1:${server.port}/claude-code-releases/latest`;
    let reads = 0;
    const releases = new ToolReleases({
      urls: { claude: url },
      lifetime: {
        every: () => setTimeout(() => undefined, 0),
        signal: new AbortController().signal,
      },
      name: (toolId) => toolSpec(toolId)?.name ?? toolId,
      read: () => {
        reads += 1;
      },
    });
    await releases.readAll();
    const cells = (
      version: string | undefined,
      state: ToolStatus["state"] = "installed",
      detail?: string
    ): Record<string, ToolStatus> => ({
      claude: {
        id: "claude",
        state,
        at: Date.now(),
        ...(version ? { version } : {}),
        ...(detail ? { detail } : {}),
      },
    });
    const owed = (
      machine: string,
      cell: Record<string, ToolStatus>,
      options: { inFlight?: boolean; pinned?: string } = {}
    ) =>
      updatesOwed(
        {
          cells: cell,
          inFlight: () => options.inFlight ?? false,
          tried: (toolId) => releases.tried(machine, toolId),
        },
        {
          catalog: TOOL_CATALOG,
          newest: (toolId) => releases.newest(toolId),
          policies: options.pinned
            ? [{ id: "claude", required: false, pinnedVersion: options.pinned }]
            : [],
        }
      );
    check(
      `(a) the hub reads ${NEWEST} off the release channel, and then keeps every machine current`,
      releases.newest("claude") === NEWEST && reads === 1,
      `newest ${releases.newest("claude")}, reads ${reads}`
    );
    const behind = owed("niftybot", cells(BEHIND));
    check(
      `(a) a machine on ${BEHIND} is owed its update to ${NEWEST}, with no press`,
      behind.length === 1 &&
        behind[0]?.toolId === "claude" &&
        behind[0].version === BEHIND &&
        behind[0].newest === NEWEST,
      JSON.stringify(behind)
    );
    const belowFloor = owed("old", cells("2.1.290", "failed", "too old"));
    check(
      "(a) a copy older than the oldest CawCo runs is owed it too",
      belowFloor.length === 1 && belowFloor[0]?.newest === NEWEST,
      JSON.stringify(belowFloor)
    );
    const left = {
      current: owed("obelisk", cells(NEWEST)),
      ahead: owed("canary", cells(NEWER)),
      pinned: owed("pinned", cells(BEHIND), { pinned: BEHIND }),
      inFlight: owed("busy", cells(BEHIND), { inFlight: true }),
      installing: owed("installing", cells(BEHIND, "installing")),
      unsaid: owed("unsaid", cells(undefined, "failed", "no version")),
      missing: owed("missing", {}),
    };
    check(
      "(b) a machine already on the newest release (or past it) is owed nothing, nor one pinned, one with an install in flight, one whose copy says no version, or one without the tool",
      Object.values(left).every((one) => one.length === 0),
      JSON.stringify(left)
    );

    // (d) The update was answered, and left the copy where it was.
    releases.answered("niftybot", "claude", NEWEST);
    const stands = owed(
      "niftybot",
      cells(BEHIND, "installed", `claude update said: ${REFUSED}`)
    );
    check(
      `(d) once niftybot answered the update to ${NEWEST}, it is sent no other for that release: the failure stands with its reason`,
      stands.length === 0,
      JSON.stringify(stands)
    );
    channelUp = false;
    await releases.readAll();
    check(
      "(d) a read of the channel that fails keeps the release last read",
      releases.newest("claude") === NEWEST,
      `newest ${releases.newest("claude")}`
    );
    const down = await readRelease(url);
    check(
      "(d) and says why it read none",
      "failed" in down && down.failed.includes("503"),
      JSON.stringify(down)
    );
    channelUp = true;
    channel = NEWER;
    await releases.readAll();
    const again = owed("niftybot", cells(BEHIND, "installed", REFUSED));
    check(
      `(d) a newer release (${NEWER}) is sent again to the machine whose last update failed`,
      again.length === 1 && again[0]?.newest === NEWER,
      JSON.stringify(again)
    );
    releases.answered("niftybot", "claude", NEWER);
    releases.connected("niftybot");
    const reconnected = owed("niftybot", cells(BEHIND, "installed", REFUSED));
    check(
      "(d) and so is the machine that connects again, its new agent remembering no failure of the old one's",
      reconnected.length === 1 && reconnected[0]?.newest === NEWER,
      JSON.stringify(reconnected)
    );
  } finally {
    await server.stop(true);
  }
};

/** The hub's row for a machine's Claude Code. */
interface CellRow {
  detail: string | null;
  method: string | null;
  state: string;
  version: string | null;
}

/** The second machine, already on the newest release. */
const CURRENT = "cli-kept-current-other";

/**
 * (f) and (g), end to end: a scratch fleet's hub reading the stand-in
 * channel, its machine on the old build and a second on the newest, each
 * with its own stand-in first on its agent's PATH.
 */
const fleetLegs = async (kit: Kit): Promise<void> => {
  const { check } = kit;
  let channel = NEWEST;
  const server = Bun.serve({
    port: 0,
    hostname: "127.0.0.1",
    fetch: () =>
      new Response(`${channel}\n`, {
        headers: { "content-type": "text/plain" },
      }),
  });
  try {
    const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
    fleet.standIns.toolReleases = {
      claude: `http://127.0.0.1:${server.port}/claude-code-releases/latest`,
    };
    const real = Bun.which("claude") ?? undefined;
    const behind = await standIn(
      join(fleet.sandbox, "claude-behind"),
      BEHIND,
      real
    );
    const current = await standIn(
      join(fleet.sandbox, "claude-current"),
      NEWEST,
      real
    );
    await behind.set(NEWEST, false);
    const row = (machine: string): CellRow | undefined =>
      fleet.query<CellRow>(
        "SELECT state, version, detail, method FROM agent_tools WHERE machine_id = ? AND tool_id = 'claude'",
        machine
      )[0];
    const reached = (machine: string, accept: (cell: CellRow) => boolean) =>
      until(`${machine}'s Claude Code row`, () => row(machine), accept, 90_000)
        .then((cell) => cell)
        .catch(() => row(machine));

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent", [], { PATH: `${behind.bin}:${fleet.env.PATH}` });
    await fleet.agentUp();
    await fleet.launchMachine(CURRENT, {
      PATH: `${current.bin}:${fleet.env.PATH}`,
    });

    // (f) Nobody presses anything from here on.
    const landed = await reached(
      MACHINE,
      (cell) => cell.state === "installed" && cell.version === NEWEST
    );
    check(
      `(f) end to end, the machine on ${BEHIND} is updated to ${NEWEST} by the hub with no press: its updater ran once, and the hub's row says ${NEWEST}`,
      landed?.state === "installed" &&
        landed.version === NEWEST &&
        landed.detail === null &&
        (await behind.calls()).join(",") === `update from ${BEHIND}`,
      `row: ${JSON.stringify(landed)}; the updater ran: ${(await behind.calls()).join(", ") || "never"}`
    );
    const left = await reached(
      CURRENT,
      (cell) => cell.state === "installed" && cell.version === NEWEST
    );
    check(
      `(f) the machine already on ${NEWEST} is sent nothing: its updater never ran, and its row says ${NEWEST}`,
      left?.state === "installed" &&
        left.version === NEWEST &&
        (await current.calls()).length === 0,
      `row: ${JSON.stringify(left)}; its updater ran: ${(await current.calls()).join(", ") || "never"}`
    );

    // (g) A newer release, which the first machine's updater refuses; the
    // hub reads it as it starts again.
    channel = NEWER;
    await behind.set(NEWER, true);
    await current.set(NEWER, false);
    await fleet.stop("hub");
    fleet.launch("hub");
    await fleet.hubUp();
    const refused = await reached(MACHINE, (cell) =>
      (cell.detail ?? "").includes(REFUSED)
    );
    check(
      `(g) the update to ${NEWER} its updater refuses leaves the hub's row on ${NEWEST}, installed, with the updater's words`,
      refused?.state === "installed" &&
        refused.version === NEWEST &&
        (refused.detail ?? "").includes(REFUSED) &&
        (refused.detail ?? "").includes(NEWER),
      JSON.stringify(refused)
    );
    // The agent reads its tools again after every install (agent daemon.ts
    // `reportTools`, a second on): the row that report leaves is the one read.
    await delay(3000);
    const kept = row(MACHINE);
    const tries = (await behind.calls()).filter(
      (call) => call === `update from ${NEWEST}`
    );
    check(
      "(g) the machine's reports after it keep the reason on its row, and the hub sends that update once",
      kept?.detail === refused?.detail && tries.length === 1,
      `row: ${JSON.stringify(kept)}; tries: ${tries.length}`
    );
    const moved = await reached(
      CURRENT,
      (cell) => cell.state === "installed" && cell.version === NEWER
    );
    check(
      `(g) the second machine is updated to ${NEWER}, with no press`,
      moved?.state === "installed" && moved.version === NEWER,
      `row: ${JSON.stringify(moved)}; its updater ran: ${(await current.calls()).join(", ")}`
    );

    await cliToolsPage(kit, fleet, behind, row);
  } finally {
    await server.stop(true);
  }
};

/** The Claude Code ledger on Configure → CLI tools. */
const LEDGER = 'section[data-tool="claude"]';

/** What a popover opens as (ui/popover's content). */
const POPOVER = '[data-slot="popover-content"]';

/** The presses that updated a copy by hand before CawCo kept it current. */
const MANUAL_PRESS = /^(Update|Reinstall)$/u;

/**
 * (h) The refused machine's row on Configure → CLI tools, read and operated
 * at 1440 and 390: the Not updated mark and what it opens, Retry, the
 * update running, and the row it lands on.
 */
const cliToolsPage = async (
  kit: Kit,
  fleet: Awaited<ReturnType<Kit["fleet"]>>,
  behind: StandIn,
  row: (machine: string) => CellRow | undefined
): Promise<void> => {
  const { check } = kit;
  const name = toolSpec("claude")?.name ?? "claude";
  const hostname =
    (
      await fleet.api<{ hostname: string; machineId: string }[]>("/api/agents")
    ).find((agent) => agent.machineId === MACHINE)?.hostname ?? "";
  const head = toolWords.notUpdatedHead(name, NEWEST, machineLabel(hostname));
  const checks = new RenderedChecks(kit, "cli tools: Claude Code", {
    scope: LEDGER,
  });
  const base = await fleet.dashboard();
  for (const view of ["desk", "phone"] as const) {
    const page = await kit.page(view);
    await open(page, `${base}/config/cli-tools`, LEDGER);
    const ledger = page.locator(LEDGER);
    const mark = ledger.getByRole("button", { name: head });
    const shown = await mark.waitFor({ timeout: 30_000 }).then(
      () => true,
      () => false
    );
    const cellText = shown
      ? (
          await mark
            .locator("xpath=ancestor::td[1]")
            .innerText()
            .catch(() => "")
        ).replaceAll("\n", " ")
      : "";
    check(
      `(h, ${view}) the refused machine's row keeps ${NEWEST} beside the ${toolWords.notUpdated} mark`,
      shown &&
        cellText.includes(NEWEST) &&
        cellText.includes(toolWords.notUpdated),
      cellText || `no mark named “${head}”`
    );
    const presses = await ledger
      .getByRole("button", { name: MANUAL_PRESS })
      .count();
    check(
      `(h, ${view}) the Claude Code ledger offers no Update or Reinstall press: CawCo updates it itself`,
      presses === 0,
      `${presses} found`
    );
    // Read once the page's entrance has landed, never mid-way through it.
    await settle(page);
    await page.screenshot({ path: join(kit.out, `${view}-not-updated.png`) });
    await checks.at(page, `${view}: not updated`);
    if (shown) {
      await mark.click();
      const opened = page.locator(POPOVER).filter({ hasText: head });
      const said = await opened
        .waitFor({ timeout: 10_000 })
        .then(() => opened.innerText())
        .catch(() => "");
      check(
        `(h, ${view}) the mark opens why, in the updater's words, with Retry`,
        said.includes(REFUSED) &&
          (await opened.getByRole("button", { name: "Retry" }).count()) === 1,
        said.replaceAll("\n", " ").slice(0, 400)
      );
      await page.keyboard.press("Escape");
    }
    if (view === "phone" && shown) {
      // Retry, pressed: the update watched while it runs, then landed.
      const count = ledger.locator('header [data-slot="num"]');
      const countBefore = await count.innerText();
      await behind.hold(true);
      await behind.set(NEWER, false);
      await mark.click();
      await page
        .locator(POPOVER)
        .filter({ hasText: head })
        .getByRole("button", { name: "Retry" })
        .click();
      // The cell's badge, not the pressed button's own pending words.
      const updating = ledger.locator('[data-slot="badge"]', {
        hasText: toolWords.updating,
      });
      const running = await updating.waitFor({ timeout: 20_000 }).then(
        () => true,
        () => false
      );
      const runningText = running
        ? (
            await updating
              .locator("xpath=ancestor::td[1]")
              .innerText()
              .catch(() => "")
          ).replaceAll("\n", " ")
        : "";
      const countDuring = await count.innerText();
      check(
        `(h, ${view}) Retry pressed, the row says ${toolWords.updating} beside ${NEWEST} while the update runs, and the ledger still counts the copy as there`,
        running && runningText.includes(NEWEST) && countDuring === countBefore,
        `${runningText || JSON.stringify(row(MACHINE))}; count before “${countBefore}”, during “${countDuring}”`
      );
      await settle(page);
      await page.screenshot({ path: join(kit.out, `${view}-updating.png`) });
      await checks.at(page, `${view}: updating`);
      await behind.hold(false);
      const landed = await until(
        "the retried update landing",
        () => row(MACHINE),
        (cell) => cell.state === "installed" && cell.version === NEWER,
        60_000
      ).catch(() => row(MACHINE));
      const gone = await mark
        .waitFor({ state: "detached", timeout: 20_000 })
        .then(
          () => true,
          () => false
        );
      check(
        `(h, ${view}) it lands ${NEWER}: the row says the new version, and the mark is gone`,
        landed?.version === NEWER &&
          landed.detail === null &&
          gone &&
          (await ledger.getByText(NEWER).count()) >= 1,
        JSON.stringify(landed)
      );
      await settle(page);
      await page.screenshot({ path: join(kit.out, `${view}-landed.png`) });
      await checks.at(page, `${view}: landed`);
    }
    await page.close();
  }
  checks.report();
};

const spec: Spec = {
  group: "The hub and machines",
  name: "cli-kept-current",
  run: async (kit: Kit) => {
    const { check } = kit;
    await hubLegs(kit);
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "cli-kept-current-")
    );
    try {
      const { calls, read, served } = await machineLegs(kit, root);
      check(
        `(c) the machine starts on ${BEHIND}, which CawCo runs`,
        read.start?.state === "installed" && read.start.version === BEHIND,
        JSON.stringify(read.start)
      );
      check(
        `(c) the install the hub sends runs Claude Code's own updater, and lands ${NEWEST} with no reason left`,
        read.landed?.state === "installed" &&
          read.landed.version === NEWEST &&
          read.landed.detail === undefined &&
          read.landed.method === UPDATER &&
          calls[0] === `update from ${BEHIND}`,
        `${JSON.stringify(read.landed)}; the updater ran: ${calls.join(", ")}`
      );
      check(
        `(c) a process started from ${BEHIND} before the update runs on throughout it, and ends on its own on ${BEHIND}`,
        read.runningAfter && served === BEHIND,
        `running after the update: ${read.runningAfter}; ended on: ${served || "(never)"}`
      );
      check(
        `(c) the machine's version read moves from ${BEHIND} to ${NEWEST}: what retires a session on the old build once it is at rest`,
        read.claude?.before === BEHIND && read.claude.after === NEWEST,
        JSON.stringify(read.claude)
      );
      check(
        `(d) an update its updater refuses answers the copy as it is (${NEWEST}, still runs) with the updater's words and the release it was after`,
        read.failedUpdate?.state === "installed" &&
          read.failedUpdate.version === NEWEST &&
          read.failedUpdate.detail?.includes(REFUSED) === true &&
          read.failedUpdate.detail.includes(NEWER),
        JSON.stringify(read.failedUpdate)
      );
      check(
        "(d) the probe after it keeps that reason while the copy stays there",
        read.failedProbe?.state === "installed" &&
          read.failedProbe.version === NEWEST &&
          read.failedProbe.detail === read.failedUpdate?.detail,
        JSON.stringify(read.failedProbe)
      );
      check(
        `(e) the copy moving to ${NEWER} by itself takes the reason away`,
        read.movedProbe?.state === "installed" &&
          read.movedProbe.version === NEWER &&
          read.movedProbe.detail === undefined,
        JSON.stringify(read.movedProbe)
      );
      check(
        "(e) an install sent to a copy already on the release answers it installed, with no reason",
        read.pressedCurrent?.state === "installed" &&
          read.pressedCurrent.version === NEWER &&
          read.pressedCurrent.detail === undefined,
        JSON.stringify(read.pressedCurrent)
      );
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    await fleetLegs(kit);
  },
};

export default spec;
