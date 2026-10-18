/**
 * A project made from a template can start every task its stages name,
 * however it was made (template-types.ts): applying the template writes each
 * delegate type a stage `runs:` into the project's `delegates/`.
 *
 * A scratch fleet's hub, agent and sessiond. One project per template, made
 * through `POST /api/projects` with no prompt (no Setup thread to write the
 * types), on a git checkout of its own, with a session you started in it.
 * For every stage that runs a type, a task is filed, moved there by you, and
 * started as the dashboard starts one, reporting to that session. Caw is off,
 * so no lead's session (which needs a boundary) stands between the move and
 * the type.
 *
 * (a) Each type a stage runs is in the project's catalog, as its own.
 * (b) Each start resolves its stage's type: the task has an attempt, and
 *     neither the start's answer nor the task names a missing type (on
 *     main: `No delegate type "brand". Available: …`, no attempt).
 * (c) A project whose own stages.md runs a type it lacks (`ghost`): the
 *     refused start shows on the board's card as "Can't start", the hub's
 *     reason as its title (on main the card says nothing).
 *
 * Each start cuts a workspace, so the spec runs on the host (README, "A spec
 * that delegates runs on the host"). Inside a workspace (b) stops at the
 * workspace's boundary, past the type: the start answers 502 "Workspace
 * create … cannot run a delegate on this machine", where main answers 400
 * `No delegate type`.
 *
 *   bun scripts/probe-kit/run.ts template-types
 */
import { mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import { TEMPLATES } from "../../../packages/hub/src/stages";
import { MACHINE, until } from "../../scratch-fleet";
import { type Kit, open, type Spec } from "../kit";

const MISSING_TYPE = /No delegate type/;

/** A project's own stages naming a type it has no file for. */
const GHOST_STAGES = `---
ready      todo
working    active    runs: ghost
done       done
---
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

async function run(kit: Kit): Promise<void> {
  const fleet = await kit.fleet(() => ({ everyMs: 5, words: ["ok"] }));
  try {
    fleet.launch("sessiond");
    await fleet.sessiondUp();
    fleet.launch("hub");
    await fleet.hubUp();
    // A delegate's session runs on a signed-in account.
    fleet.fileAccount();
    fleet.launch("agent");
    await fleet.agentUp();
    await fleet.accountSignedIn();

    await writeFile(
      join(fleet.home, ".gitconfig"),
      "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
    );
    const git = (cwd: string, ...args: string[]) =>
      Bun.$`git ${args}`
        .cwd(cwd)
        .env({ ...process.env, HOME: fleet.home })
        .quiet();

    /** A project made on a fresh checkout, with a session you started in it. */
    const made = async (name: string, template: string) => {
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
        caw: false,
        template,
      });
      const parent = await fleet.spawn("claude", `Parent ${name}`, cwd, {
        projectId: id,
      });
      return { projectId: id, parent };
    };

    /** A task filed, moved to `stage` by you, and started as the dashboard starts one. */
    const startIn = async (
      projectId: string,
      parent: string,
      stage: string,
      title: string
    ) => {
      const task = await fleet.api<{ id: string }>(
        `/api/projects/${projectId}/tasks`,
        { title }
      );
      await fleet.api(`/api/projects/${projectId}/tasks/${task.id}/stage`, {
        stage,
      });
      const started = await fetch(
        `${fleet.base}/api/projects/${projectId}/tasks/${task.id}/attempts`,
        {
          method: "POST",
          headers: { "content-type": "application/json" },
          body: JSON.stringify({ parentInstanceId: parent }),
        }
      );
      const answer = `${started.status} ${await started.text()}`;
      const read = await until(
        `${task.id}'s attempt in ${stage}`,
        () =>
          fleet.api<TaskRead>(`/api/projects/${projectId}/tasks/${task.id}`),
        (each) => each.attempts.length > 0 || each.startProblem !== null,
        60_000
      ).catch(() =>
        fleet.api<TaskRead>(`/api/projects/${projectId}/tasks/${task.id}`)
      );
      return { id: task.id, answer, read };
    };

    for (const template of TEMPLATES) {
      // biome-ignore lint/performance/noAwaitInLoops: one project at a time, each read on its own
      const { projectId, parent } = await made(template, template);
      const { stages } = await fleet.api<{ stages: StageRead[] }>(
        `/api/projects/${projectId}/stages`
      );
      const running = stages.filter(
        (stage) => stage.kind === "active" && stage.hooks.runs
      );
      const { types } = await fleet.api<{
        types: { name: string; source: string }[];
      }>(`/api/projects/${projectId}/delegate-types`);
      const runs = [...new Set(running.map((stage) => stage.hooks.runs))];
      kit.check(
        `a ${template}: every type its stages run is the project's own (${runs.join(", ") || "none run"})`,
        runs.every((name) =>
          types.some((type) => type.name === name && type.source === "project")
        ),
        types.map((type) => `${type.name} ${type.source}`).join(", ")
      );

      for (const stage of running) {
        // biome-ignore lint/performance/noAwaitInLoops: one start at a time, each read before the next
        const { answer, read } = await startIn(
          projectId,
          parent,
          stage.name,
          `Probe ${template} ${stage.name}`
        );
        kit.check(
          `b ${template}: ${stage.name} (runs ${stage.hooks.runs}) starts an attempt, and nothing names a missing type`,
          read.attempts.length > 0 &&
            !MISSING_TYPE.test(answer) &&
            !MISSING_TYPE.test(read.startProblem ?? ""),
          `start ${answer.slice(0, 300)}; attempts ${JSON.stringify(read.attempts)}; startProblem ${read.startProblem}`
        );
      }
    }

    // (c) A stage of the project's own naming a type it lacks: the card says so.
    const ghost = await made("ghost", "code");
    const put = await fetch(
      `${fleet.base}/api/projects/${ghost.projectId}/folder/file`,
      {
        method: "PUT",
        headers: { "content-type": "application/json" },
        body: JSON.stringify({ path: "stages.md", content: GHOST_STAGES }),
      }
    );
    if (!put.ok) {
      throw new Error(`stages.md: ${put.status} ${await put.text()}`);
    }
    const refused = await startIn(
      ghost.projectId,
      ghost.parent,
      "working",
      "Probe ghost working"
    );
    const base = await fleet.dashboard();
    const desk = await kit.page("desk");
    await open(desk, `${base}/project/${ghost.projectId}`, "[data-task]");
    const badge = desk.locator(
      `[data-task='${refused.id}'] [data-start-problem]`
    );
    await badge.waitFor({ timeout: 15_000 }).catch(() => undefined);
    const shown =
      (await badge.count()) === 1
        ? {
            text: await badge.locator("span:not(.sr-only)").first().innerText(),
            title: await badge.getAttribute("title"),
          }
        : null;
    kit.check(
      `c: a stage running a type the project lacks says so on the task's card (Can't start, the hub's reason as its title)`,
      shown?.text === "Can't start" &&
        shown.title === refused.read.startProblem &&
        (shown.title ?? "").startsWith('No delegate type "ghost"'),
      `card ${JSON.stringify(shown)}; startProblem ${refused.read.startProblem}`
    );
  } finally {
    await writeFile(
      join(kit.out, "hub.log"),
      await fleet.logs("hub").catch((error: Error) => error.message)
    );
  }
}

export default { name: "template-types", run } satisfies Spec;
