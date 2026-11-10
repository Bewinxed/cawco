/**
 * CawCo keeps each machine's Claude Code at its newest release with no
 * press, installs a pinned one exactly, leaves alone one whose owner turned
 * its updates off, updates one a package manager holds with that manager,
 * and cuts off no running session (hub tool-releases.ts, agent tools.ts
 * `install`). The hub's legs run here on the hub's own code against a
 * stand-in of Claude Code's release channel; the machine's legs run in
 * children with a scratch HOME and a PATH holding only the stand-in's
 * folder, `ln`, `sleep` and `bash`. The stand-in `claude` is laid out as
 * the native installer lays it out: each build a file under its
 * `versions/`, its launcher `bin/claude` a link to one, and `claude update`
 * re-pointing the launcher at the channel's build with the old one left in
 * place (code.claude.com/docs/en/setup: "the native installer manages the
 * launcher at `~/.local/bin/claude` as a symlink into
 * `~/.local/share/claude/versions/`"); its `curl` hands out a stand-in of
 * that installer, which takes a version as `bash -s 2.1.89` does. Or it is
 * laid out as a Homebrew cask, each build under `Caskroom/claude-code/`,
 * with a stand-in `brew` that upgrades it, and an updater that only says
 * Homebrew manages it.
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
 *     the new version alone; at 390 every machine's name reads whole beside
 *     its state. Each state read by the rendered checks.
 * (i) A pin is installed exactly, the installer's own way, and never with
 *     an updater: a copy no package manager holds is put on the pinned build
 *     by the native installer, `claude update` never running; a copy
 *     Homebrew holds can't take a pin, says so, and nothing runs. End to
 *     end, a press carrying no pin, on a fleet that pins one, installs it:
 *     the hub puts the fleet's pin in.
 * (j) The owner's switches, in the settings Claude Code's own engine
 *     resolves (the Agent SDK's `resolveSettings`): DISABLE_AUTOUPDATER in
 *     `~/.claude/settings.json` declines CawCo's automatic update and says
 *     why, that Retry updates it now, and what keeps it current, while a
 *     press still updates; DISABLE_UPDATES in the environment declines a
 *     press too. End to end, a machine whose agent runs with
 *     DISABLE_AUTOUPDATER on (the scratch fleet's default) is never updated
 *     on its own, its row says why, and Retry on that row runs its update.
 * (k) A copy Homebrew holds is updated with `brew upgrade claude-code`,
 *     never `claude update`; a brew that refuses leaves its words on the
 *     row. End to end, the hub updates such a machine with no press.
 * (l) CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, set to anything, `0` too,
 *     declines CawCo's automatic update as an automatic switch; a press
 *     still updates.
 * (m) Where the engine says a switch is set, as a row names it: Claude
 *     Code's macOS profile, HKLM and HKCU registry policies, managed
 *     settings files and server-managed settings each stand over the
 *     user's settings, and the settings' `env` over the environment's. Each
 *     row ends on what an unset there takes to reach CawCo, said for the
 *     list the switch is in: nothing more than a Retry, or for the
 *     automatic updates nothing more than the unset, in a place the next
 *     read reads as it stands; a Claude Code session's fetch first for the
 *     server-managed settings; a restart of CawCo first for its
 *     environment. The read's process answers the settings it printed, or
 *     none.
 * (n) A read of the settings that fails decides nothing: neither CawCo's
 *     own update nor a press runs, and the row says why.
 *
 *   bun scripts/probe-kit/run.ts cli-kept-current
 */
import { existsSync } from "node:fs";
import {
  chmod,
  mkdir,
  mkdtemp,
  readFile,
  rm,
  symlink,
  writeFile,
} from "node:fs/promises";
import { homedir, platform, tmpdir } from "node:os";
import { join } from "node:path";
import type { PolicySettingsOrigin } from "@anthropic-ai/claude-agent-sdk";
import type { SettingsRead } from "../../../packages/agent/src/claude-settings";
import {
  settingsAnswer,
  switchedOffIn,
} from "../../../packages/agent/src/tools";
import { type Bounded, readWithin } from "../../../packages/core/src/bounded";
import { CLAUDE_DIR_NAME } from "../../../packages/core/src/claude-dirs";
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
import { hubAt } from "../hub";
import { open, settle } from "../kit";
import { RenderedChecks } from "../rendered-checks";
import type { Kit, Spec } from "../spec";

const ROOT = join(import.meta.dir, "..", "..", "..");

/** The builds the legs move between. */
const BEHIND = "2.1.308";
const PIN = "2.1.310";
const NEWEST = "2.1.318";
const NEWER = "2.1.319";

/** Claude Code as the catalog names it, and each of its methods the legs meet. */
const NAME = toolSpec("claude")?.name ?? "claude";
const METHODS = toolSpec("claude")?.install ?? [];
/** Its own updater: the first method, which a copy no package manager holds is updated with. */
const UPDATER = METHODS[0]?.label;
/** Homebrew's, for a copy the `claude-code` cask holds: its label, and the command it runs. */
const CASK_METHOD = METHODS.find(
  (one) =>
    one.footprint?.kind === "brew" && one.footprint.formula === "claude-code"
);
const BREW = CASK_METHOD?.label;
const BREW_UPGRADE = CASK_METHOD?.command;

/** What the stand-in's updater says when it refuses, as Claude Code's npm update does. */
const REFUSED = "Error: Insufficient permissions to install update";
/** What the stand-in's brew says when it refuses, as Homebrew does without write access to its prefix. */
const BREW_REFUSED = "Error: Permission denied @ apply2files";

/** How long one machine's child may run. */
const CHILD_MS = 120_000;

/** The builds every stand-in holds, the old one first. */
const BUILDS = [BEHIND, PIN, NEWEST, NEWER];

/** How a stand-in is laid out: as the native installer lays it out, or as a Homebrew cask. */
type Layout = "native" | "brew";

/** Where a stand-in build of `version` is, under its folder `dir`. */
const buildPath = (dir: string, layout: Layout, version: string): string =>
  layout === "brew"
    ? join(dir, "Caskroom", "claude-code", version, "claude")
    : join(dir, "versions", version);

/**
 * One stand-in build of Claude Code, `version`, under `dir`: the channel's
 * build is `dir/release`, a refusing updater `dir/refuse`, each update it
 * runs goes to `dir/calls`, and waits while `dir/hold` stands. Natively,
 * `update` re-points the launcher `dir/bin/claude` at the channel's build
 * and leaves the old one in place; in a cask it says Homebrew manages it,
 * as Claude Code's does ("Claude is managed by Homebrew."). `serve` runs, as
 * a session's process does, until `dir/stop`; any other ask goes to `real`,
 * the host's Claude Code, when there is one, with its updates and
 * nonessential traffic off, as the scratch fleet starts it.
 */
const build = (
  version: string,
  dir: string,
  layout: Layout,
  real: string | undefined
): string => `#!${systemProgram("bash")}
# A stand-in for Claude Code ${version}, laid out ${layout === "brew" ? "as a Homebrew cask" : "as the native installer lays it out"}.
V=${version}
S=${JSON.stringify(dir)}
case "$1" in
  --version) echo "$V (Claude Code)" ;;
  update)
    echo "update from $V" >> "$S/calls"
    while [ -e "$S/hold" ]; do sleep 0.1; done
${
  layout === "brew"
    ? `    echo "Claude is managed by Homebrew."
    echo "Claude is up to date!"
    exit 0`
    : `    if [ -e "$S/refuse" ]; then
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
    echo "Successfully updated from $V to version $NEW"`
}
    ;;
  serve)
    echo $$ > "$S/serving"
    while [ ! -e "$S/stop" ]; do sleep 0.1; done
    echo "$V" > "$S/served"
    ;;
  *) ${real ? `DISABLE_AUTOUPDATER=1 CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC=1 exec ${JSON.stringify(real)} "$@"` : "exit 1"} ;;
esac
`;

/**
 * The native installer as a stand-in: the build its first argument names
 * (a pin, as `bash -s 2.1.89` passes it), else the channel's, put behind
 * the launcher.
 */
const installer = (dir: string): string => `#!${systemProgram("bash")}
S=${JSON.stringify(dir)}
NEW="\${1:-$(<"$S/release")}"
echo "install $NEW" >> "$S/calls"
ln -sfn "$S/versions/$NEW" "$S/bin/claude"
echo "Claude Code successfully installed!"
`;

/**
 * `curl` as a stand-in: `--version`, the probe that says it runs (core
 * `needProbe`), answered; anything else asked for, it writes the stand-in
 * installer to its `-o` file.
 */
const curl = (dir: string): string => `#!${systemProgram("bash")}
S=${JSON.stringify(dir)}
if [ "$1" = "--version" ]; then echo "curl (stand-in)"; exit 0; fi
out=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; shift; fi
  shift
done
while IFS= read -r line; do printf '%s\\n' "$line"; done < "$S/install.sh" > "$out"
`;

/**
 * `brew` as a stand-in: `--version`, the probe that says it runs (core
 * `needProbe`), answered and not counted among its calls; `upgrade
 * claude-code` re-points the launcher at the channel's build in its Caskroom.
 */
const brew = (dir: string): string => `#!${systemProgram("bash")}
S=${JSON.stringify(dir)}
if [ "$1" = "--version" ]; then echo "Homebrew (stand-in)"; exit 0; fi
echo "brew $*" >> "$S/calls"
while [ -e "$S/hold" ]; do sleep 0.1; done
if [ "$1 $2" != "upgrade claude-code" ]; then exit 1; fi
if [ -e "$S/refuse" ]; then
  echo "${BREW_REFUSED} - Caskroom/claude-code" >&2
  exit 1
fi
NEW=$(<"$S/release")
ln -sfn "$S/Caskroom/claude-code/$NEW/claude" "$S/bin/claude"
echo "==> Upgrading claude-code to $NEW"
`;

/** A stand-in Claude Code ({@link build}) under its own folder. */
interface StandIn {
  /** Its launcher's folder, first on a PATH: `claude`, and its `curl` or `brew`. */
  bin: string;
  /** Each update or install its builds, installer or brew ran, in order. */
  calls: () => Promise<string[]>;
  dir: string;
  /** Holds its updater at its start until `false`: the update watched while it runs. */
  hold: (held: boolean) => Promise<void>;
  /** What its channel says, and whether its updater refuses. */
  set: (release: string, refuse: boolean) => Promise<void>;
}

/** Writes an executable file. */
const executable = async (file: string, text: string): Promise<void> => {
  await writeFile(file, text);
  await chmod(file, 0o755);
};

/** A stand-in on `start` under `dir`, every build of {@link BUILDS} laid out as `layout` lays them. */
const standIn = async (
  dir: string,
  start: string,
  layout: Layout,
  real?: string
): Promise<StandIn> => {
  const bin = join(dir, "bin");
  await mkdir(bin, { recursive: true });
  for (const version of BUILDS) {
    const file = buildPath(dir, layout, version);
    await mkdir(join(file, ".."), { recursive: true });
    await executable(file, build(version, dir, layout, real));
  }
  await symlink(buildPath(dir, layout, start), join(bin, "claude"));
  if (layout === "brew") {
    await executable(join(bin, "brew"), brew(dir));
  } else {
    await executable(join(dir, "install.sh"), installer(dir));
    await executable(join(bin, "curl"), curl(dir));
  }
  await writeFile(join(dir, "release"), start);
  const flag = async (name: string, on: boolean): Promise<void> => {
    if (on) {
      await writeFile(join(dir, name), "");
    } else {
      await rm(join(dir, name), { force: true });
    }
  };
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
    hold: (held) => flag("hold", held),
    set: async (release, refuse) => {
      await writeFile(join(dir, "release"), release);
      await flag("refuse", refuse);
    },
  };
};

/**
 * Runs one machine's legs in a child: `script`'s last line, JSON, with a
 * scratch HOME (`home`, written first with `settings` as Claude Code's user
 * settings when given) and a PATH of the stand-in's folder, then `ln`,
 * `sleep` and `bash` alone.
 */
const onMachine = async <T>(
  kit: Kit,
  root: string,
  claude: StandIn,
  script: string,
  settings?: unknown
): Promise<T> => {
  const home = join(root, "home");
  const bin = join(root, "bin");
  const scratch = join(root, "tmp");
  await Promise.all(
    [home, bin, scratch].map((dir) => mkdir(dir, { recursive: true }))
  );
  if (settings !== undefined) {
    await mkdir(join(home, CLAUDE_DIR_NAME), { recursive: true });
    await writeFile(
      join(home, CLAUDE_DIR_NAME, "settings.json"),
      JSON.stringify(settings)
    );
  }
  for (const tool of ["ln", "sleep", "bash"]) {
    const at = Bun.which(tool);
    if (at && !existsSync(join(bin, tool))) {
      await symlink(at, join(bin, tool));
    }
  }
  const prelude = `
    import { existsSync, rmSync, symlinkSync, writeFileSync } from "node:fs";
    import { join } from "node:path";
    import { installTool, probeTools } from ${JSON.stringify(join(ROOT, "packages/agent/src/tools.ts"))};
    import { claudeHostVersion } from ${JSON.stringify(join(ROOT, "packages/agent/src/claude-version.ts"))};
    const S = ${JSON.stringify(claude.dir)};
    const launcher = join(S, "bin", "claude");
    const claude = async () => (await probeTools()).find((tool) => tool.id === "claude");
    const said = (read) => read.kind === "answered" ? read.value : undefined;
  `;
  const ran = await readWithin(CHILD_MS, async (signal) => {
    const child = Bun.spawn([process.execPath, "-e", prelude + script], {
      cwd: ROOT,
      env: { HOME: home, PATH: `${claude.bin}:${bin}`, TMPDIR: scratch },
      stdout: "pipe",
      stderr: "pipe",
      signal,
      killSignal: "SIGKILL",
    });
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
  return JSON.parse(out.trim().split("\n").at(-1) || "{}") as T;
};

/** What the first machine's child saw, in order. */
interface UpdateRead {
  claude?: { after?: string; before?: string };
  failedProbe?: ToolStatus;
  failedUpdate?: ToolStatus;
  landed?: ToolStatus;
  movedProbe?: ToolStatus;
  pressedCurrent?: ToolStatus;
  runningAfter?: boolean;
  start?: ToolStatus;
}

/** (c) to (e) on one machine: the update, a process on the old build through it, a refusal, a move. */
const UPDATE_SCRIPT = `
  const out = { runningAfter: false };
  out.start = await claude();
  const before = said(await claudeHostVersion());
  // A process on the old build, as a session's is, started before the update.
  const session = Bun.spawn([launcher, "serve"], { stdout: "ignore", stderr: "ignore" });
  for (let i = 0; i < 100 && !existsSync(join(S, "serving")); i++) await Bun.sleep(20);
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWEST)});
  out.landed = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)}, automatic: true });
  out.runningAfter = session.exitCode === null && !session.killed;
  out.claude = { before, after: said(await claudeHostVersion()) };
  writeFileSync(join(S, "stop"), "");
  await session.exited;
  // A newer release, and an updater that refuses it.
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWER)});
  writeFileSync(join(S, "refuse"), "");
  out.failedUpdate = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWER)}, automatic: true });
  out.failedProbe = await claude();
  // The copy moves by itself, as a person's own \`claude update\` moves it.
  rmSync(launcher);
  symlinkSync(join(S, "versions", ${JSON.stringify(NEWER)}), launcher);
  out.movedProbe = await claude();
  rmSync(join(S, "refuse"));
  out.pressedCurrent = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWER)} });
  console.log(JSON.stringify(out));
`;

/** (i): a pin, as a press carries it. */
const PIN_SCRIPT = `
  const out = { start: await claude() };
  out.pinned = await installTool("claude", ${JSON.stringify(PIN)});
  console.log(JSON.stringify(out));
`;

/** (j): the owner's switches; Claude Code's user settings turn its automatic updates off. */
const SWITCH_SCRIPT = `
  const out = {};
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWEST)});
  out.declined = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)}, automatic: true });
  out.pressed = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)} });
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWER)});
  process.env.DISABLE_UPDATES = "yes";
  out.blocked = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWER)} });
  console.log(JSON.stringify(out));
`;

/** (l): CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, on whatever it is set to: "0" too. */
const TRAFFIC_SCRIPT = `
  const out = {};
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWEST)});
  process.env.CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC = "0";
  out.declined = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)}, automatic: true });
  out.pressed = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)} });
  console.log(JSON.stringify(out));
`;

/** What the stand-in settings read says as it fails. */
const UNREAD_SAID = "cawco: the settings engine stood in for here fails";

/** (n): the settings read's runtime stood in for by one that fails, then an automatic update and a press. */
const UNREAD_SCRIPT = `
  const out = {};
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWEST)});
  process.execPath = join(S, "unreadable");
  out.declined = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)}, automatic: true });
  out.pressed = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)} });
  console.log(JSON.stringify(out));
`;

/** (k): a copy Homebrew holds, updated, then a brew that refuses. */
const BREW_SCRIPT = `
  const out = {};
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWEST)});
  out.updated = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWEST)}, automatic: true });
  writeFileSync(join(S, "release"), ${JSON.stringify(NEWER)});
  writeFileSync(join(S, "refuse"), "");
  out.refused = await installTool("claude", undefined, { newest: ${JSON.stringify(NEWER)}, automatic: true });
  out.after = await claude();
  console.log(JSON.stringify(out));
`;

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
/** The third, whose agent runs with Claude Code's automatic updates turned off. */
const OFF = "cli-kept-current-off";
/** The fourth, whose Claude Code a Homebrew cask holds. */
const CASK = "cli-kept-current-cask";

/**
 * Whether a stand-in's call updated or installed it: its updater, its
 * installer, or Homebrew's upgrade, never another ask of brew (the agent's
 * capability probe asks `brew --prefix openjdk`).
 */
const updated = (call: string): boolean =>
  call.startsWith("update from") ||
  call.startsWith("install ") ||
  call === BREW_UPGRADE;

/** A scratch fleet, as the kit hands it out. */
type KitFleet = Awaited<ReturnType<Kit["fleet"]>>;

/**
 * Install pressed on `machine`'s Claude Code from a dashboard, carrying no
 * pin of its own, as the harness block's press does: the machine's answer,
 * or none in time.
 */
const press = async (
  fleet: KitFleet,
  machine: string
): Promise<Bounded<unknown>> => {
  const requestId = crypto.randomUUID();
  const socket = new WebSocket(
    `${fleet.base.replace("http", "ws")}/ws/dashboard`
  );
  const answered = new Promise<unknown>((done) => {
    socket.onmessage = (event) => {
      const frame = JSON.parse(String(event.data)) as {
        payload?: { kind?: string; requestId?: string };
        requestId?: string;
      };
      if (
        frame.payload?.kind === "control_result" &&
        (frame.requestId === requestId || frame.payload.requestId === requestId)
      ) {
        done(frame.payload);
      }
    };
  });
  await new Promise<void>((done, fail) => {
    socket.onopen = () => done();
    socket.onerror = () => fail(new Error("the dashboard socket did not open"));
  });
  socket.send(
    JSON.stringify({
      verb: "control",
      machineId: machine,
      requestId,
      payload: { requestId, method: "installTool", args: ["claude"] },
    })
  );
  const read = await readWithin(60_000, () => answered);
  socket.close();
  return read;
};

/**
 * (f), (g), (i), (j) and (k), end to end: a scratch fleet's hub reading the
 * stand-in channel, its machine on the old build, a second on the newest, a
 * third with Claude Code's automatic updates off in its agent's environment
 * (the scratch fleet's own default), a fourth in a Homebrew cask, each with
 * its own stand-in first on its agent's PATH.
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
    const stand = (name: string, start: string, layout: Layout) =>
      standIn(join(fleet.sandbox, name), start, layout, real);
    const behind = await stand("claude-behind", BEHIND, "native");
    const current = await stand("claude-current", NEWEST, "native");
    const off = await stand("claude-off", BEHIND, "native");
    const cask = await stand("claude-cask", BEHIND, "brew");
    for (const one of [behind, off, cask]) {
      await one.set(NEWEST, false);
    }
    const row = (machine: string): CellRow | undefined =>
      fleet.query<CellRow>(
        "SELECT state, version, detail, method FROM agent_tools WHERE machine_id = ? AND tool_id = 'claude'",
        machine
      )[0];
    const reached = (machine: string, accept: (cell: CellRow) => boolean) =>
      until(`${machine}'s Claude Code row`, () => row(machine), accept, 90_000)
        .then((cell) => cell)
        .catch(() => row(machine));
    // The scratch fleet starts every process with DISABLE_AUTOUPDATER and
    // CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC on (scratch-fleet.ts); each
    // machine kept current here runs with both off, the second empty, since
    // any value turns it on.
    const kept = (claude: StandIn) => ({
      PATH: `${claude.bin}:${fleet.env.PATH}`,
      DISABLE_AUTOUPDATER: "0",
      CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "",
    });

    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent", [], kept(behind));
    await fleet.agentUp();
    await fleet.launchMachine(CURRENT, kept(current));
    await fleet.launchMachine(OFF, { PATH: `${off.bin}:${fleet.env.PATH}` });
    await fleet.launchMachine(CASK, kept(cask));

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
    const declined = await reached(OFF, (cell) => cell.detail !== null);
    check(
      `(j) end to end, the machine whose agent runs with DISABLE_AUTOUPDATER on stays on ${BEHIND}: its updater never ran, and its row says why`,
      declined?.state === "installed" &&
        declined.version === BEHIND &&
        declined.detail ===
          toolWords.autoUpdatesOff(
            NAME,
            "DISABLE_AUTOUPDATER",
            toolWords.inEnvironment,
            toolWords.keepRestarted
          ) &&
        (await off.calls()).length === 0,
      `row: ${JSON.stringify(declined)}; its updater ran: ${(await off.calls()).join(", ") || "never"}`
    );
    const brewed = await reached(
      CASK,
      (cell) => cell.state === "installed" && cell.version === NEWEST
    );
    check(
      `(k) end to end, the machine whose Claude Code a Homebrew cask holds is updated to ${NEWEST} with brew upgrade, never claude update`,
      brewed?.state === "installed" &&
        brewed.version === NEWEST &&
        (await cask.calls()).filter(updated).join(",") === BREW_UPGRADE,
      `row: ${JSON.stringify(brewed)}; what ran: ${(await cask.calls()).join(", ") || "nothing"}`
    );

    // (g) A newer release, which the first machine's updater refuses; the
    // hub reads it as it starts again.
    channel = NEWER;
    await behind.set(NEWER, true);
    await current.set(NEWER, false);
    await off.set(NEWER, false);
    await cask.set(NEWER, false);
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
    const keptRow = row(MACHINE);
    const tries = (await behind.calls()).filter(
      (call) => call === `update from ${NEWEST}`
    );
    check(
      "(g) the machine's reports after it keep the reason on its row, and the hub sends that update once",
      keptRow?.detail === refused?.detail && tries.length === 1,
      `row: ${JSON.stringify(keptRow)}; tries: ${tries.length}`
    );
    const moved = await reached(
      CURRENT,
      (cell) => cell.state === "installed" && cell.version === NEWER
    );
    check(
      `(g) the second machine is updated to ${NEWER}, with no press, and the one whose updates are off still is not`,
      moved?.state === "installed" &&
        moved.version === NEWER &&
        row(OFF)?.version === BEHIND &&
        (await off.calls()).length === 0,
      `row: ${JSON.stringify(moved)}; the off machine's row: ${JSON.stringify(row(OFF))}`
    );

    await cliToolsPage(kit, fleet, { behind, off }, row);

    // (i) The fleet pins a version, and a press carrying none installs it.
    const pinned = await hubAt(fleet.base)
      .api.tools({ id: "claude" })
      .put({ pinnedVersion: PIN });
    const before = (await behind.calls()).length;
    const answer = await press(fleet, MACHINE);
    const onPin = await reached(
      MACHINE,
      (cell) => cell.state === "installed" && cell.version === PIN
    );
    const ran = (await behind.calls()).slice(before);
    check(
      `(i) end to end, on a fleet that pins ${PIN}, a press carrying no pin installs ${PIN} with the native installer, and no updater runs`,
      pinned.error === null &&
        answer.kind === "answered" &&
        onPin?.version === PIN &&
        ran.join(",") === `install ${PIN}`,
      `PUT ${pinned.status}; row: ${JSON.stringify(onPin)}; what ran: ${ran.join(", ") || "nothing"}`
    );
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

/** Each machine's name in a ledger, and whether it reads whole (nothing cut off by an ellipsis). */
const namesWhole = (
  ledger: import("playwright-core").Locator
): Promise<{ name: string; whole: boolean }[]> =>
  ledger.locator("td span.type-label").evaluateAll((spans) =>
    spans.map((span) => ({
      name: span.textContent ?? "",
      whole: span.scrollWidth <= span.clientWidth + 1,
    }))
  );

/**
 * (h) The refused machine's row on Configure → CLI tools, read and operated
 * at 1440 and 390: the Not updated mark and what it opens, Retry, the
 * update running, and the row it lands on; the machine whose updates are
 * off says why the same way.
 */
const cliToolsPage = async (
  kit: Kit,
  fleet: KitFleet,
  { behind, off }: { behind: StandIn; off: StandIn },
  row: (machine: string) => CellRow | undefined
): Promise<void> => {
  const { check } = kit;
  const hostname =
    (await fleet.api((hub) => hub.api.agents.get())).find(
      (agent) => agent.machineId === MACHINE
    )?.hostname ?? "";
  const label = machineLabel(hostname);
  const head = toolWords.notUpdatedHead(NAME, NEWEST, label);
  const offHead = toolWords.notUpdatedHead(NAME, BEHIND, label);
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
    if (view === "phone") {
      const names = await namesWhole(ledger);
      check(
        `(h, ${view}) beside a ${toolWords.notUpdated} mark, every machine's name reads whole`,
        names.length >= 4 && names.every((one) => one.whole),
        JSON.stringify(names)
      );
    }
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
    await offSays(kit, page, offHead, view);
    if (view === "phone" && shown) {
      await retried(kit, page, checks, { behind, head, row });
    }
    if (view === "phone") {
      await offRetried(kit, page, { off, offHead, row });
    }
    await page.close();
  }
  checks.report();
};

/** (h) at 390: Retry pressed, the update watched while it runs, then landed. */
const retried = async (
  kit: Kit,
  page: import("playwright-core").Page,
  checks: RenderedChecks,
  {
    behind,
    head,
    row,
  }: {
    behind: StandIn;
    head: string;
    row: (machine: string) => CellRow | undefined;
  }
): Promise<void> => {
  const { check } = kit;
  const view = "phone";
  const ledger = page.locator(LEDGER);
  const mark = ledger.getByRole("button", { name: head });
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
  const namesDuring = await namesWhole(ledger);
  check(
    `(h, ${view}) beside ${toolWords.updating}, every machine's name reads whole`,
    namesDuring.every((one) => one.whole),
    JSON.stringify(namesDuring)
  );
  await page.screenshot({ path: join(kit.out, `${view}-updating.png`) });
  await checks.at(page, `${view}: updating`);
  await behind.hold(false);
  const landed = await until(
    "the retried update landing",
    () => row(MACHINE),
    (cell) => cell.state === "installed" && cell.version === NEWER,
    60_000
  ).catch(() => row(MACHINE));
  const gone = await mark.waitFor({ state: "detached", timeout: 20_000 }).then(
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
};

/**
 * (j) at 390: Retry on the row of the machine whose only switches set are
 * automatic ones (its agent's DISABLE_AUTOUPDATER and nonessential traffic,
 * the scratch fleet's): a press, which runs past them as Claude Code's own
 * `claude update` does, so its update runs and lands.
 */
const offRetried = async (
  kit: Kit,
  page: import("playwright-core").Page,
  {
    off,
    offHead,
    row,
  }: {
    off: StandIn;
    offHead: string;
    row: (machine: string) => CellRow | undefined;
  }
): Promise<void> => {
  const offMark = page.locator(LEDGER).getByRole("button", { name: offHead });
  const before = (await off.calls()).length;
  let pressed = false;
  if ((await offMark.count()) > 0) {
    await offMark.click();
    pressed = await page
      .locator(POPOVER)
      .filter({ hasText: offHead })
      .getByRole("button", { name: "Retry" })
      .click({ timeout: 10_000 })
      .then(
        () => true,
        () => false
      );
  }
  const landed = await until(
    "the retried update of the machine whose automatic updates are off",
    () => row(OFF),
    (cell) => cell.state === "installed" && cell.version === NEWER,
    60_000
  ).catch(() => row(OFF));
  const ran = (await off.calls()).slice(before);
  kit.check(
    `(j, phone) Retry on the row of the machine whose only switches set are automatic ones runs its update: its updater ran once, and the row lands ${NEWER} with no reason left`,
    pressed &&
      landed?.version === NEWER &&
      landed.detail === null &&
      ran.join(",") === `update from ${BEHIND}`,
    `pressed: ${pressed}; row: ${JSON.stringify(landed)}; what ran: ${ran.join(", ") || "nothing"}`
  );
};

/** (j) on the page: the machine whose updates are off says why on its row, under its mark. */
const offSays = async (
  kit: Kit,
  page: import("playwright-core").Page,
  offHead: string,
  view: string
): Promise<void> => {
  const offMark = page.locator(LEDGER).getByRole("button", { name: offHead });
  const there = (await offMark.count()) > 0;
  let offSaid = "";
  if (there) {
    await offMark.click();
    const offOpened = page.locator(POPOVER).filter({ hasText: offHead });
    offSaid = await offOpened
      .waitFor({ timeout: 10_000 })
      .then(() => offOpened.innerText())
      .catch(() => "");
    await page.keyboard.press("Escape");
  }
  kit.check(
    `(j, ${view}) the machine whose updates are off says why on its row`,
    offSaid.includes(
      toolWords.autoUpdatesOff(
        NAME,
        "DISABLE_AUTOUPDATER",
        toolWords.inEnvironment,
        toolWords.keepRestarted
      )
    ),
    there
      ? offSaid.replaceAll("\n", " ").slice(0, 400)
      : `no mark named “${offHead}”`
  );
};

/** A machine of a leg's own: its folder, and its stand-in Claude Code there. */
type Fresh = (
  name: string,
  start: string,
  layout: Layout
) => Promise<{ claude: StandIn; dir: string }>;

/** (j) and (l) on machines of their own: the owner's switches, each where Claude Code reads it. */
const switchLegs = async (kit: Kit, fresh: Fresh): Promise<void> => {
  const { check } = kit;
  {
    const { dir, claude } = await fresh("switches", BEHIND, "native");
    const read = await onMachine<{
      blocked?: ToolStatus;
      declined?: ToolStatus;
      pressed?: ToolStatus;
    }>(kit, dir, claude, SWITCH_SCRIPT, {
      env: { DISABLE_AUTOUPDATER: "1" },
    });
    const calls = await claude.calls();
    check(
      "(j) DISABLE_AUTOUPDATER in Claude Code's user settings declines CawCo's automatic update, says why, and runs nothing",
      read.declined?.state === "installed" &&
        read.declined.version === BEHIND &&
        read.declined.detail ===
          toolWords.autoUpdatesOff(
            NAME,
            "DISABLE_AUTOUPDATER",
            join("~", CLAUDE_DIR_NAME, "settings.json"),
            toolWords.keepUnset
          ),
      JSON.stringify(read.declined)
    );
    check(
      `(j) a press still updates it, to ${NEWEST}`,
      read.pressed?.state === "installed" &&
        read.pressed.version === NEWEST &&
        read.pressed.detail === undefined,
      `${JSON.stringify(read.pressed)}; what ran: ${calls.join(", ")}`
    );
    check(
      "(j) DISABLE_UPDATES in the environment declines a press too, says why, and runs nothing",
      read.blocked?.state === "installed" &&
        read.blocked.version === NEWEST &&
        read.blocked.detail ===
          toolWords.updatesOff(
            NAME,
            "DISABLE_UPDATES",
            toolWords.inEnvironment,
            toolWords.thenRestarted
          ) &&
        calls.join(",") === `update from ${BEHIND}`,
      `${JSON.stringify(read.blocked)}; what ran: ${calls.join(", ")}`
    );
  }

  {
    const { dir, claude } = await fresh("traffic", BEHIND, "native");
    const read = await onMachine<{
      declined?: ToolStatus;
      pressed?: ToolStatus;
    }>(kit, dir, claude, TRAFFIC_SCRIPT);
    const calls = await claude.calls();
    check(
      "(l) CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC, set even to 0, declines CawCo's automatic update, says why, and runs nothing",
      read.declined?.state === "installed" &&
        read.declined.version === BEHIND &&
        read.declined.detail ===
          toolWords.autoUpdatesOff(
            NAME,
            "CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC",
            toolWords.inEnvironment,
            toolWords.keepRestarted
          ),
      JSON.stringify(read.declined)
    );
    check(
      `(l) a press still updates it, to ${NEWEST}: only DISABLE_UPDATES stops a press`,
      read.pressed?.state === "installed" &&
        read.pressed.version === NEWEST &&
        calls.join(",") === `update from ${BEHIND}`,
      `${JSON.stringify(read.pressed)}; what ran: ${calls.join(", ")}`
    );
  }
};

/** (c) to (e), (i), (j), (k) and (l) on machines of their own, each a child. */
const machineLegs = async (kit: Kit, root: string): Promise<void> => {
  const { check } = kit;
  const fresh = async (name: string, start: string, layout: Layout) => {
    const dir = join(root, name);
    return { dir, claude: await standIn(join(dir, "claude"), start, layout) };
  };

  {
    const { dir, claude } = await fresh("update", BEHIND, "native");
    const read = await onMachine<UpdateRead>(kit, dir, claude, UPDATE_SCRIPT);
    const calls = await claude.calls();
    const served = existsSync(join(claude.dir, "served"))
      ? (await readFile(join(claude.dir, "served"), "utf8")).trim()
      : "";
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
      read.runningAfter === true && served === BEHIND,
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
  }

  {
    const { dir, claude } = await fresh("pin", BEHIND, "native");
    const read = await onMachine<{ pinned?: ToolStatus; start?: ToolStatus }>(
      kit,
      dir,
      claude,
      PIN_SCRIPT
    );
    const calls = await claude.calls();
    check(
      `(i) a pinned ${PIN} goes on a copy no package manager holds with the native installer, and claude update never runs`,
      read.start?.version === BEHIND &&
        read.pinned?.state === "installed" &&
        read.pinned.version === PIN &&
        calls.join(",") === `install ${PIN}`,
      `${JSON.stringify(read.pinned)}; what ran: ${calls.join(", ") || "nothing"}`
    );
  }

  {
    const { dir, claude } = await fresh("pin-cask", BEHIND, "brew");
    const read = await onMachine<{ pinned?: ToolStatus }>(
      kit,
      dir,
      claude,
      PIN_SCRIPT
    );
    const calls = await claude.calls();
    check(
      `(i) a copy a Homebrew cask holds can't take a pin: it says so, stays on ${BEHIND}, and nothing runs`,
      read.pinned?.state === "installed" &&
        read.pinned.version === BEHIND &&
        read.pinned.detail === toolWords.cannotPin(BREW ?? "", NAME, PIN) &&
        calls.length === 0,
      `${JSON.stringify(read.pinned)}; what ran: ${calls.join(", ") || "nothing"}`
    );
  }

  await switchLegs(kit, fresh);
  await unreadLegs(kit, fresh);

  {
    const { dir, claude } = await fresh("cask", BEHIND, "brew");
    const read = await onMachine<{
      after?: ToolStatus;
      refused?: ToolStatus;
      updated?: ToolStatus;
    }>(kit, dir, claude, BREW_SCRIPT);
    const calls = await claude.calls();
    check(
      `(k) a copy a Homebrew cask holds is updated to ${NEWEST} with brew upgrade claude-code, never claude update`,
      read.updated?.state === "installed" &&
        read.updated.version === NEWEST &&
        read.updated.method === BREW &&
        calls[0] === BREW_UPGRADE &&
        !calls.some((call) => call.startsWith("update from")),
      `${JSON.stringify(read.updated)}; what ran: ${calls.join(", ")}`
    );
    check(
      `(k) a brew that refuses leaves the copy on ${NEWEST} with brew's words, and they stay on the next probe`,
      read.refused?.state === "installed" &&
        read.refused.version === NEWEST &&
        read.refused.detail?.includes(BREW_REFUSED) === true &&
        read.refused.detail.includes(NEWER) &&
        read.after?.detail === read.refused.detail,
      `${JSON.stringify(read.refused)}; next probe: ${JSON.stringify(read.after)}`
    );
  }
};

/**
 * (m) Where Claude Code's own engine says a switch is set, as a row names it
 * (agent tools.ts `switchedOffIn`): neither macOS nor Windows runs here, and
 * no managed tier can be laid on this machine (its folder is root's), so
 * each managed source is the engine's answer as its type has it, over the
 * user's settings.
 */
const settingsLegs = (kit: Kit): void => {
  const { check } = kit;
  const switches = toolSpec("claude")?.updatesOff;
  if (!switches) {
    check("(m) the catalog has Claude Code's switches", false);
    return;
  }
  const user: SettingsRead["sources"][number] = {
    source: "user",
    path: join(homedir(), CLAUDE_DIR_NAME, "settings.json"),
    settings: { env: { DISABLE_AUTOUPDATER: "0" } },
  };
  /** The engine's answer: the managed source `origin` names sets DISABLE_AUTOUPDATER on over the user's off. */
  const managed = (policyOrigin: PolicySettingsOrigin): SettingsRead => ({
    effective: { env: { DISABLE_AUTOUPDATER: "1" } },
    sources: [
      user,
      {
        source: "managed",
        policyOrigin,
        settings: { env: { DISABLE_AUTOUPDATER: "1" } },
      },
    ],
  });
  // Where Claude Code keeps each, as the managed-settings docs name them:
  // the files "in the system directory: `/Library/Application
  // Support/ClaudeCode/` on macOS, `/etc/claude-code/` on Linux and WSL, and
  // `C:\\Program Files\\ClaudeCode\\` on Windows".
  const system =
    {
      darwin: "/Library/Application Support/ClaudeCode",
      win32: "C:\\Program Files\\ClaudeCode",
    }[platform() as string] ?? "/etc/claude-code";
  const places: [PolicySettingsOrigin, string][] = [
    ["plist", toolWords.inProfile("com.anthropic.claudecode")],
    [
      "hklm",
      toolWords.inRegistry("Settings", "HKLM\\SOFTWARE\\Policies\\ClaudeCode"),
    ],
    [
      "hkcu",
      toolWords.inRegistry("Settings", "HKCU\\SOFTWARE\\Policies\\ClaudeCode"),
    ],
    [
      "file",
      toolWords.inManagedFiles(
        join(system, "managed-settings.json"),
        join(system, "managed-settings.d")
      ),
    ],
    ["remote", toolWords.inServerManaged],
    ["helper", toolWords.inManaged],
  ];
  for (const [origin, words] of places) {
    const off = switchedOffIn(switches, true, {}, managed(origin));
    check(
      `(m) DISABLE_AUTOUPDATER from the managed source the engine names ${origin} stands over the user's settings, said to be in ${words}`,
      off?.variable === "DISABLE_AUTOUPDATER" && off.where === words,
      JSON.stringify(off)
    );
  }
  const settingsOver = switchedOffIn(
    switches,
    true,
    { DISABLE_AUTOUPDATER: "1" },
    {
      effective: { env: { DISABLE_AUTOUPDATER: "0" } },
      sources: [user],
    }
  );
  check(
    "(m) the settings' env stands over the environment's: DISABLE_AUTOUPDATER off in them is off, though the environment sets it on",
    settingsOver === undefined,
    JSON.stringify(settingsOver)
  );
  const envOnly = switchedOffIn(
    switches,
    false,
    { DISABLE_UPDATES: "1" },
    { effective: {}, sources: [] }
  );
  check(
    "(m) a variable only the environment sets is the environment's",
    envOnly?.variable === "DISABLE_UPDATES" &&
      envOnly.where === toolWords.inEnvironment,
    JSON.stringify(envOnly)
  );

  // How an unset reaches CawCo, by where the switch is set (agent tools.ts
  // `switchedOffIn`): each read is a process of its own, so a place it reads
  // as it stands takes a Retry; the server-managed settings are the copy
  // Claude Code last fetched, so a session's fetch comes first; the
  // environment is the daemon's own, held from its start, so a restart does.
  const asTheyStand: [string, SettingsRead][] = [
    [
      "the user's settings file",
      {
        effective: { env: { DISABLE_AUTOUPDATER: "1" } },
        sources: [{ ...user, settings: { env: { DISABLE_AUTOUPDATER: "1" } } }],
      },
    ],
    ...(["plist", "hklm", "hkcu", "file", "helper"] as const).map(
      (origin): [string, SettingsRead] => [origin, managed(origin)]
    ),
    [
      "managed settings no source of which the engine names",
      { effective: { env: { DISABLE_AUTOUPDATER: "1" } }, sources: [] },
    ],
  ];
  const tails = asTheyStand.map(([source, read]) => ({
    source,
    off: switchedOffIn(switches, true, {}, read),
  }));
  check(
    `(m) a switch in a place the next read reads as it stands ends "${toolWords.thenRetry}", or for the automatic updates "${toolWords.keepUnset}": the user's settings file, the profile, HKLM, HKCU, the managed settings files, and managed settings the engine names no place for`,
    tails.every(
      ({ off }) =>
        off?.next === toolWords.thenRetry && off.keep === toolWords.keepUnset
    ),
    JSON.stringify(tails)
  );
  const fetched = switchedOffIn(switches, true, {}, managed("remote"));
  check(
    `(m) a switch in the server-managed settings ends "${toolWords.thenFetched}", or for the automatic updates "${toolWords.keepFetched}": the read sees the copy Claude Code last fetched`,
    fetched?.where === toolWords.inServerManaged &&
      fetched.next === toolWords.thenFetched &&
      fetched.keep === toolWords.keepFetched,
    JSON.stringify(fetched)
  );
  check(
    `(m) a switch only the environment CawCo runs in sets ends "${toolWords.thenRestarted}", or for the automatic updates "${toolWords.keepRestarted}": that environment is the daemon's own, held from its start`,
    envOnly?.where === toolWords.inEnvironment &&
      envOnly.next === toolWords.thenRestarted &&
      envOnly.keep === toolWords.keepRestarted,
    JSON.stringify(envOnly)
  );
  // Which list a switch is in, which picks the row's sentence; an automatic
  // switch alone is no switch at all to a press, as to `claude update`.
  const lists = {
    every: envOnly?.list,
    autoupdater: switchedOffIn(switches, true, {}, managed("plist"))?.list,
    traffic: switchedOffIn(
      switches,
      true,
      { CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC: "0" },
      { effective: {}, sources: [] }
    )?.list,
    pressed: switchedOffIn(switches, false, {}, managed("plist")),
  };
  check(
    "(m) the answer says the list its switch is in: DISABLE_UPDATES every update's, DISABLE_AUTOUPDATER and CLAUDE_CODE_DISABLE_NONESSENTIAL_TRAFFIC the automatic ones', which a press reads as no switch at all",
    lists.every === "every" &&
      lists.autoupdater === "automatic" &&
      lists.traffic === "automatic" &&
      lists.pressed === undefined,
    JSON.stringify(lists)
  );
};

/**
 * (m) The settings read's process as its answer (agent tools.ts
 * `settingsAnswer`): what it printed when it printed the settings; none read
 * when it didn't finish, failed, or printed anything else.
 */
const answerLegs = (kit: Kit): void => {
  const { check } = kit;
  const printed: SettingsRead = {
    effective: { env: { DISABLE_UPDATES: true } },
    sources: [
      {
        source: "managed",
        policyOrigin: "plist",
        settings: { env: { DISABLE_UPDATES: true } },
      },
    ],
  };
  const ran = (code: number, stdout: string, stderr = "") => ({
    code,
    signalCode: null,
    stdout,
    stderr,
  });
  const read = settingsAnswer(ran(0, `${JSON.stringify(printed)}\n`));
  check(
    "(m) a read that printed the settings answers them, a profile's boolean kept as itself",
    JSON.stringify(read) === JSON.stringify(printed),
    JSON.stringify(read)
  );
  const unread = [
    settingsAnswer(undefined),
    settingsAnswer(ran(1, "", `first\n${UNREAD_SAID}\n`)),
    settingsAnswer(ran(0, "not the settings")),
    settingsAnswer(ran(0, '{"sources":[]}')),
  ];
  check(
    "(m) a read that didn't finish, failed, or printed anything but the settings answers none, with the last line it said when it failed",
    JSON.stringify(unread) ===
      JSON.stringify([
        { unread: undefined },
        { unread: UNREAD_SAID },
        { unread: undefined },
        { unread: undefined },
      ]),
    JSON.stringify(unread)
  );
};

/**
 * (n) A machine whose read of Claude Code's settings fails: neither CawCo's
 * own update nor a press runs anything, and the row says why. The read's
 * process is this child's runtime, stood in for by one that fails.
 */
const unreadLegs = async (kit: Kit, fresh: Fresh): Promise<void> => {
  const { check } = kit;
  const { dir, claude } = await fresh("unread", BEHIND, "native");
  await executable(
    join(claude.dir, "unreadable"),
    `#!${systemProgram("bash")}
echo ${JSON.stringify(UNREAD_SAID)} >&2
exit 1
`
  );
  const read = await onMachine<{
    declined?: ToolStatus;
    pressed?: ToolStatus;
  }>(kit, dir, claude, UNREAD_SCRIPT);
  const calls = await claude.calls();
  const words = toolWords.settingsUnread(NAME, UNREAD_SAID);
  check(
    "(n) a settings read that fails declines CawCo's automatic update and a press alike, says why, and runs nothing",
    read.declined?.state === "installed" &&
      read.declined.version === BEHIND &&
      read.declined.detail === words &&
      read.pressed?.state === "installed" &&
      read.pressed.version === BEHIND &&
      read.pressed.detail === words &&
      calls.length === 0,
    `${JSON.stringify(read)}; what ran: ${calls.join(", ") || "nothing"}`
  );
};

const spec: Spec = {
  group: "The hub and machines",
  name: "cli-kept-current",
  run: async (kit: Kit) => {
    await hubLegs(kit);
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "cli-kept-current-")
    );
    try {
      await machineLegs(kit, root);
      settingsLegs(kit);
      answerLegs(kit);
    } finally {
      await rm(root, { recursive: true, force: true });
    }
    await fleetLegs(kit);
  },
};

export default spec;
