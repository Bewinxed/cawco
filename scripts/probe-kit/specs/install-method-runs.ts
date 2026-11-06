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
 *   bun scripts/probe-kit/run.ts install-method-runs
 */
import { existsSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, symlink } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { readWithin } from "../../../packages/core/src/bounded";
import { OPENCODE_VERSION, toolSpec } from "../../../packages/core/src/tools";
import { toolWords } from "../../../packages/core/src/words/tools";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import type { Kit, Spec } from "../kit";

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

/** Runs OpenCode's install in a child whose PATH is `bin` alone, HOME under `root`. */
const installIn = async (
  root: string,
  bin: string,
  tool = "opencode",
  pin?: string
): Promise<{ said: Said; home: string; log: string }> => {
  const home = join(root, "home");
  const scratch = join(root, "tmp");
  await Promise.all(
    [home, scratch].map((dir) => mkdir(dir, { recursive: true }))
  );
  const script = `
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
    } finally {
      await rm(root, { recursive: true, force: true });
    }
  },
};

export default spec;
