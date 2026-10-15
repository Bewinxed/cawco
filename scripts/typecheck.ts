/**
 * `bun run typecheck`: every check the repository's type and generated-artifact
 * gate is made of, run at once, each in its own process, each with a time
 * limit. What each printed comes out whole when it ends, and the run fails
 * when any one failed, timed out, or could not start.
 *
 * The checks: every workspace package's own `typecheck` script; the
 * generated-artifact checks (openapi, hub migrations, role budgets, openui views, the Swift
 * tool presentation, Claude Code paths, Apple operations, the Swift words);
 * the root, scripts and probe-kit TypeScript projects; and typecheck coverage,
 * after the dashboard's (its project extends the config `svelte-kit sync`
 * writes there).
 *
 * Run one after another these took 27–66 s, mostly waiting on the dashboard's
 * svelte-check and the openapi check in turn; together they take as long as
 * the longest (tooling-speed.md).
 */
import { availableParallelism } from "node:os";
import { join } from "node:path";

const ROOT = join(import.meta.dir, "..");
const BUN = process.execPath;
const TSC = join(ROOT, "node_modules/.bin/tsc");
/** Past this a check is stopped and fails; the slowest takes about 15 s on a loaded machine. */
const TIMEOUT_MS = 240_000;
/** Grace between asking a timed-out check to stop and killing it. */
const KILL_GRACE_MS = 5000;
const AT_ONCE = Math.max(4, Math.floor(availableParallelism() / 2));

interface Check {
  /** A check that starts only when this one has ended. */
  after?: string;
  argv: string[];
  dir: string;
  name: string;
}

interface Outcome {
  check: Check;
  ok: boolean;
  output: string;
  seconds: number;
  why: string;
}

const manifest = (await Bun.file(join(ROOT, "package.json")).json()) as {
  workspaces: string[];
};
const manifests = manifest.workspaces.flatMap((pattern) => [
  ...new Bun.Glob(`${pattern}/package.json`).scanSync({ cwd: ROOT }),
]);
const packages: Check[] = (
  await Promise.all(
    manifests.map(async (path) => ({
      path,
      pkg: (await Bun.file(join(ROOT, path)).json()) as {
        name: string;
        scripts?: Record<string, string>;
      },
    }))
  )
)
  .filter(({ pkg }) => pkg.scripts?.typecheck)
  .map(({ path, pkg }) => ({
    name: `${pkg.name} typecheck`,
    dir: join(ROOT, path, ".."),
    argv: [BUN, "run", "typecheck"],
  }));
const DASHBOARD = "@cawco/dashboard typecheck";
const script = (dir: string, name: string): Check => ({
  name: `${dir === "." ? "" : `${dir} `}${name}`,
  dir: join(ROOT, dir),
  argv: [BUN, "run", name],
});
const project = (tsconfig: string): Check => ({
  name: `tsc ${tsconfig}`,
  dir: ROOT,
  argv: [TSC, "--project", tsconfig],
});

// The longest first, so they never wait for a free slot.
const checks: Check[] = [
  ...packages.filter((check) => check.name === DASHBOARD),
  script("packages/hub", "openapi:check"),
  script("packages/hub", "migrations:check"),
  ...packages.filter((check) => check.name !== DASHBOARD),
  project("scripts/tsconfig.json"),
  project("scripts/probe-kit/tsconfig.json"),
  project("tsconfig.json"),
  script(".", "claude-paths:check"),
  script("packages/hub", "roles:check"),
  script("packages/core", "openui:check"),
  script("packages/core", "tools:check"),
  script(".", "apple-ops:check"),
  script(".", "words:check"),
  { ...script(".", "typecheck:coverage"), after: DASHBOARD },
];
if (!checks.some((check) => check.name === DASHBOARD)) {
  throw new Error(`No ${DASHBOARD} among the workspace packages`);
}

/**
 * Each check runs as its own process group (`detached`: `setsid()`), so a stop
 * reaches everything it started: `bun run` hands the work to a shell and its
 * children, which hold the output pipes open past their parent's end.
 */
const groups = new Set<number>();
const signalGroup = (pid: number, signal: NodeJS.Signals): void => {
  try {
    process.kill(-pid, signal);
  } catch {
    // The group has already ended.
  }
};
// Out of the terminal's process group, a check no longer hears Ctrl-C itself.
for (const signal of ["SIGINT", "SIGTERM"] as const) {
  process.on(signal, () => {
    for (const pid of groups) {
      signalGroup(pid, "SIGKILL");
    }
    process.exit(130);
  });
}

const run = async (check: Check): Promise<Outcome> => {
  const started = performance.now();
  const seconds = () => (performance.now() - started) / 1000;
  let child: ReturnType<typeof Bun.spawn<"ignore", "pipe", "pipe">>;
  try {
    child = Bun.spawn(check.argv, {
      cwd: check.dir,
      stdin: "ignore",
      stdout: "pipe",
      stderr: "pipe",
      detached: true,
    });
  } catch (error) {
    return {
      check,
      ok: false,
      why: `did not start: ${error instanceof Error ? error.message : String(error)}`,
      seconds: seconds(),
      output: "",
    };
  }
  const { pid } = child;
  groups.add(pid);
  let timedOut = false;
  let grace: ReturnType<typeof setTimeout> | undefined;
  const timer = setTimeout(() => {
    timedOut = true;
    signalGroup(pid, "SIGTERM");
    grace = setTimeout(() => signalGroup(pid, "SIGKILL"), KILL_GRACE_MS);
  }, TIMEOUT_MS);
  const [out, err, code] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  clearTimeout(timer);
  clearTimeout(grace);
  // Whatever the check left running goes with it.
  signalGroup(pid, "SIGKILL");
  groups.delete(pid);
  let why = "ok";
  if (timedOut) {
    why = `timed out after ${TIMEOUT_MS / 1000}s`;
  } else if (code !== 0) {
    why = `exit ${code}`;
  }
  return {
    check,
    ok: why === "ok",
    why,
    seconds: seconds(),
    output: `${out}${err}`.trim(),
  };
};

const report = (outcome: Outcome): void => {
  const status = outcome.ok ? "ok" : `FAILED: ${outcome.why}`;
  console.log(
    `── ${outcome.check.name} · ${outcome.seconds.toFixed(1)}s · ${status}`
  );
  if (outcome.output) {
    console.log(outcome.output);
  }
};

const started = performance.now();
const ended = new Map<string, Promise<Outcome>>();
const outcomes: Outcome[] = [];
let slots = AT_ONCE;
const waiting: (() => void)[] = [];
const slot = async (): Promise<void> => {
  if (slots > 0) {
    slots -= 1;
    return;
  }
  await new Promise<void>((resolve) => waiting.push(resolve));
};
const free = (): void => {
  const next = waiting.shift();
  if (next) {
    next();
  } else {
    slots += 1;
  }
};
for (const check of checks) {
  const before = check.after ? ended.get(check.after) : undefined;
  ended.set(
    check.name,
    (async () => {
      await before;
      await slot();
      try {
        const outcome = await run(check);
        outcomes.push(outcome);
        report(outcome);
        return outcome;
      } finally {
        free();
      }
    })()
  );
}
await Promise.all(ended.values());

const failed = outcomes.filter((outcome) => !outcome.ok);
const wall = ((performance.now() - started) / 1000).toFixed(1);
if (failed.length > 0) {
  console.error(
    `typecheck: ${failed.length} of ${checks.length} checks failed in ${wall}s: ${failed.map((outcome) => outcome.check.name).join(", ")}`
  );
  process.exit(1);
}
console.log(`typecheck: ${checks.length} checks passed in ${wall}s`);
