/**
 * CawCo installs a harness with a method that can run on the machine, and
 * never chooses one whose tool is present but cannot run (agent tools.ts
 * `needUnmet`, core `needProbe`). niftybot.art had an `npm` on the daemon's
 * PATH and no `node`: OpenCode's install chose npm, its first method, and
 * failed with "/usr/bin/env: 'node': No such file or directory", on every
 * Retry.
 *
 * Each leg runs `installTool` in a child with a scratch HOME and
 * a PATH holding only the stand-ins it names, so an install lands in that
 * HOME. The `npm` stand-in is npm's own launcher line, `#!/usr/bin/env
 * node`, with no `node` anywhere on the PATH; the `curl` stand-in answers
 * `--version` and hands out a stand-in of OpenCode's install script, which
 * puts an `opencode2` saying the version it was asked for into
 * `~/.opencode/bin`, as opencode.ai/v2/install does.
 *
 * - (fallback) npm on the PATH that can't run, curl that can: OpenCode
 *   installs with the curl script, at the version CawCo runs, and the
 *   status names that method.
 * - (none) npm on the PATH that can't run, and nothing else: nothing is
 *   installed, and the status says npm does not run here, in npm's words.
 * - (pin) pi pinned at a version, curl that runs: none of pi's methods
 *   (`pi update`, its curl script) installs a chosen version, so nothing
 *   runs, and the status names the pin and those methods
 *   (`toolWords.noPinInstaller`), never "no installer for linux".
 *
 * - (slow) a `claude` whose `--version` sleeps past the agent's bound on a
 *   need's probe: registration's capabilities read doesn't wait on it and
 *   advises `claude update`; once the probe is past its bound, claude is
 *   taken as running (it started; it answers late), so the advice stands.
 *   The broken npm beside it, advised from what was known at registration,
 *   moves to the curl script once its probe answers, and the listener the
 *   agent re-reads its capabilities on hears it.
 *
 * - (orphan, orphan-tool, orphan-need) an agent that ends however it ends
 *   (SIGKILL) while a read of a tool's `--version` still runs leaves none
 *   behind, each read tethered to it (core tether.ts `spawnRead`): Claude
 *   Code's version (claude-version.ts `claudeHostVersion`), a capability's
 *   (capabilities.ts `toolVersion`, through `git`) and a method's need
 *   (tools.ts `askNeed`, through `pi update`'s `pi`).
 *
 *   bun scripts/probe-kit/run.ts install-method-runs
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import {
  isAlive,
  listedPid,
  signal as sendSignal,
} from "../../../packages/core/src/signal";
import { OPENCODE_VERSION, toolSpec } from "../../../packages/core/src/tools";
import { toolWords } from "../../../packages/core/src/words/tools";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import type { Kit, Spec } from "../spec";

const ROOT = join(import.meta.dir, "..", "..", "..");

/** The label of OpenCode's curl-script method, as the catalog names it. */
const CURL_METHOD = toolSpec("opencode")?.install.find(
  (method) => method.needs === "curl"
)?.label;

/** How long a leg's child may run. */
const LEG_MS = 120_000;

/** npm's launcher as npm ships it: a script Node runs. */
const NPM_STAND_IN =
  // biome-ignore lint/plugin/no-system-path: npm's own launcher line, `#!/usr/bin/env node`, as npm ships it: what fails on a machine with no node.
  "#!/usr/bin/env node\nrequire('npm/lib/cli.js')(process)\n";

/** curl: its version, or OpenCode's install script written where `-o` says. */
const CURL_STAND_IN = `#!${systemProgram("bash")}
if [ "$1" = "--version" ]; then echo "curl 8.0.0 (stand-in)"; exit 0; fi
out=""
while [ $# -gt 0 ]; do
  if [ "$1" = "-o" ]; then out="$2"; shift; fi
  shift
done
cat > "$out" <<'SCRIPT'
version=""
while [ $# -gt 0 ]; do
  if [ "$1" = "--version" ]; then version="$2"; shift; fi
  shift
done
mkdir -p "$HOME/.opencode/bin"
printf '#!${systemProgram("bash")}\\necho %s\\n' "$version" > "$HOME/.opencode/bin/opencode2"
chmod +x "$HOME/.opencode/bin/opencode2"
SCRIPT
`;

interface Said {
  /** The slow leg's: registration's install advice, how long its read took, the advice after, and how often it moved. */
  slow?: {
    after: Record<
      "claude" | "opencode",
      { command?: string; refusal?: string }
    >;
    capabilitiesMs: number;
    claude?: string;
    moved: number;
    opencode?: string;
  };
  status?: {
    detail?: string;
    method?: string;
    state: string;
    version?: string;
  };
}

const writeExecutable = async (path: string, text: string): Promise<void> => {
  await Bun.write(path, text);
  await chmod(path, 0o755);
};

/**
 * Runs `body` (module code that prints its JSON last) in a child whose PATH
 * is `bin` alone, HOME under `root`: by default OpenCode's install, or
 * `tool`'s at `pin`.
 */
const installIn = async (
  root: string,
  bin: string,
  tool = "opencode",
  pin?: string,
  body?: string
): Promise<{ said: Said; home: string; log: string }> => {
  const home = join(root, "home");
  const scratch = join(root, "tmp");
  await Promise.all(
    [home, scratch].map((dir) => mkdir(dir, { recursive: true }))
  );
  const script =
    body ??
    `
    import { installTool } from ${JSON.stringify(join(ROOT, "packages/agent/src/tools.ts"))};
    console.log(JSON.stringify({ status: await installTool(${JSON.stringify(tool)}${pin ? `, ${JSON.stringify(pin)}` : ""}) }));
  `;
  const ran = await readWithin(LEG_MS, async (signal) => {
    const child = Bun.spawn([process.execPath, "-e", script], {
      cwd: ROOT,
      env: {
        HOME: home,
        PATH: bin,
        TMPDIR: scratch,
        BUN_INSTALL: join(home, ".bun"),
      },
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
      : { out: "", err: `the child did not finish within ${LEG_MS / 1000}s` };
  return {
    said: JSON.parse(out.trim().split("\n").at(-1) || "{}") as Said,
    home,
    log: `${out.trim().slice(-600)} ${err.trim().slice(-400)}`,
  };
};

/** A PATH dir holding the npm stand-in, the system tools named, and curl's stand-in when asked. */
const binWith = async (
  root: string,
  { curl }: { curl: boolean }
): Promise<string> => {
  const bin = join(root, "bin");
  await mkdir(bin, { recursive: true });
  await writeExecutable(join(bin, "npm"), NPM_STAND_IN);
  if (curl) {
    await writeExecutable(join(bin, "curl"), CURL_STAND_IN);
    for (const tool of ["bash", "sh", "cat", "mkdir", "chmod"]) {
      const at = Bun.which(tool);
      if (at) {
        await symlink(at, join(bin, tool));
      }
    }
  }
  return bin;
};

const fallbackLeg = async (kit: Kit, root: string): Promise<void> => {
  const bin = await binWith(root, { curl: true });
  const { said, home, log } = await installIn(root, bin);
  kit.note(`(fallback) ${log}`);
  kit.check(
    "(fallback) npm on the PATH with no node: OpenCode installs with the curl script, at the version CawCo runs",
    said.status?.state === "installed" &&
      said.status.method === CURL_METHOD &&
      said.status.version === OPENCODE_VERSION &&
      existsSync(join(home, ".opencode", "bin", "opencode2")),
    JSON.stringify(said.status)
  );
};

const noneLeg = async (kit: Kit, root: string): Promise<void> => {
  const bin = await binWith(root, { curl: false });
  const { said, log } = await installIn(root, bin);
  kit.note(`(none) ${log}`);
  const detail = said.status?.detail ?? "";
  kit.check(
    "(none) npm on the PATH with no node, and nothing else: nothing installs, and the status says npm does not run, in its own words",
    said.status?.state === "unsupported" &&
      said.status.method === undefined &&
      detail.includes("does not run here") &&
      detail.includes("node"),
    JSON.stringify(said.status)
  );
};

/** A version of pi no release has, pinned. */
const PI_PIN = "9.9.9";

const pinLeg = async (kit: Kit, root: string): Promise<void> => {
  const bin = await binWith(root, { curl: true });
  const { said, home, log } = await installIn(root, bin, "pi", PI_PIN);
  kit.note(`(pin) ${log}`);
  const labels = (toolSpec("pi")?.install ?? [])
    .filter((method) => method.platforms.includes("linux"))
    .map((method) => method.label);
  kit.check(
    "(pin) pi pinned where none of its methods installs a chosen version: nothing runs, and the status names the pin and each of those methods",
    said.status?.state === "unsupported" &&
      said.status.detail ===
        toolWords.noPinInstaller("pi", PI_PIN, labels, []) &&
      !existsSync(join(home, ".local", "bin", "pi")),
    JSON.stringify(said.status)
  );
};

/**
 * How long the slow `claude` takes to answer `--version`: past the agent's
 * bound on a need's probe (15 s), and short of the child's own life (its
 * capabilities read, then 17 s), so the version read the agent leaves
 * running on purpose (claude-version.ts) ends inside it and nothing outlives
 * the leg.
 */
const SLOW_S = 18;

/** A `claude` that started and answers `--version` late, as on a host under load; anything else it ends at once. */
const SLOW_CLAUDE = `#!${systemProgram("bash")}
if [ "$1" = "--version" ]; then exec sleep ${SLOW_S}; fi
exit 0
`;

/** What `method`'s advice says at CawCo's version of `tool`. */
const commandOf = (tool: string, needs: string): string | undefined => {
  const spec = toolSpec(tool);
  const method = spec?.install.find((one) => one.needs === needs);
  const version = spec?.exactVersion;
  return version && method?.pinnedCommand
    ? method.pinnedCommand.replaceAll("{version}", version)
    : method?.command;
};

const slowLeg = async (kit: Kit, root: string): Promise<void> => {
  const bin = await binWith(root, { curl: true });
  await writeExecutable(join(bin, "claude"), SLOW_CLAUDE);
  const sleep = Bun.which("sleep");
  if (sleep) {
    await symlink(sleep, join(bin, "sleep"));
  }
  const tools = JSON.stringify(join(ROOT, "packages/agent/src/tools.ts"));
  const capabilities = JSON.stringify(
    join(ROOT, "packages/agent/src/capabilities.ts")
  );
  // Registration's read, then the advice again once every probe it did not
  // wait on is past its bound.
  const body = `
    import { installAdvice, onNeedsAnswered } from ${tools};
    import { probeCapabilities } from ${capabilities};
    let moved = 0;
    onNeedsAnswered(() => { moved += 1; });
    const started = performance.now();
    const caps = await probeCapabilities();
    const capabilitiesMs = Math.round(performance.now() - started);
    const at = (id) => caps.items.find((item) => item.id === id)?.installCommand;
    await Bun.sleep(17_000);
    const after = { claude: await installAdvice("claude"), opencode: await installAdvice("opencode") };
    console.log(JSON.stringify({ slow: { capabilitiesMs, claude: at("claude"), opencode: at("opencode"), after, moved } }));
  `;
  const { said, log } = await installIn(root, bin, "claude", undefined, body);
  kit.note(`(slow) ${log}`);
  const update = commandOf("claude", "claude");
  const { slow } = said;
  kit.check(
    "(slow) a claude whose --version sleeps past the need probe's 15 s bound: registration's capabilities read doesn't wait on it, and advises its own updater",
    slow !== undefined &&
      slow.capabilitiesMs < 10_000 &&
      update !== undefined &&
      slow.claude === update,
    JSON.stringify(slow)
  );
  kit.check(
    "(slow) once its probe is past the bound, claude is taken as running: the advice is still its own updater",
    slow !== undefined && slow.after.claude.command === update,
    JSON.stringify(slow?.after)
  );
  kit.check(
    "(slow) the npm with no node, given from what was known at registration, moves to the curl script once its probe answers, and the capabilities hear it",
    slow !== undefined &&
      slow.opencode === commandOf("opencode", "npm") &&
      slow.after.opencode.command === commandOf("opencode", "curl") &&
      slow.moved >= 1,
    JSON.stringify(slow)
  );
};

/** How long the orphan leg's `claude --version` would run on its own: far past the leg. */
const ORPHAN_S = 120;

/** A tool whose `--version` adds its pid to `$PID_FILE`, then runs as `sleep` in its place. */
const PID_STAND_IN = `#!${systemProgram("bash")}
if [ "$1" = "--version" ]; then echo $$ >> "$PID_FILE"; exec sleep ${ORPHAN_S}; fi
exit 0
`;

/** How long the orphan legs give the read to start, and its tether to end it. */
const ORPHAN_WAIT_MS = 10_000;

/** Whether process `pid` is there (core signal-wall.ts `isAlive`). */
const alive = (pid: number): boolean => isAlive(listedPid(pid));

/** The pids `$PID_FILE` holds, one a line. */
const pidsIn = async (file: string): Promise<number[]> =>
  existsSync(file)
    ? (await Bun.file(file).text())
        .split("\n")
        .map((line) => Number.parseInt(line.trim(), 10))
        .filter(Number.isInteger)
    : [];

/**
 * An agent killed (SIGKILL) while its read of `tool --version` runs: the
 * child runs `call` (module code, `agent` the agent's src dir), `tool` a
 * stand-in that says its pid and sleeps; once a read has started the child
 * is killed, and every read must be gone within {@link ORPHAN_WAIT_MS}.
 */
const orphanLeg = async (
  kit: Kit,
  root: string,
  leg: { assertion: string; call: (agent: string) => string; tool: string }
): Promise<void> => {
  const bin = join(root, "bin");
  const home = join(root, "home");
  await Promise.all([bin, home].map((dir) => mkdir(dir, { recursive: true })));
  await writeExecutable(join(bin, leg.tool), PID_STAND_IN);
  const sleep = Bun.which("sleep");
  if (sleep) {
    await symlink(sleep, join(bin, "sleep"));
  }
  const pidFile = join(root, "reads.pid");
  const script = `
    ${leg.call(join(ROOT, "packages/agent/src"))}
    await Bun.sleep(${ORPHAN_S * 1000});
  `;
  const agent = Bun.spawn([process.execPath, "-e", script], {
    cwd: ROOT,
    env: { HOME: home, PATH: bin, TMPDIR: root, PID_FILE: pidFile },
    stdout: "ignore",
    stderr: "ignore",
  });
  const started = performance.now();
  while (
    (await pidsIn(pidFile)).length === 0 &&
    performance.now() - started < ORPHAN_WAIT_MS
  ) {
    await Bun.sleep(100);
  }
  const pids = (await pidsIn(pidFile)).filter(alive);
  agent.kill("SIGKILL");
  await agent.exited;
  const ending = performance.now();
  while (pids.some(alive) && performance.now() - ending < ORPHAN_WAIT_MS) {
    await Bun.sleep(100);
  }
  const left = pids.filter(alive);
  for (const pid of left) {
    // What the leg started goes with it, whatever it found.
    sendSignal(listedPid(pid), "SIGKILL");
  }
  kit.check(
    leg.assertion,
    pids.length > 0 && left.length === 0,
    JSON.stringify({ reading: pids, left })
  );
};

const spec: Spec = {
  group: "The hub and machines",
  name: "install-method-runs",
  run: async (kit: Kit) => {
    const root = await mkdtemp(
      join(process.env.TMPDIR ?? tmpdir(), "install-method-runs-")
    );
    try {
      await fallbackLeg(kit, join(root, "fallback"));
      await noneLeg(kit, join(root, "none"));
      await pinLeg(kit, join(root, "pin"));
      await slowLeg(kit, join(root, "slow"));
      await orphanLeg(kit, join(root, "orphan"), {
        tool: "claude",
        call: (agent) =>
          `import { claudeHostVersion } from ${JSON.stringify(join(agent, "claude-version.ts"))}; await claudeHostVersion();`,
        assertion:
          "(orphan) an agent killed (SIGKILL) mid-read of Claude Code's version leaves no claude --version running",
      });
      await orphanLeg(kit, join(root, "orphan-tool"), {
        tool: "git",
        call: (agent) =>
          `import { probeCapabilities } from ${JSON.stringify(join(agent, "capabilities.ts"))}; probeCapabilities().catch(() => undefined);`,
        assertion:
          "(orphan-tool) an agent killed (SIGKILL) mid-read of a capability's version (git --version) leaves it running nowhere",
      });
      await orphanLeg(kit, join(root, "orphan-need"), {
        tool: "pi",
        call: (agent) =>
          `import { installAdvice } from ${JSON.stringify(join(agent, "tools.ts"))}; await installAdvice("pi");`,
        assertion:
          "(orphan-need) an agent killed (SIGKILL) mid-probe of a method's need (pi --version) leaves it running nowhere",
      });
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
