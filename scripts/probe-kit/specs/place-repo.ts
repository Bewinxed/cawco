/**
 * A project whose place is a plain folder runs its tasks: CawCo makes the
 * place a git repository the first time a workspace is cut from it (agent
 * place-repo.ts, hub place-repo.ts), and every workspace is a clone. On a
 * scratch fleet (real hub, agent and sessiond; Claude Code against the mock
 * model), boundary included: run it where a workspace boundary can start
 * (not inside another one).
 *
 * The folder: a ledger, an assets folder, a mode-0700 folder holding a
 * cookie file, a `.env`, a `.pem`, a mode-0600 file, a 20 MB file, a link
 * to outside the folder, a folder that is a git repository of its own, and
 * a file whose text holds an API key.
 *
 * (a) A project made from it, a task that lands none with an output, and
 *     task_start: it starts; the place is a repository with one commit, by
 *     CawCo, its one remote the hub's own that the workspace cut gives any
 *     repository without one; none of the private, secret, large, linked or
 *     nested paths is tracked, and the place's own `git status` is clean;
 *     the project's thread has the note naming each of them.
 * (b) The attempt's session runs in a clone of the place: its cwd is the
 *     workspace's, and that folder's own git (read from the file system,
 *     never from what the model says) is a work tree whose first commit is
 *     the place's, by CawCo.
 * (c) The attempt ends done and its output is in the project's
 *     `assets/<task>/`.
 * (d) A second task_start: the place still has its one commit, and the
 *     thread one note.
 * (e) A project whose place is already a git repository: its attempt ends
 *     done, its history and files are as they were, and no note is made.
 *
 *   bun scripts/probe-kit/run.ts place-repo
 */
import { chmod, mkdir, readFile, symlink, writeFile } from "node:fs/promises";
import { dirname, join } from "node:path";
import { MACHINE, type Reply, type Seen, until } from "../../scratch-fleet";
import type { Kit, KitFleet, Spec } from "../kit";

const FINISH = "mcp__cawco__finish_item";
/** The mark in a task's title that this spec drives its attempt's tools. */
const TAG = /PROBE-TASK-(\w+)/;
/** Only an attempt's brief opens this way: its parent's report never does. */
const BRIEF = "Your work item is an attempt at";
const NEWLINES = /\n/g;

/** What each attempt's mock has had it do. */
const steps = new Map<string, { finish?: boolean; searched?: boolean }>();

const text = (words: string): Reply => ({ everyMs: 5, words: [words] });
const call = (name: string, input: object): Reply => ({
  everyMs: 5,
  words: [],
  tool: { name, input },
});

const respond = (request: Seen): Reply => {
  if (!request.tools) {
    return text("Probe title");
  }
  const tag = request.all.includes(BRIEF)
    ? TAG.exec(request.all)?.[1]
    : undefined;
  if (!tag) {
    return text("ok");
  }
  const step = steps.get(tag) ?? {};
  steps.set(tag, step);
  if (!request.all.includes(`DONE-${tag}`)) {
    return call("Bash", {
      command: `echo 'a post from ${tag}' > post.md; echo DONE-${tag}`,
      description: "Write the post",
    });
  }
  if (!step.finish && request.toolNames.includes(FINISH)) {
    step.finish = true;
    return call(FINISH, {
      headline: `Wrote post.md for ${tag}.`,
      summary: `Wrote post.md for ${tag}.`,
    });
  }
  if (
    !(step.finish || step.searched) &&
    request.toolNames.includes("ToolSearch")
  ) {
    step.searched = true;
    return call("ToolSearch", { query: `select:${FINISH}`, max_results: 1 });
  }
  return text("done");
};

interface Attempt {
  /** task_start's refusal, when it was refused. */
  refused?: string;
  task: string;
  workItemId: string | null;
  workspaceId: string | null;
}
interface ItemRow {
  error: string | null;
  instance_id: string;
  state: string;
}

/** Paths the folder holds that its first commit must leave out. */
const LEFT_OUT = [
  ".env",
  "server.pem",
  "notes/private.txt",
  "big.bin",
  "out-link",
  "nested/",
  "x-use/",
  "notes/settings.txt",
];

/** What every phase reads the fleet through. */
const probeOf = (fleet: KitFleet) => {
  const owner = { ...process.env, HOME: fleet.env.HOME as string };
  const sh = async (cwd: string, command: string): Promise<string> => {
    const ran = await Bun.$`sh -c ${command}`
      .cwd(cwd)
      .env(owner)
      .quiet()
      .nothrow();
    return `${ran.stdout.toString()}${ran.stderr.toString()}`.trim();
  };
  const item = (id: string): ItemRow | undefined =>
    fleet.query<ItemRow>(
      "SELECT state, error, instance_id FROM work_items WHERE id = ?",
      id
    )[0];
  return {
    fleet,
    sh,
    workspace: (id: string | null) =>
      id
        ? fleet.query<{ path: string; repo_root: string }>(
            "SELECT path, repo_root FROM workspaces WHERE id = ?",
            id
          )[0]
        : undefined,
    notes: (projectId: string) =>
      fleet.query<{ body: string }>(
        "SELECT m.body FROM thread_messages m JOIN project_threads t ON t.id = m.thread_id WHERE t.project_id = ? AND m.note_title LIKE 'Made % a git repository'",
        projectId
      ),
    /** The attempt's item once it has ended; undefined when it never started. */
    ended: (id: string | null, label: string) =>
      id
        ? until(
            label,
            () => item(id),
            (row) =>
              row !== undefined &&
              ["done", "failed", "cancelled"].includes(row.state),
            300_000
          )
        : Promise.resolve(undefined),
    /**
     * A task of `projectId`, started from `from`: the attempt as task_start
     * answers it, or its refusal's words in `refused` (the place is read
     * either way: a cut that fails after the place is made leaves it made).
     */
    startTask: async (
      projectId: string,
      from: string,
      tag: string,
      body: object
    ): Promise<Attempt> => {
      const task = await fleet.api<{ id: string }>(
        `/api/projects/${projectId}/tasks`,
        { title: `PROBE-TASK-${tag} write a post`, ...body }
      );
      return await fleet
        .api<Omit<Attempt, "task" | "refused">>(
          `/api/projects/${projectId}/tasks/${task.id}/attempts`,
          { parentInstanceId: from }
        )
        .then(
          (started) => ({ task: task.id, ...started }),
          (error: Error) => ({
            task: task.id,
            workItemId: null,
            workspaceId: null,
            refused: error.message,
          })
        );
    },
  };
};
type Probe = ReturnType<typeof probeOf>;

/** The folder: what a person's social project keeps, private and secret files among it. */
const makeFolder = async (probe: Probe, place: string): Promise<void> => {
  const outside = join(probe.fleet.sandbox, "outside");
  await Promise.all(
    ["assets", "x-use/profile", "notes", "nested", outside].map((dir) =>
      mkdir(dir.startsWith("/") ? dir : join(place, dir), { recursive: true })
    )
  );
  const files: [string, string | Buffer][] = [
    ["LAUNCH-LEDGER.md", "# Launch ledger\n"],
    ["assets/idea.md", "One board, not a wall of terminals.\n"],
    ["x-use/profile/cookies.json", '{"auth_token":"probe"}\n'],
    ["x-use/state.json", "{}\n"],
    [".env", "X_PASSWORD=probe\n"],
    ["server.pem", "-----BEGIN CERTIFICATE-----\n"],
    ["notes/private.txt", "mine\n"],
    ["notes/public.txt", "ours\n"],
    [
      "notes/settings.txt",
      "model = fast\napi_key = sk-probeprobeprobeprobe1234\n",
    ],
    ["big.bin", Buffer.alloc(20 * 1024 * 1024)],
  ];
  await Promise.all(
    files.map(([path, content]) => writeFile(join(place, path), content))
  );
  await chmod(join(place, "x-use"), 0o700);
  await chmod(join(place, "notes", "private.txt"), 0o600);
  await symlink(outside, join(place, "out-link"));
  await probe.sh(
    join(place, "nested"),
    "git init -q && echo inner > inner.txt"
  );
};

/** (a): the place, a repository of one commit by CawCo, holding only what is safe, and the note. */
const checkMade = async (
  kit: Kit,
  probe: Probe,
  place: string,
  projectId: string
): Promise<void> => {
  const { sh } = probe;
  const commits = await sh(place, "git rev-list --count HEAD");
  const author = await sh(place, "git log -1 --format='%an <%ae>'");
  // The cut gives a repository with no remote the hub's own (Projects spec
  // §5.1), as for any project: the first commit adds none of its own.
  const remotes = await sh(
    place,
    "git remote -v | awk '{print $1, $2}' | sort -u"
  );
  kit.check(
    "a: the place is a repository with one commit by CawCo, its one remote the hub's",
    commits === "1" &&
      author === "CawCo <noreply@cawco.invalid>" &&
      remotes === `origin ${probe.fleet.base}/git/${projectId}.git`,
    `${commits} commit(s), by ${author}, remotes [${remotes}]`
  );
  const tracked = (await sh(place, "git ls-files")).split("\n");
  const leaked = tracked.filter((path) =>
    LEFT_OUT.some((out) =>
      out.endsWith("/") ? path.startsWith(out) : path === out
    )
  );
  kit.check(
    "a: no private, secret, large, linked or nested path is tracked",
    leaked.length === 0 &&
      ["LAUNCH-LEDGER.md", "assets/idea.md", "notes/public.txt"].every((path) =>
        tracked.includes(path)
      ),
    `tracked: ${tracked.join(", ")}`
  );
  const status = await sh(place, "git status --porcelain");
  kit.check(
    "a: the place's own git status is clean: every left-out path is ignored",
    status === "",
    status || "(clean)"
  );
  const [note] = probe.notes(projectId);
  kit.check(
    "a: the thread note names every path left out",
    note !== undefined &&
      LEFT_OUT.every((path) => note.body.includes(`\`${path}\``)),
    note ? note.body.replaceAll(NEWLINES, " ⏎ ").slice(0, 1500) : "(no note)"
  );
};

/** (b) and (c): the attempt ran in a clone of the place, and its output is in assets. */
const checkAttempt = async (
  kit: Kit,
  probe: Probe,
  place: string,
  projectId: string,
  attempt: Attempt
): Promise<string> => {
  const ws = probe.workspace(attempt.workspaceId);
  const ended = await probe.ended(attempt.workItemId, "attempt a ended");
  const [session] = ended
    ? probe.fleet.query<{ cwd: string }>(
        "SELECT cwd FROM instances WHERE id = ?",
        ended.instance_id
      )
    : [];
  const head = await probe.sh(place, "git rev-parse HEAD");
  // The clone's own git, read from the file system: its root commit is the
  // place's one commit, by CawCo.
  // With no workspace, `/`: no repository, so both reads say so.
  const clone = ws?.path ?? "/";
  const inTree = await probe.sh(clone, "git rev-parse --is-inside-work-tree");
  const [root] = (
    await probe.sh(clone, "git log --reverse --format=%H%x09%an")
  ).split("\n");
  kit.check(
    "b: the attempt's session runs in a clone whose first commit is the place's",
    ws !== undefined &&
      session?.cwd === ws.path &&
      ws.repo_root === place &&
      inTree === "true" &&
      root === `${head}\tCawCo`,
    `workspace ${JSON.stringify(ws)}, session cwd ${session?.cwd}; in a work tree: ${inTree}; its first commit ${root?.replace("\t", " by ")}, the place's HEAD ${head}`
  );
  const projects = join(
    dirname(probe.fleet.env.CAWCO_DB_PATH as string),
    "projects"
  );
  const output = await readFile(
    join(projects, projectId, "assets", attempt.task, "post.md"),
    "utf8"
  ).catch(() => "(missing)");
  kit.check(
    "c: a lands-none attempt is done and its output is in assets/<task>/",
    ended?.state === "done" && output.trim() === "a post from a",
    `${ended?.state} ${ended?.error ?? ""}; assets/${attempt.task}/post.md: ${output.trim()}`
  );
  return head;
};

/** (e): a project whose place is a git repository already: run as it always was, nothing made. */
const checkGitPlace = async (kit: Kit, probe: Probe): Promise<void> => {
  const { fleet, sh } = probe;
  const repo = join(fleet.sandbox, "repo-place");
  await mkdir(repo, { recursive: true });
  await sh(
    repo,
    "git init -q -b main && echo code > README.md && git add -A && git commit -qm 'First commit'"
  );
  const before = await sh(repo, "git rev-parse HEAD");
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Code",
    machineId: MACHINE,
    cwd: repo,
  });
  const from = await fleet.spawn("claude", "Parent e", repo, {
    projectId: project.id,
  });
  const attempt = await probe.startTask(project.id, from, "e", {
    lands: "none",
  });
  const ended = await probe.ended(attempt.workItemId, "attempt e ended");
  const ws = probe.workspace(attempt.workspaceId);
  const after = await sh(repo, "git rev-parse HEAD");
  const files = await sh(repo, "ls -A");
  const authors = await sh(repo, "git log --format=%an");
  const notes = probe.notes(project.id).length;
  kit.check(
    "e: a git place's attempt is done in a clone, its history and files as they were, and no note",
    ended?.state === "done" &&
      ws?.repo_root === repo &&
      after === before &&
      authors === "Owner" &&
      files === ".git\nREADME.md" &&
      notes === 0,
    `attempt e ${ended?.state} ${ended?.error ?? ""}; HEAD ${after.slice(0, 9)} (was ${before.slice(0, 9)}); authors ${authors}; files ${files.replaceAll(NEWLINES, " ")}; ${notes} note(s)`
  );
};

const run = async (kit: Kit) => {
  const fleet = await kit.fleet(respond);
  fleet.launch("sessiond");
  await fleet.sessiondUp();
  fleet.launch("hub");
  await fleet.hubUp();
  fleet.fileAccount();
  fleet.launch("agent");
  await fleet.agentUp();
  await fleet.accountSignedIn();
  await writeFile(
    join(fleet.env.HOME as string, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const probe = probeOf(fleet);
  const place = join(fleet.sandbox, "social");
  await makeFolder(probe, place);

  // (a) a project made from the folder, and task_start.
  const project = await fleet.api<{ id: string }>("/api/projects", {
    name: "Social",
    machineId: MACHINE,
    cwd: place,
  });
  const from = await fleet.spawn("claude", "Parent", place, {
    projectId: project.id,
  });
  const first = await probe.startTask(project.id, from, "a", {
    lands: "none",
    outputs: ["post.md"],
  });
  kit.check(
    "a: task_start in a folder project starts an attempt",
    Boolean(first.workItemId && first.workspaceId),
    JSON.stringify(first)
  );
  await checkMade(kit, probe, place, project.id);
  // (b), (c)
  const head = await checkAttempt(kit, probe, place, project.id, first);

  // (d) a second task_start makes nothing again.
  const second = await probe.startTask(project.id, from, "b", {
    lands: "none",
    outputs: ["post.md"],
  });
  const ended = await probe.ended(second.workItemId, "attempt b ended");
  const commits = await probe.sh(place, "git rev-list --count HEAD");
  const now = await probe.sh(place, "git rev-parse HEAD");
  const notes = probe.notes(project.id).length;
  kit.check(
    "d: a second task_start keeps the one commit and makes no second note",
    ended?.state === "done" && commits === "1" && now === head && notes === 1,
    `attempt b ${ended?.state} ${ended?.error ?? ""}; ${commits} commit(s), HEAD ${now.slice(0, 9)}; ${notes} note(s)`
  );

  // (e)
  await checkGitPlace(kit, probe);
};

export default { name: "place-repo", run } satisfies Spec;
