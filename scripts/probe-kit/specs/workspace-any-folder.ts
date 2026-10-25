/**
 * A delegate gets its own private copy of any folder, a repository or not,
 * and its work lands there (agent layer.ts, workspace.ts; hub work-items.ts
 * `landFolder`). On a scratch fleet (real hub, agent and sessiond; Claude
 * Code against the mock model). This spec delegates, so its fleet makes
 * workspaces: it runs on the host, outside every boundary.
 *
 * - a. A folder that is no repository (`site/`): its delegate edits
 *   `site.conf` and runs a check that reads that file at its fixed path
 *   (an `nginx -t`-style `check.sh`), which reads its edit while the folder
 *   on the host still holds the old text; it finishes, the project's
 *   checks (gate.md: the same `check.sh`) pass on its edit, and the edit is
 *   in the folder. Its workspace is a folder's, made at the folder's own
 *   path on Linux.
 * - b. A conflict: a delegate writes `notes.txt` in another folder, the
 *   person writes it meanwhile, and finish_item comes back with both
 *   versions; nothing is written, the item still runs (its delegate holds
 *   its turn after the answer, so no quiet turn ends it meanwhile).
 * - c. A repository whose checkout lags origin's main (a first delegate's
 *   commit landed there): the next delegate starts from origin's main (it
 *   sees that commit's file, which the checkout lacks), lands through the
 *   merge checks, and its commit is on the hub's main; the person's
 *   checkout is untouched: its HEAD, refs, index, config and working tree.
 * - d. The checkout's untracked `.env` is read in the delegate's copy, and
 *   its write there stays in the copy: the checkout's `.env` is as it was.
 * - e. A linked worktree of that repository (`git worktree add`, its `.git`
 *   a file): its delegate's copy has a `.git` folder of its own (agent
 *   workspace.ts `ownRepository`), its commit lands on the hub's main
 *   through the merge checks, and the person's repository (refs, config)
 *   and the worktree (its HEAD, index and working tree) are untouched.
 *
 *   bun scripts/probe-kit/run.ts workspace-any-folder
 */
import { createHash } from "node:crypto";
import { readFileSync, statSync, writeFileSync } from "node:fs";
import { mkdir, readFile, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import { declareGate } from "../gate";
import type { Kit, KitFleet, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
const TAG = /PROBE-FOLDER-(A|B|C1|C2|E)\b/;
/** How finish_item answers a folder landing's conflict (hub work-items.ts `conflictText`). */
const CONFLICT = "Not landed: a file you changed";
type Tag = "A" | "B" | "C1" | "C2" | "E";

/** Where each tag's folder is, filled once the fleet's sandbox is known. */
const folders: Partial<Record<Tag, string>> = {};
/** What the host's folder held at the moment each delegate's command answered. */
const hostAt: Partial<Record<Tag, string>> = {};
const steps: Partial<Record<Tag, { finish?: boolean; searched?: boolean }>> =
  {};

const commandOf = (tag: Tag): string => {
  const at = folders[tag] as string;
  switch (tag) {
    case "A":
      return `sed -i.bak 's/listen 80;/listen 8080;/' ${at}/site.conf && rm ${at}/site.conf.bak && sh ${at}/check.sh && echo DONE-A`;
    case "B":
      return `echo delegate > ${at}/notes.txt && echo DONE-B`;
    case "C1":
      return `cd ${at} && echo one > one.txt && git add one.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate one' && echo DONE-C1`;
    case "C2":
      return `cd ${at} && if test -f one.txt; then echo HAS-ONE; fi && cat .env && echo SECRET=2 > .env && cat .env && echo two > two.txt && git add two.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate two' && echo DONE-C2`;
    case "E":
      return `cd ${at} && if test -d .git; then echo DOTGIT-""DIR; fi && echo three > three.txt && git add three.txt && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Delegate three' && echo DONE-E`;
    default: {
      const unhandled: never = tag;
      return unhandled;
    }
  }
};

/**
 * What the host's folder holds as `tag`'s command answers: a's config, c's
 * `.env`; for b, the person writes the same file the delegate just wrote;
 * e's worktree holds no `.env`, and nothing is noted.
 */
const noteHost = (tag: Tag): void => {
  const at = folders[tag] as string;
  if (tag === "E") {
    hostAt.E = "noted";
    return;
  }
  if (tag === "B") {
    writeFileSync(join(at, "notes.txt"), "person\n");
    hostAt.B = "written";
    return;
  }
  hostAt[tag] = readFileSync(
    join(at, tag === "A" ? "site.conf" : ".env"),
    "utf8"
  );
};

/** Each delegate runs its command, then calls finish_item once; the parents say "ok". */
const respond = (request: Seen): Reply => {
  const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
  const tool = (name: string, input: object): Reply => ({
    everyMs: 5,
    words: [],
    tool: { name, input },
  });
  const tag = request.tools
    ? (TAG.exec(request.all)?.[1] as Tag | undefined)
    : undefined;
  if (!tag) {
    return text("ok");
  }
  steps[tag] ??= {};
  const step = steps[tag];
  if (!request.all.includes(`DONE-${tag}`)) {
    return tool("Bash", { command: commandOf(tag), description: "Work" });
  }
  if (hostAt[tag] === undefined) {
    noteHost(tag);
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return tool(FINISH, {
      headline: `Did ${tag}.`,
      summary: `Did ${tag}.\n\nThe command printed DONE-${tag}.\n\nNot run: none.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return tool("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  // b, its conflict answered: its turn held while the spec reads its item,
  // as boundary-writes holds its own. A "done" would end the turn, and the
  // third quiet turn in a row fails the item (hub work-items.ts
  // `QUIET_TURNS`), within a second of the answer.
  if (tag === "B" && step.finish && request.all.includes(CONFLICT)) {
    return tool("Bash", {
      command: "sleep 600",
      description: "Hold the turn",
      timeout: 600_000,
    });
  }
  return text("done");
};

interface ItemRow {
  error: string | null;
  result: string | null;
  state: string;
  workspace_id: string | null;
}

const run = async (kit: Kit) => {
  const { check } = kit;
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  const linux = process.platform === "linux";

  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const env = { ...process.env, HOME: home };
  const git = (dir: string, ...args: string[]) =>
    Bun.$`git -C ${dir} ${args}`.env(env).quiet().nothrow();

  const itemOf = (id: string) =>
    fleet.query<ItemRow>(
      "SELECT state, error, result, workspace_id FROM work_items WHERE id = ?",
      id
    )[0];
  const workspaceOf = (id: string) =>
    fleet.query<{ kind: string; path: string; repo_root: string }>(
      "SELECT kind, path, repo_root FROM workspaces WHERE id = ?",
      id
    )[0];
  const ended = (tag: Tag, id: string) =>
    until(
      `${tag}'s item ended`,
      () => itemOf(id),
      (row) => ["done", "failed", "cancelled"].includes(row.state),
      600_000
    );
  const delegate = (tag: Tag, cwd: string, from: string) =>
    fleet.api<{ workItemId: string; text: string }>("/api/work-items", {
      parentInstanceId: from,
      title: `Folder ${tag}`,
      prompt: `PROBE-FOLDER-${tag}: run your command, then finish.`,
      harness: "claude",
      model: "claude-haiku-4-5",
      cwd,
    });

  // The parents' project: a repository of its own; its gate is a's check.
  const anchor = join(fleet.sandbox, "anchor");
  await mkdir(anchor, { recursive: true });
  await writeFile(join(anchor, "README.md"), "Anchor.\n");
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(anchor)
    .env(env)
    .quiet();
  const site = join(fleet.sandbox, "site");
  folders.A = site;
  await mkdir(site, { recursive: true });
  await writeFile(join(site, "site.conf"), "listen 80;\n");
  // An `nginx -t`-style check: it reads its config at a fixed path.
  await writeFile(
    join(site, "check.sh"),
    `grep -q 'listen 8080;' ${join(site, "site.conf")} && echo CONF-OK || { echo CONF-BAD; exit 1; }\n`
  );
  const anchorProject = await fleet.api<{ id: string }>("/api/projects", {
    name: "Folders",
    machineId: MACHINE,
    cwd: anchor,
  });
  await declareGate(
    fleet.base,
    anchorProject.id,
    `---\nsh ${join(site, "check.sh")}\n---\n`
  );
  const parent = await fleet.spawn("claude", "Parent folders", anchor, {
    projectId: anchorProject.id,
  });

  // a
  const a = await delegate("A", site, parent);
  const aRow = await ended("A", a.workItemId);
  const aWorkspace = workspaceOf(aRow.workspace_id ?? "");
  const aSaid =
    fleet.seen.find((one) => one.afterTool && one.all.includes("DONE-A"))
      ?.all ?? "";
  check(
    `a: the folder's workspace is a folder's${linux ? ", made at the folder's own path" : ", a clone of its own"}`,
    aWorkspace?.kind === "folder" &&
      aWorkspace.repo_root === site &&
      (linux ? aWorkspace.path === site : aWorkspace.path !== site),
    JSON.stringify(aWorkspace)
  );
  check(
    "a: the check reads the delegate's edit at its fixed path, while the folder on the host still holds the old text",
    aSaid.includes("CONF-OK") && hostAt.A === "listen 80;\n",
    `host then: ${JSON.stringify(hostAt.A)} | ${aSaid.slice(-400)}`
  );
  const aResult = aRow.result ?? "";
  check(
    "a: it lands through the folder's checks, and the edit is in the folder",
    aRow.state === "done" &&
      aResult.includes(`sh ${join(site, "check.sh")}: pass (exit 0`) &&
      aResult.includes(
        `Landed: 1 path of this workspace's changes are in ${site}`
      ) &&
      (await readFile(join(site, "site.conf"), "utf8")) === "listen 8080;\n",
    `${aRow.state} ${aRow.error ?? ""}\n${aResult.slice(0, 1500)}`
  );

  // b
  const notes = join(fleet.sandbox, "notes");
  folders.B = notes;
  await mkdir(notes, { recursive: true });
  await writeFile(join(notes, "README"), "Notes.\n");
  const b = await delegate("B", notes, parent);
  const answer = await until(
    "b's finish_item answered",
    () =>
      fleet.seen.find(
        (one) =>
          one.afterTool &&
          one.all.includes("PROBE-FOLDER-B") &&
          one.all.includes(CONFLICT)
      )?.all,
    Boolean,
    600_000
  ).catch(() => "");
  const conflict = answer.slice(answer.indexOf(CONFLICT));
  check(
    "b: finish_item comes back with the conflict, both versions shown",
    conflict.includes("### notes.txt") &&
      conflict.includes(`In ${notes} now:`) &&
      conflict.includes("person") &&
      conflict.includes("Yours:") &&
      conflict.includes("delegate"),
    conflict.slice(0, 1500) || "no answer read"
  );
  const bRow = itemOf(b.workItemId);
  check(
    "b: nothing was written, and the item still runs",
    (await readFile(join(notes, "notes.txt"), "utf8")) === "person\n" &&
      bRow?.state === "running",
    JSON.stringify(bRow)
  );

  const repoParent = await repoLegs(kit, fleet, { delegate, ended, env, git });
  await worktreeLeg(kit, fleet, { delegate, ended, env, git }, repoParent);
};

/** What the legs share of the spec's reads. */
interface Legs {
  delegate: (
    tag: Tag,
    cwd: string,
    from: string
  ) => Promise<{ workItemId: string; text: string }>;
  ended: (tag: Tag, id: string) => Promise<ItemRow>;
  env: Record<string, string | undefined>;
  git: (dir: string, ...args: string[]) => Promise<{ text: () => string }>;
}

/** c and d: a repository whose checkout lags origin's main. */
const repoLegs = async (
  kit: Kit,
  fleet: KitFleet,
  { delegate, ended, env, git }: Legs
): Promise<{ parent: string; repo: string; project: string }> => {
  const { check } = kit;
  const repo = join(fleet.sandbox, "repo");
  folders.C1 = repo;
  folders.C2 = repo;
  await mkdir(repo, { recursive: true });
  await writeFile(join(repo, "README.md"), "Repo.\n");
  await writeFile(join(repo, ".gitignore"), ".env\n");
  await writeFile(join(repo, ".env"), "SECRET=1\n");
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env(env)
    .quiet();
  const repoProject = await fleet.api<{ id: string }>("/api/projects", {
    name: "Repo",
    machineId: MACHINE,
    cwd: repo,
  });
  const repoParent = await fleet.spawn("claude", "Parent repo", repo, {
    projectId: repoProject.id,
  });
  const bare = join(fleet.sandbox, "hub", "git", `${repoProject.id}.git`);
  // The hub's repository is there once a first push made it.
  const mainLog = async () =>
    (await git(bare, "log", "--format=%s", "main")).text().trim().split("\n");
  /** What finish_item last answered `tag`'s delegate, for a failure's detail. */
  const answered = (tag: Tag): string =>
    fleet.seen
      .filter(
        (one) =>
          one.afterTool &&
          one.all.includes(`PROBE-FOLDER-${tag}`) &&
          one.all.includes("Not ")
      )
      .at(-1)
      ?.all.slice(-1500) ?? "no answer read";
  const c1 = await delegate("C1", repo, repoParent);
  const c1Row = await ended("C1", c1.workItemId);
  check(
    "c: a first delegate's commit lands on the hub's main",
    c1Row.state === "done" && (await mainLog())[0] === "Delegate one",
    `${c1Row.state} ${c1Row.error ?? ""} ${(await mainLog()).join(" | ")}\n${answered("C1")}`
  );
  const stateOf = async () => ({
    head: (await git(repo, "rev-parse", "HEAD")).text().trim(),
    refs: (await git(repo, "for-each-ref")).text().trim(),
    status: (await git(repo, "status", "--porcelain", "--ignored"))
      .text()
      .trim(),
    config: createHash("sha256")
      .update(readFileSync(join(repo, ".git", "config")))
      .digest("hex"),
    index: statSync(join(repo, ".git", "index")).mtimeMs,
    env: readFileSync(join(repo, ".env"), "utf8"),
  });
  const before = await stateOf();
  const c2 = await delegate("C2", repo, repoParent);
  const c2Row = await ended("C2", c2.workItemId);
  const c2Said =
    fleet.seen.find((one) => one.afterTool && one.all.includes("DONE-C2"))
      ?.all ?? "";
  check(
    "c: the next delegate starts from origin's main, which holds the first one's file the checkout lacks",
    c2Said.includes("HAS-ONE") &&
      !(await Bun.file(join(repo, "one.txt")).exists()),
    c2Said.slice(-600)
  );
  check(
    "c: it lands through the merge checks, its commit on the hub's main",
    c2Row.state === "done" &&
      (await mainLog()).slice(0, 2).join(" | ") ===
        "Delegate two | Delegate one",
    `${c2Row.state} ${c2Row.error ?? ""}\n${(c2Row.result ?? "").slice(0, 1200)}\n${answered("C2")}`
  );
  const after = await stateOf();
  check(
    "c: the person's checkout is untouched: its HEAD, refs, index, config and working tree",
    JSON.stringify(before) === JSON.stringify(after) &&
      !(await Bun.file(join(repo, "two.txt")).exists()),
    `${JSON.stringify(before)}\n${JSON.stringify(after)}`
  );
  check(
    "d: the checkout's untracked .env is read in the copy, and its write stays in the copy",
    c2Said.includes("SECRET=1\nSECRET=2") && after.env === "SECRET=1\n",
    `${c2Said.slice(-300)} | checkout: ${after.env}`
  );
  return { parent: repoParent, repo, project: repoProject.id };
};

/** e: a linked worktree of the repository: its own repository in the copy, landed, nothing of the person's written. */
const worktreeLeg = async (
  kit: Kit,
  fleet: KitFleet,
  { delegate, ended, git }: Legs,
  from: { parent: string; repo: string; project: string }
): Promise<void> => {
  const { check } = kit;
  const wt = join(fleet.sandbox, "repo-wt");
  folders.E = wt;
  await git(from.repo, "worktree", "add", "-q", "-b", "feature-wt", wt);
  const common = join(from.repo, ".git");
  const wtGit = (
    await git(wt, "rev-parse", "--path-format=absolute", "--absolute-git-dir")
  )
    .text()
    .trim();
  const stateOf = async () => ({
    refs: (await git(from.repo, "for-each-ref")).text().trim(),
    config: createHash("sha256")
      .update(readFileSync(join(common, "config")))
      .digest("hex"),
    head: (await git(wt, "rev-parse", "HEAD")).text().trim(),
    branch: (await git(wt, "symbolic-ref", "HEAD")).text().trim(),
    index: statSync(join(wtGit, "index")).mtimeMs,
    status: (await git(wt, "status", "--porcelain")).text().trim(),
  });
  const before = await stateOf();
  const e = await delegate("E", wt, from.parent);
  const row = await ended("E", e.workItemId);
  const [workspace] = fleet.query<{ kind: string; repo_root: string }>(
    "SELECT kind, repo_root FROM workspaces WHERE id = (SELECT workspace_id FROM work_items WHERE id = ?)",
    e.workItemId
  );
  const said =
    fleet.seen.find((one) => one.afterTool && one.all.includes("DONE-E"))
      ?.all ?? "";
  const bare = join(fleet.sandbox, "hub", "git", `${from.project}.git`);
  const main = (await git(bare, "log", "--format=%s", "main"))
    .text()
    .trim()
    .split("\n");
  check(
    "e: a linked worktree's delegate works in a repository of its own in its copy, and its commit lands on the hub's main",
    workspace?.kind === "repo" &&
      workspace.repo_root === wt &&
      said.includes("DOTGIT-DIR") &&
      row.state === "done" &&
      main[0] === "Delegate three",
    `${JSON.stringify(workspace)}; ${row.state} ${row.error ?? ""}; main ${main.slice(0, 3).join(" | ")}; ${said.slice(-300)}\n${(row.result ?? "").slice(0, 800)}`
  );
  const after = await stateOf();
  check(
    "e: the person's repository and worktree are untouched: refs, config, the worktree's HEAD, branch, index and working tree",
    JSON.stringify(before) === JSON.stringify(after) &&
      !(await Bun.file(join(wt, "three.txt")).exists()),
    `${JSON.stringify(before)}\n${JSON.stringify(after)}`
  );
};

export default {
  name: "workspace-any-folder",
  host: "it delegates, so its fleet makes workspaces",
  run,
} satisfies Spec;
