/**
 * Probe, for a machine where a workspace boundary cannot start (inside
 * another boundary, where user namespaces are refused): everything of a
 * no-origin project's delegation through the hub's own remote except the
 * sandbox itself, on a scratch fleet (real hub, agent and sessiond on
 * loopback). probe-hub-remote-workspace.ts is the whole flow, boundary
 * included, for a machine that can hold one.
 *
 * 1. A delegation from a session of a project whose source has no origin:
 *    the agent's own `createWorkspace` gives the source the hub's remote as
 *    origin and pushes its branch and its 60 MB LFS file there, before the
 *    boundary refuses to start here. The hub names that branch its HEAD.
 * 2. This process takes the machine's credential from the agent's
 *    credential socket (as `cawco git-credential` does from a terminal),
 *    cuts a clone the way `createWorkspace` does (`prepareClone`, then the
 *    checkout with the hub's LFS), and serves its git door (`openGitDoor`).
 * 3. Commands run in the clone with exactly the environment a boundary's
 *    executor gives them (`gitDoorEnv`, the helper dir first on PATH): a
 *    session's own `git fetch` and `git push`, then landing.ts's `land()`
 *    with `SAFE_GIT_SHELL`, as the hub runs it. All go through the door.
 * 4. A plain `git pull` in the source, from a terminal, brings the landed
 *    commit in.
 * 5. The delegate's commit adds a new 60 MB LFS file: the door sends it to
 *    the hub's LFS before the push, and a fresh clone from the hub smudges
 *    it whole.
 * 6. The same for a project moved here by move.ts's own snapshot and clone
 *    steps (only `cawco/move/<machine>` on the hub): its branch tracks the
 *    hub's, and a plain `git pull` brings the landed commit in.
 * 7. The doors listen under the fleet's runtime dir, within a unix socket's
 *    107 bytes however deep HOME is; a longer path is refused up front.
 *
 * Run: IS_SANDBOX=1 HOME=<a deep writable dir> bun scripts/probe-hub-git-door.ts [--keep]
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { homedir } from "node:os";
import { join, resolve } from "node:path";
import { CAWCO_ENV } from "../packages/core/src/index";
import {
  SAFE_GIT_ENV,
  SAFE_GIT_SHELL,
  safeGitArgv,
} from "../packages/core/src/safe-git";
import { MACHINE, scratchFleet } from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const BIG = 60 * 1024 * 1024;
/** The source config keys the report shows. */
const REMOTE_KEYS = /^(credential|remote|lfs)/;
const results: Record<string, string> = {};
const check = (name: string, ok: boolean, detail: string) => {
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

const fleet = await scratchFleet({
  name: "probe-hub-git-door",
  respond: () => ({ everyMs: 5, words: ["ok"] }),
});
const home = fleet.env.HOME as string;
const owner: Record<string, string> = {
  PATH: fleet.env.PATH as string,
  HOME: home,
  USER: fleet.env.USER as string,
  XDG_CONFIG_HOME: fleet.env.XDG_CONFIG_HOME as string,
  XDG_DATA_HOME: fleet.env.XDG_DATA_HOME as string,
  XDG_CACHE_HOME: fleet.env.XDG_CACHE_HOME as string,
};
const shIn =
  (env: Record<string, string>) =>
  async (cwd: string, command: string): Promise<string> => {
    const ran = await Bun.$`sh -c ${command}`
      .cwd(cwd)
      .env(env)
      .quiet()
      .nothrow();
    const out = `${ran.stdout.toString()}${ran.stderr.toString()}`.trim();
    if (ran.exitCode !== 0) {
      throw new Error(`${command} (in ${cwd}) exited ${ran.exitCode}: ${out}`);
    }
    return out;
  };
const sh = shIn(owner);

await writeFile(
  join(home, ".gitconfig"),
  [
    '[filter "lfs"]',
    "\tclean = git-lfs clean -- %f",
    "\tsmudge = git-lfs smudge -- %f",
    "\tprocess = git-lfs filter-process",
    "\trequired = true",
    "[user]",
    "\tname = Owner",
    "\temail = owner@probe.test",
    "",
  ].join("\n")
);

try {
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const gitRoot = join(fleet.sandbox, "hub", "git");
  const prefix = `${fleet.base}/git/`;

  // This process as the agent's machine: its hub, its runtime dir (where the
  // doors this process serves go), and its credential from the agent's
  // socket under the fleet's HOME.
  process.env[CAWCO_ENV.hubUrl] = fleet.env.CAWCO_HUB_URL as string;
  process.env.XDG_RUNTIME_DIR = fleet.env.XDG_RUNTIME_DIR as string;
  const { prepareDoor } = await import("../packages/agent/src/tool-door");
  const tooLong = join(homedir(), "x".repeat(120), "git.sock");
  check(
    "a door path past 107 bytes is refused up front",
    await prepareDoor(tooLong).then(
      () => false,
      (error: Error) => error.message.includes("past the 107")
    ),
    await prepareDoor(tooLong).then(
      () => "accepted",
      (error: Error) => error.message
    )
  );
  const answer = await fetch("http://cawco/", {
    method: "POST",
    body: `protocol=http\nhost=${new URL(fleet.base).host}\n`,
    unix: join(home, ".cawco", "git-credential.sock"),
  });
  const login = Object.fromEntries(
    (await answer.text())
      .trim()
      .split("\n")
      .map((line) => line.split("=") as [string, string])
  );
  check(
    "agent's credential socket answers the hub's host",
    answer.ok && login.username === MACHINE,
    `${answer.status} username=${login.username}`
  );
  const move = await import("../packages/agent/src/move");
  move.setHubCredential(login.username, login.password);
  const { openGitDoor, closeGitDoor, gitDoorEnv, gitHelperDirOf } =
    await import("../packages/agent/src/hub-git");
  const { prepareClone } = await import("../packages/agent/src/clone");
  const { land, landingQueue } = await import("../packages/hub/src/landing");

  /** git with the hub's credential, env-only, as `createWorkspace` runs it. */
  const hubGit =
    (extra: [string, string][] = []) =>
    async (dir: string, ...args: string[]): Promise<string> => {
      const ran = Bun.spawn(safeGitArgv(args), {
        cwd: dir,
        env: { ...move.hubGitEnv(extra), ...SAFE_GIT_ENV },
        stdout: "pipe",
        stderr: "pipe",
      });
      const [code, out, err] = await Promise.all([
        ran.exited,
        new Response(ran.stdout).text(),
        new Response(ran.stderr).text(),
      ]);
      if (code !== 0) {
        throw new Error(`git ${args[0]}: ${err}`);
      }
      return out.trim();
    };

  /** Delegation from `cwd` in `projectId`: the agent's own create, up to its boundary. */
  const delegateUntilBoundary = async (
    cwd: string,
    projectId: string,
    tag: string
  ) => {
    const parent = await fleet.spawn("claude", `Parent ${tag}`, cwd, {
      projectId,
    });
    const refused = await fleet
      .api("/api/work-items", {
        parentInstanceId: parent,
        title: `Commit a file ${tag}`,
        prompt: "commit a file",
        harness: "claude",
        model: "claude-haiku-4-5",
        cwd,
        checks: [{ name: "Probe check", command: "true" }],
      })
      .then(
        () => "started",
        (error: Error) => error.message
      );
    console.log(`delegation ${tag}: ${refused}`);
    return refused;
  };

  /** A workspace's clone, cut and served as `createWorkspace` and the boundary do; its executor env. */
  const workspace = async (source: string, base: string, tag: string) => {
    const id = crypto.randomUUID();
    const path = join(fleet.sandbox, `ws-${tag}`);
    await prepareClone(source, path, hubGit(), base);
    await hubGit(move.LFS_FILTERS)(
      path,
      "checkout",
      "--quiet",
      "-b",
      `ws/${tag}`,
      `origin/${base}`
    );
    await openGitDoor({ id, path });
    const door = gitDoorEnv(id, path);
    const socket = door.CAWCO_GIT_SOCKET as string;
    const oldLayout = join(
      homedir(),
      ".cawco",
      "workspaces",
      id,
      "ro",
      "git.sock"
    );
    check(
      `${tag}: the git door listens under the fleet's runtime dir, within 107 bytes`,
      socket.startsWith(fleet.env.XDG_RUNTIME_DIR as string) &&
        Buffer.byteLength(socket) <= 107 &&
        (await stat(socket)).isSocket(),
      `${socket} (${Buffer.byteLength(socket)} bytes); in the read-only dir under this HOME it would be ${Buffer.byteLength(oldLayout)} bytes`
    );
    check(
      `${tag}: a hub-origin workspace's commands skip git-lfs's own pre-push`,
      door.GIT_LFS_SKIP_PUSH === "1",
      JSON.stringify(Object.keys(door))
    );
    const env = {
      ...owner,
      PATH: `${gitHelperDirOf(id)}:${owner.PATH}`,
      CAWCO_GIT_SOCKET: socket,
      GIT_LFS_SKIP_PUSH: door.GIT_LFS_SKIP_PUSH as string,
      // What the runner exports after srt's own environment.
      GIT_CONFIG_PARAMETERS: door.CAWCO_GIT_PARAMETERS as string,
    };
    return { id, path, env, run: shIn(env) };
  };

  /** A session's own fetch, commit and push, then the hub's landing, all through the door. */
  const sessionAndLand = async (
    ws: Awaited<ReturnType<typeof workspace>>,
    base: string,
    tag: string,
    hubRepo: string,
    /** A new large file the delegate's commit adds, tracked by LFS. */
    large?: string
  ) => {
    const rewritten = await ws.run(ws.path, "git ls-remote --get-url origin");
    check(
      `${tag}: origin is rewritten to the cawco helper inside`,
      rewritten.startsWith("cawco::"),
      rewritten
    );
    const session = await ws.run(
      ws.path,
      [
        "git fetch origin 2>&1 && echo FETCH-OK",
        `echo 'by the delegate ${tag}' > delegate-${tag}.txt`,
        `git add delegate-${tag}.txt`,
        ...(large
          ? [
              `head -c ${BIG} /dev/urandom > ${large}`,
              `git lfs track --filename ${large} >/dev/null`,
              `git add .gitattributes ${large}`,
            ]
          : []),
        `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
        `git push origin HEAD:refs/heads/probe-session-${tag} 2>&1 && echo PUSH-OK`,
      ].join(" && ")
    );
    check(
      `${tag}: session's own fetch and push through the door`,
      session.includes("FETCH-OK") && session.includes("PUSH-OK"),
      session.replaceAll("\n", " | ")
    );
    check(
      `${tag}: the session's branch is on the hub`,
      (await sh(
        hubRepo,
        `git for-each-ref --format='%(refname)' refs/heads/probe-session-${tag}`
      )) === `refs/heads/probe-session-${tag}`,
      await sh(hubRepo, "git for-each-ref --format='%(refname)' refs/heads/")
    );
    const outcome = await land(base, {
      queue: landingQueue(),
      recheck: () => Promise.resolve(undefined),
      run: async (cmd) => {
        const ran = await Bun.$`sh -c ${`${SAFE_GIT_SHELL}${cmd}`}`
          .cwd(ws.path)
          .env(ws.env)
          .quiet()
          .nothrow();
        return {
          exitCode: ran.exitCode,
          stdout: ran.stdout.toString(),
          stderr: ran.stderr.toString(),
        };
      },
    });
    check(
      `${tag}: land() lands on the hub's ${base}`,
      outcome.kind === "landed",
      JSON.stringify(outcome)
    );
    const landed = await sh(hubRepo, `git log --format='%h %s' ${base}`);
    check(
      `${tag}: the hub's ${base} holds the delegate's commit`,
      landed.includes(`Delegate commit ${tag}`),
      landed.replaceAll("\n", " | ")
    );
  };

  // ── A: a source with no origin ────────────────────────────────────────
  const src = join(fleet.sandbox, "src");
  await mkdir(src, { recursive: true });
  await sh(src, "git init -q -b trunk");
  await writeFile(join(src, "README.md"), "A project with no remote.\n");
  await sh(src, "git lfs track --filename big.bin >/dev/null");
  await sh(src, `head -c ${BIG} /dev/urandom > big.bin`);
  await sh(src, "git add -A && git commit -qm 'First commit, no remote'");
  const sourceHead = await sh(src, "git rev-parse HEAD");
  const [bigOid] = (await sh(src, "git lfs ls-files -l")).split(" ");
  console.log(
    `source at ${sourceHead.slice(0, 9)}, remotes: [${await sh(src, "git remote")}]`
  );
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "No remote",
    machineId: MACHINE,
    cwd: src,
  });
  await delegateUntilBoundary(src, project.id, "a");
  const hubUrl = `${prefix}${project.id}.git`;
  const bare = join(gitRoot, `${project.id}.git`);
  check(
    "a: source origin is the hub",
    (await sh(src, "git config --get remote.origin.url")) === hubUrl,
    await sh(src, "git config --get remote.origin.url")
  );
  check(
    "a: source HEAD and tree unchanged",
    (await sh(src, "git rev-parse HEAD")) === sourceHead &&
      (await sh(src, "git status --porcelain")) === "",
    `HEAD ${sourceHead.slice(0, 9)}`
  );
  check(
    "a: source config holds no credential",
    !/password|authorization|extraheader/i.test(
      await sh(src, "cat .git/config")
    ),
    (await sh(src, "git config --local --list"))
      .split("\n")
      .filter((line) => REMOTE_KEYS.test(line))
      .join(" | ")
  );
  check(
    "a: the hub has the source's branch as its HEAD",
    (await sh(bare, "git symbolic-ref HEAD")) === "refs/heads/trunk" &&
      (await sh(bare, "git rev-parse trunk")) === sourceHead,
    `${await sh(bare, "git symbolic-ref HEAD")} at ${(await sh(bare, "git rev-parse trunk")).slice(0, 9)}`
  );
  const lfsOnHub = await sh(
    fleet.sandbox,
    `find hub -name ${bigOid} -size +50M`
  );
  check("a: the 60 MB LFS object is on the hub", lfsOnHub.length > 0, lfsOnHub);
  const wsA = await workspace(src, "trunk", "a");
  check(
    "a: clone origin is the hub remote URL",
    (await sh(wsA.path, "git config --get remote.origin.url")) === hubUrl,
    await sh(wsA.path, "git config --get remote.origin.url")
  );
  check(
    "a: clone log holds the source commit",
    (await sh(wsA.path, "git log --format=%H -1")) === sourceHead,
    await sh(wsA.path, "git log --oneline -3")
  );
  const big = await stat(join(wsA.path, "big.bin"));
  check(
    "a: the 60 MB file arrived whole in the clone",
    big.size === BIG,
    `${big.size} bytes`
  );
  // The owner adds a large file of their own and pushes it, plainly, after the
  // workspace was cut: landing then rebases onto it, inside the boundary,
  // where git-lfs reaches no hub, so its object must already be in the clone.
  const ownerPush = await sh(
    src,
    // In a folder with its own .gitattributes: the delegate adds a line to
    // the root one, which would be a real conflict, not a landing's.
    `mkdir assets && head -c ${BIG} /dev/urandom > assets/owner.bin && printf 'owner.bin filter=lfs diff=lfs merge=lfs -text\\n' > assets/.gitattributes && git add assets && git commit -qm 'Owner adds a large file' && git push 2>&1`
  );
  check(
    "a: the owner's plain git push (with a new LFS file) reaches the hub",
    (await sh(bare, "git log --format=%s -1 trunk")) ===
      "Owner adds a large file",
    ownerPush.replaceAll("\n", " | ")
  );
  await sessionAndLand(wsA, "trunk", "a", bare, "new-a.bin");
  const ownerBin = await stat(join(wsA.path, "assets", "owner.bin")).catch(
    () => undefined
  );
  check(
    "a: landing rebased onto the owner's commit, its 60 MB file smudged in the clone",
    ownerBin?.size === BIG,
    `owner.bin is ${ownerBin?.size ?? "missing"} bytes in the clone; ${await sh(wsA.path, "git log --format='%h %s' -3 | tr '\\n' ' '")}`
  );
  const [newOid] = (
    await sh(wsA.path, "git lfs ls-files -l -I new-a.bin")
  ).split(" ");
  const newOnHub = await sh(
    fleet.sandbox,
    `find hub -name ${newOid} -size +50M`
  );
  check(
    "a: the delegate's new 60 MB LFS object reached the hub",
    newOnHub.length > 0,
    `${newOid.slice(0, 12)}: ${newOnHub}`
  );
  const helper = `!${process.execPath} ${join(root, "packages/cli/src/cli.ts")} git-credential`;
  const auth = `-c 'credential.${fleet.base}.helper=' -c 'credential.${fleet.base}.helper=${helper}'`;
  // A fresh checkout of the hub, its helper named in its own config as a
  // hub checkout's is (git-credential.ts `useHubCredentialHelper`).
  await sh(
    fleet.sandbox,
    `GIT_LFS_SKIP_SMUDGE=1 git ${auth} clone -q -b trunk ${hubUrl} fresh-a && cd fresh-a && git config --add 'credential.${fleet.base}.helper' '' && git config --add 'credential.${fleet.base}.helper' '${helper}' && git lfs pull`
  );
  const fresh = await stat(join(fleet.sandbox, "fresh-a", "new-a.bin"));
  check(
    "a: a fresh clone from the hub smudges the new file to its full size",
    fresh.size === BIG,
    `new-a.bin is ${fresh.size} bytes`
  );
  const pulled = await sh(
    src,
    "git pull --ff-only 2>&1 && git log --format='%h %s' -2 && ls"
  );
  check(
    "a: plain git pull in the source brings the landed commit in",
    pulled.includes("Delegate commit a") && pulled.includes("delegate-a.txt"),
    pulled.replaceAll("\n", " | ")
  );
  await closeGitDoor(wsA.id);

  // ── B: a project moved here (move.ts's own snapshot and clone steps) ──
  const projectB = await fleet.api<{ id: string }>("/api/projects", {
    name: "Moved here",
  });
  const before = join(fleet.sandbox, "before-move");
  await mkdir(before, { recursive: true });
  await sh(
    before,
    "git init -q -b main && echo moved > MOVED.md && git add -A && git commit -qm 'Before the move'"
  );
  const jobId = crypto.randomUUID();
  const moveSnapshot = await move.moveSnapshot({
    jobId,
    path: before,
    branch: `cawco/move/${MACHINE}`,
    hub: { projectId: projectB.id },
    remote: "hub",
  });
  const snapshot = moveSnapshot.commit;
  const moved = join(fleet.sandbox, "moved");
  await move.moveClone({
    jobId,
    path: moved,
    display: "moved",
    machine: MACHINE,
    bytes: 0,
    hub: { projectId: projectB.id },
    lfs: false,
    snapshot: moveSnapshot,
  });
  check(
    "b: the moved checkout's branch tracks its remote's",
    (await sh(
      moved,
      "git config --get branch.main.remote; git config --get branch.main.merge"
    )) === "origin\nrefs/heads/main",
    await sh(moved, "git config --get-regexp '^branch\\.'")
  );
  await fleet.api(`/api/projects/${projectB.id}/places`, {
    machineId: MACHINE,
    path: moved,
  });
  const bareB = join(gitRoot, `${projectB.id}.git`);
  console.log(
    `hub B before: ${await sh(bareB, "git for-each-ref --format='%(refname)' refs/heads/")}`
  );
  await delegateUntilBoundary(moved, projectB.id, "b");
  check(
    "b: the hub has main, pushed by the create, as its HEAD",
    (await sh(bareB, "git symbolic-ref HEAD")) === "refs/heads/main" &&
      (await sh(bareB, "git rev-parse main")) === snapshot,
    `${await sh(bareB, "git symbolic-ref HEAD")}; ${await sh(bareB, "git for-each-ref --format='%(refname)' refs/heads/")}`
  );
  const wsB = await workspace(moved, "main", "b");
  await sessionAndLand(wsB, "main", "b", bareB);
  const pulledB = await sh(moved, "git pull --ff-only 2>&1 && ls");
  check(
    "b: plain git pull in the moved checkout brings it in",
    pulledB.includes("delegate-b.txt"),
    pulledB.replaceAll("\n", " | ")
  );
  await closeGitDoor(wsB.id);
} catch (error) {
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  await fleet.close();
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep);
}
