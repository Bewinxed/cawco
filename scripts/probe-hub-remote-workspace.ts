/**
 * Probe: a project with no outside remote delegates through the hub's own
 * git remote (Projects spec §5.1), on a scratch fleet (real hub, agent and
 * sessiond on loopback, mock model).
 *
 * A. A source repository made by `git init -b trunk` and one commit (a
 *    README and a 60 MB file tracked by LFS), no origin, in a project. A
 *    Claude session there delegates; the delegate (the mock drives its
 *    tools) runs `git fetch`, commits, pushes a branch of its own and calls
 *    finish_item, and the hub lands its commit. Then:
 *    - the source's origin is the hub's remote, and its HEAD and working
 *      tree are what they were;
 *    - the workspace clone's origin is the hub's remote URL, its log holds the
 *      source's commit, and the 60 MB file is there whole;
 *    - the delegate's own push reached the hub, and its commit landed on the
 *      hub's default branch;
 *    - a plain `git pull` in the source, from a terminal (no session in its
 *      environment), brings the delegate's commit in.
 * B. A checkout in the state a move leaves it (`moveSnapshot` and
 *    `moveClone`): its origin the hub, the hub holding only
 *    `cawco/move/<machine>`, the checkout on `main`. A session there
 *    delegates, and the delegate's commit lands on the hub's `main`.
 *
 * Run: IS_SANDBOX=1 bun scripts/probe-hub-remote-workspace.ts [--keep]
 */
import { mkdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import {
  MACHINE,
  type Reply,
  type Seen,
  scratchFleet,
  until,
} from "./scratch-fleet";

const keep = process.argv.includes("--keep");
const root = resolve(import.meta.dir, "..");
const BIG = 60 * 1024 * 1024;
/** The mark in a delegate's brief that this probe drives its tools. */
const DELEGATE_TAG = /PROBE-DELEGATE-(\w+)/;

/** What the delegate of `tag` runs in its workspace, inside its boundary. */
const delegateCommand = (tag: string) =>
  [
    "set -x",
    "git fetch origin 2>&1 && echo FETCH-OK",
    `echo 'made by the delegate ${tag}' > delegate-${tag}.txt`,
    `git add delegate-${tag}.txt`,
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    `git push origin HEAD:refs/heads/probe-session-${tag} 2>&1 && echo PUSH-OK`,
    "git config --get remote.origin.url",
    `echo DONE-COMMIT-${tag}`,
  ].join("; ");

const results: Record<string, string> = {};
const bashOutputs: Record<string, string> = {};

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = DELEGATE_TAG.exec(request.all)?.[1];
  if (!tag) {
    return text("ok");
  }
  if (request.last.includes(`DONE-COMMIT-${tag}`)) {
    bashOutputs[tag] = request.last;
    return {
      everyMs: 5,
      words: [],
      tool: {
        name: "mcp__cawco__finish_item",
        input: { summary: `Committed delegate-${tag}.txt.` },
      },
    };
  }
  if (request.all.includes(`DONE-COMMIT-${tag}`)) {
    return text("done");
  }
  return {
    everyMs: 5,
    words: [],
    tool: {
      name: "Bash",
      input: { command: delegateCommand(tag), description: "Commit" },
    },
  };
};

const fleet = await scratchFleet({ name: "probe-hub-remote", respond });
const home = fleet.env.HOME as string;
/** A terminal of the machine's owner: its HOME, no session, no CawCo variables. */
const owner: Record<string, string> = {
  PATH: fleet.env.PATH as string,
  HOME: home,
  USER: fleet.env.USER as string,
  XDG_CONFIG_HOME: fleet.env.XDG_CONFIG_HOME as string,
  XDG_DATA_HOME: fleet.env.XDG_DATA_HOME as string,
  XDG_CACHE_HOME: fleet.env.XDG_CACHE_HOME as string,
};
const sh = async (cwd: string, command: string): Promise<string> => {
  const ran = await Bun.$`sh -c ${command}`
    .cwd(cwd)
    .env(owner)
    .quiet()
    .nothrow();
  const out = `${ran.stdout.toString()}${ran.stderr.toString()}`.trim();
  if (ran.exitCode !== 0) {
    throw new Error(`${command} (in ${cwd}) exited ${ran.exitCode}: ${out}`);
  }
  return out;
};
const check = (name: string, ok: boolean, detail: string) => {
  results[name] = `${ok ? "PASS" : "FAIL"} — ${detail}`;
  console.log(`${ok ? "PASS" : "FAIL"} ${name}: ${detail}`);
};

// The machine's git-lfs, as `git lfs install` leaves it in the owner's config.
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

interface WorkItem {
  error: string | null;
  state: string;
  workspace_id: string;
}
const itemOf = (id: string) =>
  fleet.query<WorkItem>("SELECT * FROM work_items WHERE id = ?", id)[0];
const workspaceOf = (id: string) =>
  fleet.query<{ path: string; base: string; repo_root: string }>(
    "SELECT path, base, repo_root FROM workspaces WHERE id = ?",
    id
  )[0];

/** A session of `projectId` at `cwd` delegates `tag`; the item, once it has ended. */
const delegateFrom = async (cwd: string, projectId: string, tag: string) => {
  const parent = await fleet.spawn("claude", `Parent ${tag}`, cwd, {
    projectId,
  });
  const started = await fleet.api<{ workItemId: string; instanceId: string }>(
    "/api/work-items",
    {
      parentInstanceId: parent,
      title: `Commit a file ${tag}`,
      prompt: `PROBE-DELEGATE-${tag}: commit a file.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd,
      checks: [{ name: "Probe check", command: "true" }],
    }
  );
  const item = await until(
    `work item ${tag} ended`,
    () => itemOf(started.workItemId),
    (row) =>
      row !== undefined &&
      !["queued", "running", "checking", "starting", "landing"].includes(
        row.state
      ),
    300_000
  );
  console.log(
    `item ${tag}: ${JSON.stringify({ state: item.state, error: item.error })}`
  );
  console.log(
    `delegate ${tag}'s Bash output:\n${bashOutputs[tag] ?? "(none)"}`
  );
  return item;
};

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
    `source ${src} at ${sourceHead.slice(0, 9)}, big.bin oid ${bigOid.slice(0, 12)}, remotes: [${await sh(src, "git remote")}]`
  );
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "No remote",
    machineId: MACHINE,
    cwd: src,
  });
  const itemA = await delegateFrom(src, project.id, "a");
  const hubUrl = `${fleet.base}/git/${project.id}.git`;
  const origin = await sh(src, "git config --get remote.origin.url");
  check("source origin is the hub", origin === hubUrl, origin);
  check(
    "source HEAD and tree unchanged",
    (await sh(src, "git rev-parse HEAD")) === sourceHead &&
      (await sh(src, "git status --porcelain")) === "",
    `HEAD ${(await sh(src, "git rev-parse HEAD")).slice(0, 9)}, status '${await sh(src, "git status --porcelain")}'`
  );
  check(
    "source config holds no credential",
    !/password|authorization|extraheader/i.test(
      await sh(src, "cat .git/config")
    ),
    (await sh(src, "git config --local --list"))
      .split("\n")
      .filter(
        (line) =>
          line.startsWith("credential") ||
          line.startsWith("remote") ||
          line.startsWith("lfs")
      )
      .join(" | ")
  );
  const ws = workspaceOf(itemA.workspace_id);
  check("workspace created", Boolean(ws), JSON.stringify(ws));
  if (ws) {
    const wsOrigin = await sh(ws.path, "git config --get remote.origin.url");
    check("clone origin is the hub remote URL", wsOrigin === hubUrl, wsOrigin);
    const log = await sh(ws.path, "git log --format='%h %s' --all");
    check(
      "clone log holds the source commit",
      (await sh(ws.path, `git cat-file -t ${sourceHead}`)) === "commit",
      log.replaceAll("\n", " | ")
    );
    const big = await stat(join(ws.path, "big.bin"));
    check(
      "60 MB LFS file arrived in the clone",
      big.size === BIG,
      `big.bin is ${big.size} bytes in ${ws.path}`
    );
    check(
      "workspace base is the source's branch",
      ws.base === "trunk",
      ws.base
    );
  }
  const bare = join(gitRoot, `${project.id}.git`);
  check(
    "hub HEAD names the source's branch",
    (await sh(bare, "git symbolic-ref HEAD")) === "refs/heads/trunk",
    await sh(bare, "git symbolic-ref HEAD")
  );
  check(
    "the delegate's own push reached the hub",
    (await sh(
      bare,
      "git for-each-ref --format='%(refname)' refs/heads/probe-session-a"
    )) === "refs/heads/probe-session-a",
    await sh(
      bare,
      "git for-each-ref --format='%(refname) %(subject)' refs/heads/"
    )
  );
  check(
    "item a done",
    itemA.state === "done",
    `${itemA.state} ${itemA.error ?? ""}`
  );
  const landedA = await sh(bare, "git log --format='%h %s' trunk");
  check(
    "delegate commit landed on the hub's trunk",
    landedA.includes("Delegate commit a"),
    landedA.replaceAll("\n", " | ")
  );
  check(
    "hub holds the 60 MB LFS object",
    (
      await stat(join(fleet.sandbox, "hub")).then(() =>
        sh(fleet.sandbox, `find hub -name ${bigOid} -size +50M`)
      )
    ).length > 0,
    await sh(fleet.sandbox, `find hub -name ${bigOid}`)
  );
  const pulled = await sh(
    src,
    "git pull --ff-only 2>&1; git log --format='%h %s' -3; ls"
  );
  check(
    "plain git pull in the source brings it in",
    pulled.includes("delegate-a.txt") && pulled.includes("Delegate commit a"),
    pulled.replaceAll("\n", " | ")
  );

  // ── B: a checkout in the state a move leaves ──────────────────────────
  const helper = `!${process.execPath} ${join(root, "packages/cli/src/cli.ts")} git-credential`;
  const prefix = `${fleet.base}/git/`;
  const auth = `-c 'credential.${prefix}.helper=' -c 'credential.${prefix}.helper=${helper}'`;
  const projectB = await fleet.api<{ id: string }>("/api/projects", {
    name: "Moved here",
  });
  const hubB = `${prefix}${projectB.id}.git`;
  const before = join(fleet.sandbox, "before-move");
  await mkdir(before, { recursive: true });
  await sh(
    before,
    "git init -q -b main && echo moved > MOVED.md && git add -A && git commit -qm 'Before the move'"
  );
  const snapshot = await sh(before, "git rev-parse HEAD");
  // moveSnapshot's push: the snapshot to cawco/move/<machine>, nothing else.
  await sh(
    before,
    `git ${auth} push -q ${hubB} +${snapshot}:refs/heads/cawco/move/${MACHINE}`
  );
  // moveClone's clone: from the hub, the source's branch at the snapshot, the helper named.
  const moved = join(fleet.sandbox, "moved");
  await sh(fleet.sandbox, `git ${auth} clone -q --no-checkout ${hubB} moved`);
  await sh(moved, `git checkout -q -B main ${snapshot}`);
  await sh(
    moved,
    `git config --local --add 'credential.${prefix}.helper' '' && git config --local --add 'credential.${prefix}.helper' '${helper}'`
  );
  await fleet.api(`/api/projects/${projectB.id}/places`, {
    machineId: MACHINE,
    path: moved,
  });
  const bareB = join(gitRoot, `${projectB.id}.git`);
  console.log(
    `hub B before: ${await sh(bareB, "git for-each-ref --format='%(refname)' refs/heads/")}`
  );
  const itemB = await delegateFrom(moved, projectB.id, "b");
  check(
    "item b done",
    itemB.state === "done",
    `${itemB.state} ${itemB.error ?? ""}`
  );
  const landedB = await sh(bareB, "git log --format='%h %s' main");
  check(
    "moved project's delegate commit landed on the hub's main",
    landedB.includes("Delegate commit b"),
    landedB.replaceAll("\n", " | ")
  );
  const pulledB = await sh(moved, "git pull --ff-only 2>&1; ls");
  check(
    "plain git pull in the moved checkout brings it in",
    pulledB.includes("delegate-b.txt"),
    pulledB.replaceAll("\n", " | ")
  );
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
