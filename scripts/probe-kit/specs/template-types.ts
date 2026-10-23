/**
 * Every stage a task enters can start, or its card says why
 * (template-types.ts, dispatch.ts): applying a template writes each delegate
 * type a stage `runs:` into the project's `delegates/`; a project whose
 * stages run such a type it has no file for is given it; a task's own
 * `type:` wins over its stage's `runs:`; and a start that cannot go, its
 * lead's own start among them, is remembered on the task and shown on its
 * card.
 *
 * A scratch fleet's hub, agent and sessiond. Projects are made through
 * `POST /api/projects` with no prompt (no Setup thread to write the types),
 * each on a git checkout of its own. A start is the dashboard's, reporting
 * to a session you started in the project, with Caw off, so no lead's
 * session (which needs a boundary) stands between the move and the type;
 * only (3) turns Caw on.
 *
 * (3) Before any account is signed in: a brand project with Caw on, a task
 *     moved into extract by you. Caw's session cannot start, so the task's
 *     start problem says so ("… did not start: No Claude account is signed
 *     in …") and its card shows Can't start with that reason (on main: only
 *     a log line, nothing on the task).
 * (a) Each type a template supplies (its stages run it, or its skills file
 *     tasks with it: template-types.ts `templateTypes`) is in its project's
 *     catalog, as its own.
 * (b) Each start resolves its stage's type: the task has an attempt, and
 *     neither the start's answer nor the task names a missing type (on
 *     main: `No delegate type "brand". Available: …`, no attempt).
 * (L) A launch project has delegates/designer.md (launch-plan files pieces
 *     with `type: designer`), and its designer piece moved into make starts
 *     designer.
 * (1) A social task with `type: designer` moved into draft, which runs
 *     writer: with no designer file (social supplies none) the start names
 *     `designer` as the missing type; with the project's own
 *     delegates/designer.md, its attempt runs designer.
 * (2) A project whose stages.md runs brand, written while the hub was down,
 *     with no delegates/: after the hub starts it has delegates/brand.md,
 *     and its extract starts. (2L) A launch project whose designer file was
 *     taken away while the hub was down has it again after the hub starts.
 * (2b) A stages.md running seo and writer, written through the folder's
 *     own route while the hub runs: both files follow at once.
 * (c) A project whose own stages.md runs a type no template defines
 *     (`ghost`): the refused start shows on the board's card as Can't start,
 *     the hub's reason as its title (on main the card says nothing).
 *
 * Each start cuts a workspace, so the spec runs on the host (README, "A spec
 * that delegates runs on the host"). Inside a workspace a start that got
 * past its type stops at the workspace's boundary: it answers 502
 * "Workspace create … cannot run a delegate on this machine", and no
 * attempt is filed.
 *
 *   bun scripts/probe-kit/run.ts template-types
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { projectWords } from "../../../packages/core/src/words/project";
import { TEMPLATES, templateText } from "../../../packages/hub/src/stages";
import { templateTypes } from "../../../packages/hub/src/template-types";
import { MACHINE, until } from "../../scratch-fleet";
import { type Kit, type KitFleet, open, type Spec } from "../kit";

const MISSING_TYPE = /No delegate type/;
const NO_DESIGNER = 'No delegate type "designer"';
const NO_GHOST = 'No delegate type "ghost"';
const NO_ACCOUNT = /did not start: No Claude account is signed in/;

/** A project's own stages naming a type no template defines. */
const GHOST_STAGES = `---
ready      todo
working    active    runs: ghost
done       done
---
`;

/** A type of the project's own, as the person writes one. */
const DESIGNER = `---
harness: claude
model: claude-opus-5-5
effort: medium
---
Make the launch piece's images and pages.
`;

interface StageRead {
  hooks: { runs?: string };
  kind: string;
  name: string;
}

interface TaskRead {
  attempts: { state: string }[];
  startProblem: string | null;
}

/** What every leg is given: the fleet and the moves it makes on it. */
interface Leg {
  /** The card a task has on its project's board: its Can't start badge, or null. */
  card: (
    projectId: string,
    taskId: string
  ) => Promise<{ text: string; title: string | null } | null>;
  /** The types a session of the project resolves, and where each comes from. */
  catalog: (projectId: string) => Promise<{ name: string; source: string }[]>;
  /** A task filed, moved to `stage` by you; its id. */
  file: (
    projectId: string,
    stage: string,
    title: string,
    type?: string
  ) => Promise<string>;
  fleet: KitFleet;
  kit: Kit;
  /**
   * A project made on a fresh checkout: with Caw off and a session you
   * started in it (`parent`), with Caw off and no session (`bare`), or with
   * Caw on and no session (`caw`).
   */
  made: (
    name: string,
    template: string,
    how?: "parent" | "bare" | "caw"
  ) => Promise<{ parent: string; projectId: string }>;
  /** Writes a file of the project's folder through its own route. */
  put: (projectId: string, path: string, content: string) => Promise<void>;
  /** Starts an attempt as the dashboard does, reporting to `parent`: the answer, and the task once it has an attempt or a problem. */
  start: (
    projectId: string,
    taskId: string,
    parent: string
  ) => Promise<{ answer: string; read: TaskRead }>;
  /** The task as the hub reads it. */
  task: (projectId: string, taskId: string) => Promise<TaskRead>;
}

/** (3) A hook move whose lead cannot start, with no account signed in. */
async function noAccount(leg: Leg): Promise<void> {
  const { projectId } = await leg.made("no-account", "brand", "caw");
  const id = await leg.file(projectId, "extract", "Probe no account");
  const read = await until(
    `${id}'s start problem`,
    () => leg.task(projectId, id),
    (each) => each.startProblem !== null,
    60_000
  ).catch(() => leg.task(projectId, id));
  const shown = await leg.card(projectId, id);
  leg.kit.check(
    "3: a hook move whose lead cannot start says why on the task and its card (Can't start, the lead's reason)",
    NO_ACCOUNT.test(read.startProblem ?? "") &&
      shown?.text === projectWords.cantStart &&
      shown.title === read.startProblem,
    `startProblem ${read.startProblem}; card ${JSON.stringify(shown)}`
  );
}

/** (a), (b) One project per template, each stage that runs a type started. */
async function everyTemplate(leg: Leg): Promise<void> {
  for (const template of TEMPLATES) {
    // biome-ignore lint/performance/noAwaitInLoops: one project at a time, each read on its own
    const { projectId, parent } = await leg.made(template, template);
    const { stages } = await leg.fleet.api<{ stages: StageRead[] }>(
      `/api/projects/${projectId}/stages`
    );
    const running = stages.filter(
      (stage) => stage.kind === "active" && stage.hooks.runs
    );
    const types = await leg.catalog(projectId);
    const supplied = templateTypes(template);
    leg.kit.check(
      `a ${template}: every type it supplies (its stages run, its skills file) is the project's own (${supplied.join(", ") || "none"})`,
      supplied.every((name) =>
        types.some((type) => type.name === name && type.source === "project")
      ),
      types.map((type) => `${type.name} ${type.source}`).join(", ")
    );
    for (const stage of running) {
      // biome-ignore lint/performance/noAwaitInLoops: one start at a time, each read before the next
      const id = await leg.file(
        projectId,
        stage.name,
        `Probe ${template} ${stage.name}`
      );
      const { answer, read } = await leg.start(projectId, id, parent);
      leg.kit.check(
        `b ${template}: ${stage.name} (runs ${stage.hooks.runs}) starts an attempt, and nothing names a missing type`,
        read.attempts.length > 0 &&
          !MISSING_TYPE.test(answer) &&
          !MISSING_TYPE.test(read.startProblem ?? ""),
        `start ${answer.slice(0, 300)}; attempts ${JSON.stringify(read.attempts)}; startProblem ${read.startProblem}`
      );
    }
  }
}

/** (L) A launch project supplies designer, the type launch-plan files pieces with, and its designer piece in make starts designer. */
async function launchDesigner(leg: Leg): Promise<void> {
  const { projectId, parent } = await leg.made("launch-designer", "launch");
  const types = await leg.catalog(projectId);
  leg.kit.check(
    "L1: a launch project has delegates/designer.md, its own",
    types.some((type) => type.name === "designer" && type.source === "project"),
    types.map((type) => `${type.name} ${type.source}`).join(", ")
  );
  const id = await leg.file(
    projectId,
    "make",
    "Probe launch visual",
    "designer"
  );
  const { answer, read } = await leg.start(projectId, id, parent);
  const [item] = leg.fleet.query<{ type: string | null }>(
    "SELECT type FROM work_items WHERE task_id = ? ORDER BY created_at DESC",
    id
  );
  leg.kit.check(
    "L2: its designer piece moved into make starts an attempt that runs designer",
    read.attempts.length > 0 &&
      item?.type === "designer" &&
      !MISSING_TYPE.test(answer),
    `start ${answer.slice(0, 300)}; work item type ${item?.type}; startProblem ${read.startProblem}`
  );
}

/** (1) A task's own type wins over its stage's runs, in a social project, which supplies no designer. */
async function ownType(leg: Leg): Promise<void> {
  const { projectId, parent } = await leg.made("own-type", "social");
  const id = await leg.file(projectId, "draft", "Probe designer", "designer");
  const before = await leg.start(projectId, id, parent);
  leg.kit.check(
    "1a: a designer task in draft (runs writer), with no designer file, asks for designer, not writer",
    before.answer.includes(NO_DESIGNER) &&
      (before.read.startProblem ?? "").startsWith(NO_DESIGNER),
    `start ${before.answer.slice(0, 300)}; startProblem ${before.read.startProblem}`
  );
  await leg.put(projectId, "delegates/designer.md", DESIGNER);
  const after = await leg.start(projectId, id, parent);
  const [item] = leg.fleet.query<{ type: string | null }>(
    "SELECT type FROM work_items WHERE task_id = ? ORDER BY created_at DESC",
    id
  );
  leg.kit.check(
    "1b: with the project's own delegates/designer.md, its attempt runs designer",
    after.read.attempts.length > 0 && item?.type === "designer",
    `start ${after.answer.slice(0, 300)}; work item type ${item?.type}; attempts ${JSON.stringify(after.read.attempts)}`
  );
}

/** (2) A project from before templates wrote their types, filled as the hub starts. */
async function restarted(leg: Leg): Promise<void> {
  const { fleet } = leg;
  const { projectId } = await leg.made("legacy", "code", "bare");
  // A launch project made before launch supplied designer.
  const launch = await leg.made("legacy-launch", "launch", "bare");
  // The folder is the hub's git repository once something is written to it.
  await leg.put(projectId, "notes.md", "# Legacy\n");
  await fleet.stop("hub");
  const folder = (project: string) =>
    join(fleet.sandbox, "hub", "projects", project);
  const gitIn =
    (cwd: string) =>
    (...args: string[]) =>
      Bun.$`git ${args}`
        .cwd(cwd)
        .env({ ...process.env, HOME: fleet.home })
        .quiet();
  const root = folder(projectId);
  const git = gitIn(root);
  await writeFile(join(root, "stages.md"), templateText("brand"));
  await git("add", "stages.md");
  await git("commit", "-qm", "stages: the brand template, from before");
  const launchGit = gitIn(folder(launch.projectId));
  await launchGit("rm", "-q", "delegates/designer.md");
  await launchGit("commit", "-qm", "delegates: as launch was before designer");
  fleet.launch("hub");
  await fleet.hubUp();
  await fleet.agentUp();
  const launchTypes = await until(
    "legacy-launch's designer type",
    () => leg.catalog(launch.projectId),
    (each) =>
      each.some(
        (type) => type.name === "designer" && type.source === "project"
      ),
    60_000
  ).catch(() => leg.catalog(launch.projectId));
  leg.kit.check(
    "2L: a launch project with no designer file has delegates/designer.md after the hub starts",
    launchTypes.some(
      (type) => type.name === "designer" && type.source === "project"
    ),
    launchTypes.map((type) => `${type.name} ${type.source}`).join(", ")
  );
  const types = await until(
    "legacy's brand type",
    () => leg.catalog(projectId),
    (each) =>
      each.some((type) => type.name === "brand" && type.source === "project"),
    60_000
  ).catch(() => leg.catalog(projectId));
  const log = (await git("log", "-1", "--format=%an: %s")).stdout
    .toString()
    .trim();
  leg.kit.check(
    "2: a project whose stages run brand with no file has delegates/brand.md after the hub starts, in the hub's own commit",
    types.some((type) => type.name === "brand" && type.source === "project") &&
      log.includes("delegates/brand.md"),
    `${types.map((type) => `${type.name} ${type.source}`).join(", ")}; last commit ${log}`
  );
  const parent = await fleet.spawn(
    "claude",
    "Parent legacy",
    join(fleet.sandbox, "types-legacy"),
    {
      projectId,
    }
  );
  const id = await leg.file(projectId, "extract", "Probe legacy extract");
  const { answer, read } = await leg.start(projectId, id, parent);
  leg.kit.check(
    "2: its extract starts an attempt, and nothing names a missing type",
    read.attempts.length > 0 &&
      !MISSING_TYPE.test(answer) &&
      !MISSING_TYPE.test(read.startProblem ?? ""),
    `start ${answer.slice(0, 300)}; attempts ${JSON.stringify(read.attempts)}; startProblem ${read.startProblem}`
  );
}

/** (2b) A stages.md written while the hub runs: its types follow at once. */
async function writtenLater(leg: Leg): Promise<void> {
  const { projectId } = await leg.made("later", "code", "bare");
  await leg.put(projectId, "stages.md", templateText("seo"));
  const own = (each: { name: string; source: string }[]) =>
    ["seo", "writer"].every((name) =>
      each.some((type) => type.name === name && type.source === "project")
    );
  const types = await until(
    "later's seo and writer types",
    () => leg.catalog(projectId),
    own,
    30_000
  ).catch(() => leg.catalog(projectId));
  leg.kit.check(
    "2b: a stages.md running seo and writer, written through the folder's route, brings both files",
    own(types),
    types.map((type) => `${type.name} ${type.source}`).join(", ")
  );
}

/** (c) A stage of the project's own naming a type nothing defines: the card says so. */
async function ghost(leg: Leg): Promise<void> {
  const { projectId, parent } = await leg.made("ghost", "code");
  await leg.put(projectId, "stages.md", GHOST_STAGES);
  const id = await leg.file(projectId, "working", "Probe ghost working");
  const { read } = await leg.start(projectId, id, parent);
  const shown = await leg.card(projectId, id);
  leg.kit.check(
    "c: a stage running a type the project lacks says so on the task's card (Can't start, the hub's reason as its title)",
    shown?.text === projectWords.cantStart &&
      shown.title === read.startProblem &&
      (shown.title ?? "").startsWith(NO_GHOST),
    `card ${JSON.stringify(shown)}; startProblem ${read.startProblem}`
  );
}

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    fleet.launch("agent");
    await fleet.agentUp();

    await writeFile(
      join(fleet.home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const git = (cwd: string, ...args: string[]) =>
      Bun.$`git ${args}`
        .cwd(cwd)
        .env({ ...process.env, HOME: fleet.home })
        .quiet();
    const task = (projectId: string, taskId: string) =>
      fleet.api<TaskRead>(`/api/projects/${projectId}/tasks/${taskId}`);
    let desk: Awaited<ReturnType<Kit["page"]>> | undefined;
    let base: string | undefined;

    const leg: Leg = {
      kit,
      fleet,
      task,
      made: async (name, template, how = "parent") => {
        const cwd = join(fleet.sandbox, `types-${name}`);
        await mkdir(cwd, { recursive: true });
        await writeFile(join(cwd, "README.md"), `# ${name}\n`);
        await git(cwd, "init", "-q", "-b", "main");
        await git(cwd, "add", "-A");
        await git(cwd, "commit", "-qm", "First commit");
        const { id } = await fleet.api<{ id: string }>("/api/projects", {
          name: `Types ${name}`,
          machineId: MACHINE,
          cwd,
          caw: how === "caw",
          template,
        });
        const parent =
          how === "parent"
            ? await fleet.spawn("claude", `Parent ${name}`, cwd, {
                projectId: id,
              })
            : "";
        return { projectId: id, parent };
      },
      put: async (projectId, path, content) => {
        const put = await fetch(
          `${fleet.base}/api/projects/${projectId}/folder/file`,
          {
            method: "PUT",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ path, content }),
          }
        );
        if (!put.ok) {
          throw new Error(`${path}: ${put.status} ${await put.text()}`);
        }
      },
      catalog: async (projectId) =>
        (
          await fleet.api<{ types: { name: string; source: string }[] }>(
            `/api/projects/${projectId}/delegate-types`
          )
        ).types,
      file: async (projectId, stage, title, type) => {
        const filed = await fleet.api<{ id: string }>(
          `/api/projects/${projectId}/tasks`,
          { title, ...(type ? { type } : {}) }
        );
        await fleet.api(`/api/projects/${projectId}/tasks/${filed.id}/stage`, {
          stage,
        });
        return filed.id;
      },
      start: async (projectId, taskId, parent) => {
        const started = await fetch(
          `${fleet.base}/api/projects/${projectId}/tasks/${taskId}/attempts`,
          {
            method: "POST",
            headers: { "content-type": "application/json" },
            body: JSON.stringify({ parentInstanceId: parent }),
          }
        );
        const answer = `${started.status} ${await started.text()}`;
        const read = await until(
          `${taskId}'s attempt`,
          () => task(projectId, taskId),
          (each) => each.attempts.length > 0 || each.startProblem !== null,
          60_000
        ).catch(() => task(projectId, taskId));
        return { answer, read };
      },
      card: async (projectId, taskId) => {
        base ??= await fleet.dashboard();
        desk ??= await kit.page("desk");
        await open(desk, `${base}/project/${projectId}`, "[data-task]");
        const badge = desk.locator(
          `[data-task='${taskId}'] [data-start-problem]`
        );
        await badge.waitFor({ timeout: 15_000 }).catch(() => undefined);
        return (await badge.count()) === 1
          ? {
              text: await badge
                .locator("span:not(.sr-only)")
                .first()
                .innerText(),
              title: await badge.getAttribute("title"),
            }
          : null;
      },
    };

    await noAccount(leg);
    // Every other leg's delegates run on a signed-in account, which the
    // agent reports as it connects.
    await fleet.stop("agent");
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    await everyTemplate(leg);
    await launchDesigner(leg);
    await ownType(leg);
    await restarted(leg);
    await writtenLater(leg);
    await ghost(leg);
  } finally {
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default {
  name: "template-types",
  host: "each start cuts a workspace",
  run,
} satisfies Spec;
