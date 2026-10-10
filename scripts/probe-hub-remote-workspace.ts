/**
 * Probe: a project with no outside remote delegates through the hub's own
 * git remote (Projects spec §5.1), on a scratch fleet (real hub, agent and
 * sessiond on loopback, mock model), boundary included: run it where a
 * workspace boundary can start (not inside another one).
 *
 * A. A source repository made by `git init -b trunk` and one commit (a
 *    README and a 60 MB file tracked by LFS), no origin, in a project. A
 *    Claude session there delegates; the delegate (the mock drives its
 *    tools) runs `git fetch`, commits a file and a new 60 MB LFS file,
 *    pushes a branch of its own and calls finish_item, and the hub lands its
 *    commit. Then:
 *    - the source's origin is the hub's remote, its HEAD and working tree
 *      what they were, and its config holds no credential;
 *    - the workspace clone's origin is the hub's remote URL, its log holds
 *      the source's commit, and the 60 MB file is there whole;
 *    - the door listens under the agent's runtime dir;
 *    - the delegate's own push reached the hub, its commit landed on the
 *      hub's default branch, and its new LFS object is on the hub: a fresh
 *      clone from the hub smudges it whole;
 *    - a plain `git pull` in the source, from a terminal (no session in its
 *      environment), brings the delegate's commit in.
 * B. A project moved here by move.ts's own snapshot and clone steps (the hub
 *    holding only `cawco/move/<machine>`): its branch tracks the hub's, a
 *    session there delegates, the commit lands on the hub's `main`, and a
 *    plain `git pull` there brings it in.
 *
 * Each delegate request the mock answers is traced as it comes. A failure
 * (a check or a wait) prints the work items, the delegate sessions, the tail
 * of the agent's, hub's and sessiond's logs and of the delegate's transcript,
 * and keeps the sandbox.
 *
 * Run: IS_SANDBOX=1 bun scripts/probe-hub-remote-workspace.ts [--keep]
 */
import { mkdir, readdir, stat, writeFile } from "node:fs/promises";
import { join, resolve } from "node:path";
import { CAWCO_ENV } from "../packages/core/src/index";
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
const FINISH = "mcp__cawco__finish_item";
const NEWLINES = /\n/g;
/** The line the delegate's Bash prints with its git door's path. */
const DOOR_LINE = /door: (\S+)/;

/** What the delegate of `tag` runs in its workspace, inside its boundary. */
const delegateCommand = (tag: string, large: boolean) =>
  [
    "set -x",
    "git fetch origin 2>&1 && echo FETCH-OK",
    `echo 'made by the delegate ${tag}' > delegate-${tag}.txt`,
    `git add delegate-${tag}.txt`,
    ...(large
      ? [
          `head -c ${BIG} /dev/urandom > new-${tag}.bin`,
          `git lfs track --filename new-${tag}.bin`,
          `git add .gitattributes new-${tag}.bin`,
        ]
      : []),
    `git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate commit ${tag}'`,
    `git push origin HEAD:refs/heads/probe-session-${tag} 2>&1 && echo PUSH-OK`,
    "git config --get remote.origin.url",
    'echo "door: $CAWCO_GIT_SOCKET"',
    `echo DONE-COMMIT-${tag}`,
  ].join("; ");

const results: Record<string, string> = {};
const trace: string[] = [];
const bashOutputs: Record<string, string | undefined> = {};
/** Per delegate tag: what the mock has had it do. */
const steps: Record<string, { finish?: boolean; searched?: boolean }> = {};

const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = DELEGATE_TAG.exec(request.all)?.[1];
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  const offered = request.toolNames.includes(FINISH);
  const answer = (reply: Reply, what: string): Reply => {
    trace.push(
      `${new Date(request.at).toISOString()} delegate ${tag}: ${request.toolNames.length} tools (finish_item ${offered ? "offered" : "not offered"}) → ${what}; last: ${request.last.slice(-400).replace(NEWLINES, " ⏎ ")}`
    );
    console.log(trace.at(-1));
    return reply;
  };
  if (!request.all.includes(`DONE-COMMIT-${tag}`)) {
    return answer(
      {
        everyMs: 5,
        words: [],
        tool: {
          name: "Bash",
          input: {
            command: delegateCommand(tag, tag === "a"),
            description: "Commit",
          },
        },
      },
      "Bash"
    );
  }
  if (request.last.includes(`DONE-COMMIT-${tag}`)) {
    bashOutputs[tag] = request.last;
  }
  if (!step.finish && offered) {
    step.finish = true;
    return answer(
      {
        everyMs: 5,
        words: [],
        tool: {
          name: FINISH,
          input: { summary: `Committed delegate-${tag}.txt.` },
        },
      },
      "finish_item"
    );
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return answer(
      {
        everyMs: 5,
        words: [],
        tool: {
          name: "ToolSearch",
          input: { query: `select:${FINISH}`, max_results: 1 },
        },
      },
      "ToolSearch for finish_item"
    );
  }
  return answer(text("done"), "text");
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
let failed = false;
const check = (name: string, ok: boolean, detail: string) => {
  failed ||= !ok;
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
  id: string;
  instance_id: string;
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

/** The last `lines` lines of `file`, or why there are none. */
const tail = async (file: string, lines: number): Promise<string> =>
  (await Bun.file(file).exists())
    ? (await Bun.file(file).text())
        .trimEnd()
        .split("\n")
        .slice(-lines)
        .join("\n")
    : "(no file)";

/** Every `*.jsonl` under `dir`, newest first. */
const transcripts = async (dir: string): Promise<string[]> => {
  const found: { path: string; at: number }[] = [];
  const walk = async (at: string): Promise<void> => {
    for (const entry of await readdir(at, { withFileTypes: true }).catch(
      () => []
    )) {
      const path = join(at, entry.name);
      if (entry.isDirectory()) {
        // biome-ignore lint/performance/noAwaitInLoops: a small tree, walked once on failure
        await walk(path);
      } else if (entry.name.endsWith(".jsonl")) {
        found.push({ path, at: (await stat(path)).mtimeMs });
      }
    }
  };
  await walk(dir);
  return found.sort((a, b) => b.at - a.at).map((one) => one.path);
};

/** What a failure leaves to read: items, sessions, logs, the delegate's transcript, the mock's trace. */
const diagnose = async (why: string): Promise<void> => {
  failed = true;
  console.log(`\n══ diagnosis: ${why}`);
  console.log(
    `work items: ${JSON.stringify(fleet.query("SELECT * FROM work_items"), null, 1).slice(0, 6000)}`
  );
  console.log(
    `workspaces: ${JSON.stringify(fleet.query("SELECT id, path, base, state FROM workspaces"), null, 1)}`
  );
  console.log(
    `sessions: ${JSON.stringify(fleet.query("SELECT id, title, status, last_error, cwd FROM instances"), null, 1)}`
  );
  const logs = (await readdir(fleet.sandbox))
    .filter((name) => name.endsWith(".log") || name.endsWith(".err"))
    .sort();
  for (const name of logs) {
    // biome-ignore lint/performance/noAwaitInLoops: printed in order
    console.log(`── ${name}\n${await tail(join(fleet.sandbox, name), 40)}`);
  }
  const [newest] = await transcripts(home);
  console.log(
    `── newest transcript ${newest ?? "(none)"}\n${
      newest
        ? (await tail(newest, 8))
            .split("\n")
            .map((line) => line.slice(0, 600))
            .join("\n")
        : ""
    }`
  );
  console.log(`── mock trace\n${trace.join("\n") || "(no delegate request)"}`);
};

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
  console.log(
    `delegate ${tag}: item ${started.workItemId}, session ${started.instanceId}`
  );
  const item = await until(
    `work item ${tag} ended`,
    () => itemOf(started.workItemId),
    (row) =>
      row !== undefined && ["done", "failed", "cancelled"].includes(row.state),
    300_000
  ).catch(async (error: Error) => {
    await diagnose(error.message);
    throw error;
  });
  console.log(
    `item ${tag}: ${JSON.stringify({ state: item.state, error: item.error })}`
  );
  console.log(
    `delegate ${tag}'s Bash output:\n${bashOutputs[tag] ?? "(none)"}`
  );
  if (item.state !== "done") {
    await diagnose(`work item ${tag} ended ${item.state}`);
  }
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
  const prefix = `${fleet.base}/git/`;
  const helper = `!${process.execPath} ${join(root, "packages/cli/src/cli.ts")} git-credential`;
  const auth = `-c 'credential.${fleet.base}.helper=' -c 'credential.${fleet.base}.helper=${helper}'`;

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
  const hubUrl = `${prefix}${project.id}.git`;
  const origin = await sh(src, "git config --get remote.origin.url");
  check("a: source origin is the hub", origin === hubUrl, origin);
  check(
    "a: source HEAD and tree unchanged",
    (await sh(src, "git rev-parse HEAD")) === sourceHead &&
      (await sh(src, "git status --porcelain")) === "",
    `HEAD ${(await sh(src, "git rev-parse HEAD")).slice(0, 9)}, status '${await sh(src, "git status --porcelain")}'`
  );
  check(
    "a: source config holds no credential",
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
  check("a: workspace created", Boolean(ws), JSON.stringify(ws));
  if (ws) {
    const wsOrigin = await sh(ws.path, "git config --get remote.origin.url");
    check(
      "a: clone origin is the hub remote URL",
      wsOrigin === hubUrl,
      wsOrigin
    );
    check(
      "a: clone log holds the source commit",
      (await sh(ws.path, `git cat-file -t ${sourceHead}`)) === "commit",
      (await sh(ws.path, "git log --format='%h %s' -3")).replaceAll("\n", " | ")
    );
    const big = await stat(join(ws.path, "big.bin"));
    check(
      "a: 60 MB LFS file arrived in the clone",
      big.size === BIG,
      `big.bin is ${big.size} bytes in ${ws.path}`
    );
    check(
      "a: workspace base is the source's branch",
      ws.base === "trunk",
      ws.base
    );
  }
  const door = DOOR_LINE.exec(bashOutputs.a ?? "")?.[1] ?? "";
  check(
    "a: the git door is under the agent's runtime dir, within 107 bytes",
    door.startsWith(fleet.env.XDG_RUNTIME_DIR as string) &&
      Buffer.byteLength(door) <= 107,
    `${door} (${Buffer.byteLength(door)} bytes)`
  );
  const bare = join(gitRoot, `${project.id}.git`);
  check(
    "a: hub HEAD names the source's branch",
    (await sh(bare, "git symbolic-ref HEAD")) === "refs/heads/trunk",
    await sh(bare, "git symbolic-ref HEAD")
  );
  check(
    "a: the delegate's own push reached the hub",
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
    "a: item done",
    itemA.state === "done",
    `${itemA.state} ${itemA.error ?? ""}`
  );
  const landedA = await sh(bare, "git log --format='%h %s' trunk");
  check(
    "a: delegate commit landed on the hub's trunk",
    landedA.includes("Delegate commit a"),
    landedA.replaceAll("\n", " | ")
  );
  check(
    "a: hub holds the source's 60 MB LFS object",
    (await sh(fleet.sandbox, `find hub -name ${bigOid} -size +50M`)).length > 0,
    await sh(fleet.sandbox, `find hub -name ${bigOid}`)
  );
  // A fresh checkout of the hub, its helper named in its own config as a
  // hub checkout's is (git-credential.ts `useHubCredentialHelper`).
  await sh(
    fleet.sandbox,
    `GIT_LFS_SKIP_SMUDGE=1 git ${auth} clone -q -b trunk ${hubUrl} fresh-a && cd fresh-a && git config --add 'credential.${fleet.base}.helper' '' && git config --add 'credential.${fleet.base}.helper' '${helper}' && git lfs pull`
  );
  const fresh = await stat(join(fleet.sandbox, "fresh-a", "new-a.bin")).catch(
    () => undefined
  );
  check(
    "a: the delegate's new 60 MB LFS file smudges whole in a fresh clone from the hub",
    fresh?.size === BIG,
    `new-a.bin is ${fresh?.size ?? "missing"} bytes`
  );
  const pulled = await sh(
    src,
    "git pull --ff-only 2>&1; git log --format='%h %s' -3; ls"
  );
  check(
    "a: plain git pull in the source brings it in",
    pulled.includes("delegate-a.txt") && pulled.includes("Delegate commit a"),
    pulled.replaceAll("\n", " | ")
  );

  // ── B: a project moved here (move.ts's own snapshot and clone steps) ──
  // This process as the agent's machine for those steps: its hub, and its
  // credential from the agent's socket, as `cawco git-credential` takes it.
  process.env[CAWCO_ENV.hubUrl] = fleet.env.CAWCO_HUB_URL as string;
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
  const move = await import("../packages/agent/src/move");
  move.setHubCredential(login.username, login.password);
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
  const snapshot = await move.moveSnapshot({
    jobId,
    path: before,
    branch: `cawco/move/${MACHINE}`,
    hub: { projectId: projectB.id },
    remote: "hub",
  });
  const moved = join(fleet.sandbox, "moved");
  await move.moveClone({
    jobId,
    path: moved,
    display: "moved",
    machine: MACHINE,
    bytes: 0,
    hub: { projectId: projectB.id },
    lfs: false,
    snapshot,
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
  const itemB = await delegateFrom(moved, projectB.id, "b");
  check(
    "b: item done",
    itemB.state === "done",
    `${itemB.state} ${itemB.error ?? ""}`
  );
  const landedB = await sh(bareB, "git log --format='%h %s' main");
  check(
    "b: moved project's delegate commit landed on the hub's main",
    landedB.includes("Delegate commit b"),
    landedB.replaceAll("\n", " | ")
  );
  const pulledB = await sh(moved, "git pull --ff-only 2>&1; ls");
  check(
    "b: plain git pull in the moved checkout brings it in",
    pulledB.includes("delegate-b.txt"),
    pulledB.replaceAll("\n", " | ")
  );
} catch (error) {
  failed = true;
  console.error(
    `probe failed: ${error instanceof Error ? error.stack : String(error)}`
  );
  results.error = String(error);
} finally {
  if (failed && !trace.length) {
    await diagnose("failed before any delegate request").catch(() => undefined);
  }
  await fleet.close();
  console.log(JSON.stringify(results, null, 2));
  await fleet.clean(keep || failed);
}
