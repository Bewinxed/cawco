/**
 * A release stopped at any point leaves nothing behind (nightly 5186, stopped
 * with `systemctl --user stop`, left its three trees' worktree records, a
 * draft release and a "clearing its work failed: ENOENT … posix_spawn 'git'").
 *
 * Each leg runs the real `scripts/ship.sh --run` of a commit holding this tree
 * (the tree's own `git stash create`, or HEAD when the tree is clean) in a
 * scratch clone whose origin's main is that commit, under a HOME of its own,
 * so the real release.ts runs: its preflight, its lock, its graph. What it
 * cannot reach from here stands in, on PATH: `gh` keeps releases as folders
 * (a draft has a `draft` file), `podman unshare` runs its command as is, and
 * rcodesign says its version; the signing secrets are junk, and nothing is
 * signed before the stop. The stop is the unit's (KillMode=mixed): SIGTERM to
 * ship.sh's shell alone, which hands it to the release.
 *
 * Legs, each stopped at its own point:
 * - before: as the runner's worktree appears, before the release has started.
 * - trees: once the release's two trees exist, the one it builds in and the
 *   one it checks in (release.ts `treesOf`).
 * - draft: once its draft is up, with a proof instance planted in its staging
 *   (a run dir its storage records, and a process naming it) and a decoy run
 *   dir no staging records, named as a proof's and owned by no live proof,
 *   which the old `--stale` stop sweep took and an exact-key sweep leaves.
 * - drafting: while gh is still making the draft (the release exists on the
 *   host, its client not back yet).
 * - acquiring: while the release is still taking its build lock. A stale
 *   generation stands in the lock before the run (its holder gone, one of its
 *   command groups alive and ending 5 s after its SIGTERM), so the release's
 *   takeover holds `acquire()` open while it ends that group; the stop lands
 *   as the takeover is said. It must wait for the claim to settle, then let it
 *   go: no generation keeps a holder.json, the stale one included.
 *
 * After each: ship.sh exits 143; git records no worktree but the clone's own;
 * ~/.worktrees is empty; no release is left at the gh stand-in; no staging is
 * left; no process runs from or names the leg's folder (the decoy aside); the
 * lock is released; and a release that started says one line of what it
 * cleared, with no "could not clear".
 *
 * GitHub itself is stood in for: a real draft's removal is the host's leg
 * (`bash scripts/ship.sh` of a commit, `systemctl --user stop` the unit once
 * `gh release list` shows its draft, then `gh release list` again).
 *
 *   bun scripts/probe-kit/run.ts release-stop
 */
import { existsSync, readdirSync, readFileSync, readlinkSync } from "node:fs";
import { chmod, mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { listedPid, signal } from "../../../packages/core/src/signal";
import { systemProgram } from "../../../packages/core/src/workspace-needs";
import type { Kit, Spec } from "../spec";

const ROOT = resolve(import.meta.dir, "..", "..", "..");
/** How long a leg waits for the point it stops at. Our call: the trees take seconds, the draft follows the install. */
const POINT_MS = 240_000;
/** How long a stopped release has to end: its groups' grace (release.ts STOP_GRACE_MS) and its clearing. */
const STOP_MS = 300_000;
/** The stand-in's record of a draft's create: `api --include --method POST --input - repos/<owner>/<repo>/releases`. */
const CREATE_CALL =
  /--method POST --input - repos\/[^/\s]+\/[^/\s]+\/releases$/mu;

/**
 * The gh stand-in: `gh api --include` as publish-release.ts asks GitHub's
 * REST API through it (since 6882fb35d), answering each request with a
 * status line, headers and body as gh prints them (outside-call.ts
 * `printedAnswer`). A release is $GH_STATE/releases/<tag>: its record in
 * `release.json`, a `draft` file while it is one, and its assets beside them.
 * A create makes the draft, then waits `GH_CREATE_SECONDS` before it answers,
 * as a client still waiting on GitHub does. Anything else is refused, 404.
 */
const GH = `#!${process.execPath}
const fs = require("node:fs");
const path = require("node:path");
const state = process.env.GH_STATE;
if (!state) {
  console.error("gh stand-in: GH_STATE is not set");
  process.exit(1);
}
const argv = process.argv.slice(2);
fs.appendFileSync(path.join(state, "calls.log"), argv.join(" ") + "\\n");
let method = "GET";
let input;
let route = "";
for (let i = 1; i < argv.length; i++) {
  const arg = argv[i];
  if (arg === "--include") continue;
  if (arg === "--method") { method = argv[++i]; continue; }
  if (arg === "-H") { i++; continue; }
  if (arg === "--input") { input = argv[++i]; continue; }
  route = arg;
}
const answer = (status, text, body) => {
  process.stdout.write("HTTP/2.0 " + status + " " + text + "\\r\\nContent-Type: application/json\\r\\n\\r\\n" + (body === undefined ? "" : JSON.stringify(body)));
  process.exit(0);
};
if (argv[0] !== "api") {
  console.error("gh stand-in: " + argv.join(" "));
  process.exit(1);
}
const releases = path.join(state, "releases");
const tags = () => fs.readdirSync(releases);
const recordOf = (tag) => {
  const record = JSON.parse(fs.readFileSync(path.join(releases, tag, "release.json"), "utf8"));
  return { ...record, draft: fs.existsSync(path.join(releases, tag, "draft")) };
};
const save = (record) => fs.writeFileSync(path.join(releases, record.tag_name, "release.json"), JSON.stringify(record));
const byId = (id) => tags().map(recordOf).find((record) => String(record.id) === id);
const nextId = () => {
  const file = path.join(state, "next-id");
  const id = Number(fs.existsSync(file) ? fs.readFileSync(file, "utf8") : "1");
  fs.writeFileSync(file, String(id + 1));
  return id;
};
const body = () => JSON.parse(input === "-" ? fs.readFileSync(0, "utf8") : "{}");
const [where, query = ""] = route.split("?");
const parts = where.split("/");
const repo = parts.slice(0, 3).join("/");
const rest = parts.slice(3);
(async () => {
  if (rest[0] === "releases" && rest.length === 1 && method === "GET") {
    return answer(200, "OK", tags().filter((tag) => fs.existsSync(path.join(releases, tag, "release.json"))).map(recordOf));
  }
  if (rest[0] === "releases" && rest.length === 1 && method === "POST") {
    const asked = body();
    const record = {
      id: nextId(),
      tag_name: asked.tag_name,
      prerelease: Boolean(asked.prerelease),
      created_at: new Date().toISOString(),
      upload_url: "",
      assets: [],
    };
    record.upload_url = repo + "/releases/" + record.id + "/assets{?name,label}";
    fs.mkdirSync(path.join(releases, record.tag_name), { recursive: true });
    save(record);
    fs.writeFileSync(path.join(releases, record.tag_name, "draft"), "");
    await Bun.sleep(Number(process.env.GH_CREATE_SECONDS ?? "0") * 1000);
    return answer(201, "Created", { ...record, draft: true });
  }
  if (rest[0] === "releases" && rest[1] === "assets" && rest.length === 3 && method === "DELETE") {
    for (const tag of tags()) {
      const record = recordOf(tag);
      const asset = record.assets.find((one) => String(one.id) === rest[2]);
      if (asset) {
        fs.rmSync(path.join(releases, tag, asset.name), { force: true });
        record.assets = record.assets.filter((one) => one !== asset);
        save(record);
        return answer(204, "No Content");
      }
    }
    return answer(404, "Not Found", { message: "Not Found" });
  }
  if (rest[0] === "releases" && rest.length === 3 && rest[2] === "assets" && method === "POST") {
    const record = byId(rest[1]);
    const name = new URLSearchParams(query).get("name");
    if (!record || !name) return answer(404, "Not Found", { message: "Not Found" });
    fs.copyFileSync(input, path.join(releases, record.tag_name, name));
    const asset = { id: nextId(), name };
    record.assets.push(asset);
    save(record);
    return answer(201, "Created", asset);
  }
  if (rest[0] === "releases" && rest.length === 2) {
    const record = byId(rest[1]);
    if (!record) return answer(404, "Not Found", { message: "Not Found" });
    if (method === "GET") return answer(200, "OK", record);
    if (method === "DELETE") {
      fs.rmSync(path.join(releases, record.tag_name), { recursive: true, force: true });
      return answer(204, "No Content");
    }
    if (method === "PATCH") {
      if (body().draft === false) fs.rmSync(path.join(releases, record.tag_name, "draft"), { force: true });
      return answer(200, "OK", recordOf(record.tag_name));
    }
  }
  if (rest[0] === "git" && rest[1] === "refs" && rest[2] === "tags" && method === "DELETE") {
    return answer(204, "No Content");
  }
  console.error("gh stand-in: " + method + " " + route);
  return answer(404, "Not Found", { message: "gh stand-in: " + method + " " + route });
})();
`;
const PODMAN = `#!${systemProgram("bash")}
# podman stand-in: 'unshare' runs its command as this user; nothing else is reached before a stop.
[[ \${1:-} == unshare ]] && { shift; exec "$@"; }
echo "podman stand-in: $*" >&2
exit 1
`;

const run = async (
  command: string[],
  options: { cwd?: string; env?: Record<string, string> } = {}
): Promise<string> => {
  const child = Bun.spawn(command, {
    cwd: options.cwd ?? ROOT,
    env: options.env ?? process.env,
    stdout: "pipe",
    stderr: "pipe",
  });
  const [out, err, status] = await Promise.all([
    new Response(child.stdout).text(),
    new Response(child.stderr).text(),
    child.exited,
  ]);
  if (status !== 0) {
    throw new Error(`${command.join(" ")} exited ${status}: ${err.trim()}`);
  }
  return out.trim();
};

/** Waits until `ready` says so, or `within` ms pass: whether it did. */
const until = async (
  ready: () => boolean | Promise<boolean>,
  within: number
): Promise<boolean> => {
  const deadline = performance.now() + within;
  while (performance.now() < deadline) {
    if (await ready()) {
      return true;
    }
    await Bun.sleep(100);
  }
  return false;
};

/** Every process whose command line names `dir` or whose cwd is under it, but `spare`. */
const processesUnder = (
  dir: string,
  spare: Set<number>
): { pid: number; said: string }[] => {
  const found: { pid: number; said: string }[] = [];
  for (const name of readdirSync("/proc")) {
    const pid = Number(name);
    if (!Number.isInteger(pid) || spare.has(pid) || pid === process.pid) {
      continue;
    }
    try {
      const args = readFileSync(`/proc/${pid}/cmdline`, "utf8")
        .split("\0")
        .join(" ")
        .trim();
      const cwd = readlinkSync(`/proc/${pid}/cwd`);
      const stat = readFileSync(`/proc/${pid}/stat`, "utf8");
      if (stat.charAt(stat.lastIndexOf(")") + 2) === "Z") {
        continue;
      }
      if (args.includes(dir) || cwd.startsWith(dir)) {
        found.push({ pid, said: `${pid} (${args.slice(0, 120)}, in ${cwd})` });
      }
    } catch {
      // Gone since the listing, or not ours to read.
    }
  }
  return found;
};

/** Each of `pids` sent SIGKILL; one already gone is nothing to end. */
const endAll = (pids: Iterable<number>): void => {
  for (const pid of pids) {
    // Gone already, it is nothing to end.
    signal(listedPid(pid), "SIGKILL");
  }
};

interface Leg {
  /** The point the leg stops at: true once it is reached. */
  at: (where: Where) => boolean;
  /** Extra environment for the run (the gh stand-in's delays). */
  env?: Record<string, string>;
  name: string;
  /** Plants a proof instance and a decoy in the staging once the point is reached. */
  plant?: boolean;
  /** Puts a stale generation in the build lock before the run, one of its groups still running. */
  stale?: boolean;
  /** Whether the release has started by the stop, so it says what it cleared. */
  started: boolean;
}

interface Where {
  ghState: string;
  home: string;
  log: string;
  main: string;
  sha: string;
}

const listed = (dir: string): string[] =>
  existsSync(dir) ? readdirSync(dir) : [];

const LEGS: Leg[] = [
  {
    name: "before",
    started: false,
    at: ({ home }) =>
      listed(join(home, ".worktrees")).some((name) =>
        name.startsWith("release-runner-")
      ),
  },
  {
    name: "trees",
    started: true,
    at: ({ home, sha }) =>
      [
        `release-${sha.slice(0, 12)}`,
        `release-${sha.slice(0, 12)}-check`,
      ].every((tree) => existsSync(join(home, ".worktrees", tree))),
  },
  {
    name: "draft",
    started: true,
    plant: true,
    at: ({ ghState }) =>
      listed(join(ghState, "releases")).some((tag) =>
        existsSync(join(ghState, "releases", tag, "draft"))
      ),
  },
  {
    name: "drafting",
    started: true,
    env: { GH_CREATE_SECONDS: "120" },
    at: ({ ghState }) =>
      existsSync(join(ghState, "calls.log")) &&
      CREATE_CALL.test(readFileSync(join(ghState, "calls.log"), "utf8")),
  },
  {
    name: "acquiring",
    started: true,
    stale: true,
    at: ({ log }) =>
      existsSync(log) &&
      readFileSync(log, "utf8").includes("Took over a stale build lock"),
  },
];

/** The commit the legs ship: this tree as it stands. */
const commitOfTree = async (): Promise<string> =>
  (await run(["git", "stash", "create"])) ||
  (await run(["git", "rev-parse", "HEAD"]));

const runLeg = async (
  kit: Kit,
  scratch: string,
  origin: string,
  sha: string,
  leg: Leg
): Promise<void> => {
  const dir = join(scratch, leg.name);
  const home = join(dir, "home");
  const main = join(dir, "main");
  const bin = join(dir, "bin");
  const runtime = join(dir, "runtime");
  const ghState = join(dir, "gh");
  const configHome = join(home, ".config");
  // The workspaces' cache, whose disk the release's room check reads (lib/disk-room.ts).
  const cache = join(home, ".cawco", "workspace-cache");
  await Promise.all(
    [home, bin, runtime, join(ghState, "releases"), configHome, cache].map(
      (path) => mkdir(path, { recursive: true })
    )
  );
  // On main, the commit under test: ship.sh runs from this checkout (origin's HEAD is the tree's own branch).
  await run([
    "git",
    "clone",
    "--quiet",
    "--shared",
    "--branch",
    "main",
    origin,
    main,
  ]);
  const env: Record<string, string> = {
    ...Object.fromEntries(
      Object.entries(process.env).filter(
        (entry): entry is [string, string] =>
          entry[1] !== undefined && entry[0] !== "CAWCO_RELEASE_SIGNING_ENV"
      )
    ),
    HOME: home,
    PATH: `${bin}:${process.env.PATH ?? ""}`,
    XDG_CONFIG_HOME: configHome,
    XDG_DATA_HOME: join(home, ".local", "share"),
    XDG_STATE_HOME: join(home, ".local", "state"),
    XDG_RUNTIME_DIR: runtime,
    GH_STATE: ghState,
    ...leg.env,
  };
  await writeFile(join(bin, "gh"), GH);
  await writeFile(join(bin, "podman"), PODMAN);
  await Promise.all(
    ["gh", "podman"].map((name) => chmod(join(bin, name), 0o755))
  );
  const { RCODESIGN_VERSION } = await import("../../release-tools");
  const tools = join(home, ".local", "share", "cawco-release", "tools");
  await mkdir(tools, { recursive: true });
  await writeFile(
    join(tools, `rcodesign-${RCODESIGN_VERSION}`),
    `#!${systemProgram("sh")}\necho "apple-codesign ${RCODESIGN_VERSION}"\n`
  );
  await chmod(join(tools, `rcodesign-${RCODESIGN_VERSION}`), 0o755);
  const junk = Buffer.from("not a key").toString("base64");
  await mkdir(join(configHome, "cawco"), { recursive: true });
  await writeFile(
    join(configHome, "cawco", "release.env"),
    [
      "CAWCO_RELEASE_SIGNING_KEY",
      "CAWCO_APPLE_DEVELOPER_ID",
      "CAWCO_APP_STORE_CONNECT_KEY",
    ]
      .map((name) => `${name}=${junk}\n`)
      .join("")
  );
  const locks = join(home, ".cache", "cawco", "release-pipeline", "build-lock");
  if (leg.stale) {
    // A command group of a gone holder: it shrugs off the first SIGTERM and ends 5 s after it.
    const group = Bun.spawn(
      [
        "bash",
        "-c",
        "trap 'sleep 5; exit 0' TERM; while :; do sleep 1; done",
        join(dir, "stale-holder"),
      ],
      {
        env: process.env,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      }
    );
    group.unref();
    const started = await run(["ps", "-o", "lstart=", "-p", String(group.pid)]);
    await mkdir(join(locks, "1"), { recursive: true });
    await writeFile(
      join(locks, "1", "holder.json"),
      JSON.stringify({
        pid: group.pid,
        started: "not this process's start",
        groups: [{ pid: group.pid, started }],
      })
    );
  }
  const notes = join(dir, "notes.md");
  await writeFile(notes, "A stopped release's notes.\n");
  const log = join(dir, "ship.log");
  // Its output and errors in one log, the shell's pid ship.sh's own (exec).
  const ship = Bun.spawn(
    [
      "bash",
      "-c",
      'exec bash "$0" "$@" > "$SHIP_LOG" 2>&1',
      join(main, "scripts", "ship.sh"),
      "--run",
      "--commit",
      sha,
      "--notes",
      notes,
    ],
    {
      cwd: main,
      env: { ...env, SHIP_LOG: log },
      stdio: ["ignore", "ignore", "ignore"],
      detached: true,
    }
  );
  // How it ended: its status, or the signal that ended it.
  let end: string | undefined;
  ship.exited.then(() => {
    end = String(ship.signalCode ?? ship.exitCode);
  });
  const where: Where = { ghState, home, log, main, sha };
  const reached = await until(
    () => leg.at(where) || end !== undefined,
    POINT_MS
  );
  const before = end;
  kit.check(
    `release-stop ${leg.name}: the run reaches its stop point`,
    reached && before === undefined,
    before === undefined ? "" : `ship.sh ended first, ${before}: see ${log}`
  );
  const spare = new Set<number>();
  if (leg.plant && before === undefined) {
    // A proof instance of this run, as podman-instance.sh records it, and a process naming its run dir.
    const staging = join(
      home,
      ".cache",
      "cawco",
      "release-pipeline",
      `staging-${sha.slice(0, 12)}`
    );
    const runDir = join(runtime, "cawco-proof-stage1-424242");
    await mkdir(join(runDir, "tmp"), { recursive: true });
    await mkdir(join(staging, "container-proof", "storage"), {
      recursive: true,
    });
    await writeFile(
      join(staging, "container-proof", "storage.run-dir"),
      `${runDir}\n`
    );
    // One process each, its command line naming the run dir (argv[0], as a conmon's names its paths).
    const named = (path: string) =>
      Bun.spawn(["bash", "-c", 'exec -a "$0" sleep 600', path], {
        env: process.env,
        detached: true,
        stdio: ["ignore", "ignore", "ignore"],
      });
    named(join(runDir, "conmon")).unref();
    // The decoy: another proof's run dir, named as one, recorded by no staging of this run.
    const decoy = join(runtime, `cawco-proof-stage1-${process.pid}`);
    await mkdir(decoy, { recursive: true });
    const held = named(join(decoy, "conmon"));
    held.unref();
    spare.add(held.pid);
  }
  // The unit's stop under KillMode=mixed: SIGTERM to its main process, ship.sh's shell, alone.
  ship.kill("SIGTERM");
  await until(() => end !== undefined, STOP_MS);
  kit.check(
    `release-stop ${leg.name}: ship.sh ends 143 once the release has cleared`,
    end === "143",
    `ended ${end ?? "not yet"}; log ${log}`
  );
  const trees = (
    await run(["git", "worktree", "list", "--porcelain"], { cwd: main })
  )
    .split("\n")
    .filter((line) => line.startsWith("worktree "))
    .map((line) => line.slice("worktree ".length));
  kit.check(
    `release-stop ${leg.name}: git records no worktree but the clone's own`,
    trees.length === 1 && trees[0] === main,
    trees.join(", ")
  );
  const left = listed(join(home, ".worktrees"));
  kit.check(
    `release-stop ${leg.name}: ~/.worktrees is empty`,
    left.length === 0,
    left.join(", ")
  );
  const releases = listed(join(ghState, "releases"));
  kit.check(
    `release-stop ${leg.name}: no release is left on GitHub`,
    releases.length === 0,
    `${releases.join(", ")}; gh calls: ${existsSync(join(ghState, "calls.log")) ? readFileSync(join(ghState, "calls.log"), "utf8").trim().replaceAll("\n", " | ") : "none"}`
  );
  const stagings = listed(
    join(home, ".cache", "cawco", "release-pipeline")
  ).filter((name) => name.startsWith("staging-"));
  kit.check(
    `release-stop ${leg.name}: no staging is left`,
    stagings.length === 0,
    stagings.join(", ")
  );
  const proofs = listed(runtime).filter(
    (name) => name !== `cawco-proof-stage1-${process.pid}`
  );
  kit.check(
    `release-stop ${leg.name}: no proof run dir of the run is left`,
    proofs.length === 0,
    proofs.join(", ")
  );
  if (leg.plant && before === undefined) {
    kit.check(
      `release-stop ${leg.name}: another proof's run dir, recorded by no staging of the run, is left as it was`,
      existsSync(join(runtime, `cawco-proof-stage1-${process.pid}`)) &&
        [...spare].every((pid) => existsSync(`/proc/${pid}`)),
      [...spare].join(", ")
    );
  }
  // What ended last (a group's members) is reaped by now; a breath for the kernel's listing.
  await Bun.sleep(500);
  const running = processesUnder(dir, spare);
  kit.check(
    `release-stop ${leg.name}: no process runs from or names the run's folder`,
    running.length === 0,
    running.map((one) => one.said).join("; ")
  );
  // What a failed leg left is ended here, so no run of this spec outlives it.
  endAll(running.map(({ pid }) => pid));
  const holders = listed(locks).filter((name) =>
    existsSync(join(locks, name, "holder.json"))
  );
  kit.check(
    `release-stop ${leg.name}: the build lock is released`,
    holders.length === 0,
    holders.join(", ")
  );
  const said = readFileSync(log, "utf8");
  const cleared = said
    .split("\n")
    .filter((line) =>
      line.startsWith("Release build stopped by SIGTERM: cleared")
    );
  if (leg.started) {
    kit.check(
      `release-stop ${leg.name}: the release says in one line what it cleared`,
      cleared.length === 1 && !said.includes("could not clear"),
      cleared.join(" / ") || "no such line"
    );
    kit.note(`release-stop ${leg.name}: ${cleared[0] ?? "(none)"}`);
  }
  if (leg.stale) {
    const takeover = said.indexOf("Took over a stale build lock");
    const stop = said.indexOf("Release build stopped by SIGTERM: clearing");
    kit.check(
      `release-stop ${leg.name}: the stop landed while the lock was being taken over, and the stale generation is gone`,
      takeover >= 0 && stop > takeover && !existsSync(join(locks, "1")),
      `takeover at ${takeover}, stop at ${stop}; generations ${listed(locks).join(", ")}`
    );
  }
  endAll(spare);
};

const spec: Spec = {
  group: "Release checks",
  name: "release-stop",
  ownHome:
    "it clones the repository into scratch HOMEs and runs ship.sh and release.ts there, with stand-ins for gh and podman on PATH",
  async run(kit) {
    if (process.platform !== "linux") {
      kit.note("release-stop: the release host is Linux; run on Linux only");
      return;
    }
    const sha = await commitOfTree();
    const scratch = await mkdtemp(join(tmpdir(), "release-stop-"));
    let failed = false;
    const checked: Kit = {
      ...kit,
      check: (assertion, ok, detail) => {
        failed ||= !ok;
        return kit.check(assertion, ok, detail);
      },
    };
    try {
      const origin = join(scratch, "origin.git");
      // The tree's objects shared, not copied; its main is the commit under test.
      await run([
        "git",
        "clone",
        "--quiet",
        "--bare",
        "--shared",
        ROOT,
        origin,
      ]);
      await run(["git", "-C", origin, "update-ref", "refs/heads/main", sha]);
      for (const leg of LEGS) {
        await runLeg(checked, scratch, origin, sha, leg);
      }
    } finally {
      // A leg that threw part-way ends what its run started, too.
      endAll(processesUnder(scratch, new Set()).map(({ pid }) => pid));
      if (failed) {
        kit.note(`release-stop: its runs are kept for reading at ${scratch}`);
      } else {
        await rm(scratch, { recursive: true, force: true });
      }
    }
  },
};

export default spec;
