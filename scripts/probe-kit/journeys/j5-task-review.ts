/**
 * J5, task review, with the Apple build gate's protection: a task needing a
 * Mac waits, never fails, while no Mac is free; then it lands, comes to the
 * person for review, and is approved. A second task is sent back with what
 * should change: its attempt's session, warm, idle and on the task, is given
 * those words (Attach or fresh, PRD §5.3), lands a second round, and the
 * task comes back for review.
 *
 * A project whose gate.md declares CawCo's iOS build step (`needs: apple`)
 * and the code stages (`review` is the person's), with Review before done on
 * (a project's choice, off by default): a session there files two
 * tasks with `task_create` and starts each with `task_start` (as
 * task-approval's filer does). One task's attempt commits under apps/apple:
 * with no Mac online, its finish_item is answered with the gate's sentence,
 * the hub has the item wait for a Mac (its wait reason said, the item still
 * running and the task never failed), and the attempt ends its turn. A Mac
 * comes online (a second scratch machine reporting darwin-arm64, a stub
 * build script in the project), the hub wakes the attempt, it finishes
 * again, the gate's check passes on the Mac, and the task reaches review.
 *
 * Attempts are delegates in workspace boundaries: this journey runs only
 * where one can start (the host), never inside a workspace.
 */
import { chmod, mkdir, writeFile } from "node:fs/promises";
import { join } from "node:path";
import {
  MACHINE,
  type Machine,
  type Reply,
  type Seen,
} from "../../scratch-fleet";
import { caw } from "../caw-head";
import { APPLE_GATE, declareGate, MAC_ONLINE, NO_MAC } from "../gate";
import type { KitFleet } from "../kit";
import { callCount, callsInOrder, listedAs, say } from "./mock";
import {
  type Data,
  eventually,
  expect,
  type Journey,
  type Leg,
  shows,
} from "./suite";

const MAC = "journey-mac";
const STAGES =
  "---\nready      todo\nworking    active\nreview     you\ndone       done\ndropped    dropped\nmoves\n  * → *    you, session, action\nviews\n  board      by stage\n---\n";
/** The stub the gate runs on the Mac; the real one needs Xcode. */
const STUB = `#!/usr/bin/env bash
echo "STUB-MAC-BUILD $*"
`;
const FILE_TASK = /JOURNEY-TASK (\S+) (ios|notes)/;
const START_TASK = /JOURNEY-START (tsk-\d+)/;
/** Only an attempt's brief opens this way (work-items.ts). */
const ATTEMPT = /attempt at (tsk-\d+), “([^”]+)”/;
const GATE_CHECK = "iOS build compiles";
/** The review's actions (TaskReview.svelte): Approve → its next stage, Send back → its stage. */
const APPROVE = /^Approve →/;
const SEND_BACK_TO = /^Send back →/;
/** The hub's end of a wait it declared (work-items.ts `endWait`). */
const WAIT_OVER = "Your wait is over";
const IOS = "Ship the iOS widget";
const NOTES = "Write the release notes";

interface Seeded {
  projectId: string;
  repo: string;
}

interface TaskRead {
  attempts: { state: string }[];
  needsYou: boolean;
  result: { headline: string } | null;
  stage: string;
}

let mac: Machine | null = null;

async function seed(fleet: KitFleet, data: Data): Promise<Seeded> {
  const home = fleet.env.HOME as string;
  await writeFile(
    join(home, ".gitconfig"),
    "[user]\n\tname = Owner\n\temail = owner@probe.test\n"
  );
  const repo = join(fleet.sandbox, `${data}-app`);
  const scripts = join(repo, "apps", "apple", "scripts");
  await mkdir(scripts, { recursive: true });
  await writeFile(join(scripts, "build-both.sh"), STUB);
  await chmod(join(scripts, "build-both.sh"), 0o755);
  await Bun.$`git init -q -b main && git add -A && git commit -qm 'First commit'`
    .cwd(repo)
    .env({ ...process.env, HOME: home })
    .quiet();
  const { id } = await fleet.api<{ id: string }>("/api/projects", {
    name: data === "stretched" ? "App — App — App" : "App",
    machineId: MACHINE,
    cwd: repo,
    caw: false,
  });
  const stages = await fetch(`${fleet.base}/api/projects/${id}/folder/file`, {
    method: "PUT",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ path: "stages.md", content: STAGES }),
  });
  if (!stages.ok) {
    throw new Error(
      `the project's stages: ${stages.status} ${await stages.text()}`
    );
  }
  // Review before done, as the person turns it on in the project's details
  // (ProjectDetails.svelte's Review row): off by default, a landed attempt's
  // task goes straight to done (stages.ts `ruledStages`, dispatch.ts
  // `reviewsFirst`).
  const review = await fetch(`${fleet.base}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ review: true }),
  });
  if (!review.ok) {
    throw new Error(
      `the project's review before done: ${review.status} ${await review.text()}`
    );
  }
  await declareGate(fleet.base, id, APPLE_GATE);
  return { projectId: id, repo };
}

/** No Mac online: the one a leg before brought up is taken off. */
async function noMac(fleet: KitFleet): Promise<void> {
  if (!mac) {
    return;
  }
  mac.agent.kill("SIGTERM");
  mac = null;
  await eventually(
    "the Mac offline",
    () =>
      fleet.query<{ status: string }>(
        "SELECT status FROM agents WHERE machine_id = ?",
        MAC
      )[0]?.status,
    (status) => status === "offline",
    60_000
  );
}

/** A Mac online, holding a checkout of the project: a second machine reporting darwin-arm64, as a Mac's agent does. */
async function aMac(fleet: KitFleet, seeded: Seeded): Promise<void> {
  mac = await fleet.launchMachine(MAC);
  fleet.write(
    "UPDATE agents SET os = 'darwin-arm64' WHERE machine_id = ?",
    MAC
  );
  await fetch(`${fleet.base}/api/projects/${seeded.projectId}/places`, {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ machineId: MAC, path: seeded.repo }),
  });
}

const readTask = (fleet: KitFleet, projectId: string, id: string) =>
  fleet.api<TaskRead>(`/api/projects/${projectId}/tasks/${id}`);

/** A session files a task and starts its attempt: its id. */
async function fileAndStart(
  fleet: KitFleet,
  seeded: Seeded,
  token: string,
  kind: "ios" | "notes",
  title: string
): Promise<{ filer: string; id: string }> {
  const filer = await fleet.spawn("claude", `Filer ${token}`, seeded.repo, {
    projectId: seeded.projectId,
  });
  await fleet.send(filer, `JOURNEY-TASK ${token} ${kind} ${title}`);
  const task = await eventually(
    `the ${kind} task filed`,
    async () =>
      (
        await fleet.api<{ tasks: { id: string; title: string }[] }>(
          `/api/projects/${seeded.projectId}/tasks`
        )
      ).tasks.find((one) => one.title === title),
    Boolean,
    120_000
  );
  const { id } = task as { id: string };
  await fleet.send(filer, `JOURNEY-START ${id}`);
  return { filer, id };
}

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const seeded = leg.seeded as Seeded;
  const iosTitle = leg.title(`${IOS} ${leg.id}`);
  const notesTitle = leg.title(`${NOTES} ${leg.id}`);
  await noMac(fleet);
  const ios = await fileAndStart(fleet, seeded, `${leg.id}-i`, "ios", iosTitle);
  const notes = await fileAndStart(
    fleet,
    seeded,
    `${leg.id}-n`,
    "notes",
    notesTitle
  );
  const waiting = () =>
    fleet.query<{ state: string; wait_reason: string | null }>(
      "SELECT state, wait_reason FROM work_items WHERE parent_instance_id = ?",
      ios.filer
    )[0];
  const changes = `Lead with the import screen, ${leg.id}.`;

  await leg.step(
    "Open the project's board",
    () =>
      page.goto(`${base}/project/${seeded.projectId}`, {
        waitUntil: "domcontentloaded",
      }),
    () =>
      shows(
        page.getByText(iosTitle).filter({ visible: true }),
        "the iOS task on the board"
      )
  );

  await leg.step(
    "No Mac is free: the iOS task waits",
    () => Promise.resolve(),
    async () => {
      await eventually(
        "its attempt waits for a Mac, still running",
        waiting,
        (row) => row?.state === "running" && row.wait_reason !== null,
        300_000
      );
      const task = await readTask(fleet, seeded.projectId, ios.id);
      expect(
        "the task waits, never failed",
        task.stage === "working" &&
          task.attempts.every((one) => one.state !== "failed"),
        { stage: task.stage, attempts: task.attempts }
      );
    }
  );

  await leg.step(
    "A Mac comes online",
    () => aMac(fleet, seeded),
    async () => {
      const task = await eventually(
        "the iOS task lands and comes to you for review",
        () => readTask(fleet, seeded.projectId, ios.id),
        (read) => read.stage === "review" && read.needsYou,
        600_000
      );
      const [item] = fleet.query<{ result: string | null }>(
        "SELECT result FROM work_items WHERE parent_instance_id = ?",
        ios.filer
      );
      expect(
        "the gate's build ran on the Mac and passed",
        (item?.result ?? "").includes(`- ${GATE_CHECK}: pass (`),
        (item?.result ?? "").slice(0, 600)
      );
      expect(
        "the task never failed",
        task.attempts.every((one) => one.state !== "failed"),
        task.attempts
      );
    }
  );

  const review = (id: string) =>
    page
      .getByRole("region", { name: `Review ${id}` })
      .filter({ visible: true });
  /** Needs you's row for this leg's task, by its whole title: another leg's task of the same words may wait there too. */
  const needsRow = (title: string) =>
    page
      .getByRole("link", { name: `Open ${title}`, exact: true })
      .filter({ visible: true })
      .first();

  await leg.step(
    "Open what needs you, then the iOS task",
    async () => {
      await caw(page).click();
      await needsRow(iosTitle).click();
    },
    () => shows(review(ios.id), "the iOS task's review")
  );

  await leg.step(
    "Approve",
    () => review(ios.id).getByRole("button", { name: APPROVE }).click(),
    () =>
      eventually(
        "the hub moves the task to done",
        () => readTask(fleet, seeded.projectId, ios.id),
        (read) => read.stage === "done"
      )
  );

  await eventually(
    "the notes task comes to you for review",
    () => readTask(fleet, seeded.projectId, notes.id),
    (read) => read.stage === "review",
    300_000
  );

  await leg.step(
    "Open what needs you, then the notes task",
    async () => {
      await caw(page).click();
      await needsRow(notesTitle).click();
    },
    () => shows(review(notes.id), "the notes task's review")
  );

  const landed = () =>
    fleet.query<{ landed: string | null }>(
      "SELECT landed FROM work_items WHERE project_id = ? AND task_id = ?",
      seeded.projectId,
      notes.id
    )[0]?.landed ?? null;
  const firstLanding = landed();

  await leg.step(
    "Send it back with what should change",
    async () => {
      const pane = review(notes.id);
      await pane.getByRole("button", { name: "Send back" }).click();
      await pane.getByLabel("What should change").fill(changes);
      await pane.getByRole("button", { name: SEND_BACK_TO }).click();
    },
    async () => {
      // Attach or fresh (PRD §5.3, jev-tasks.ts `commented`): its attempt's
      // session is warm, idle and on this task, so it takes your words.
      await eventually(
        "its attempt's session is given your words",
        () =>
          fleet.seen.some(
            (one) =>
              one.tools &&
              ATTEMPT.exec(one.all)?.[1] === notes.id &&
              one.all.includes(`${commentOn(notes.id)}\n\n${changes}`)
          ),
        Boolean,
        120_000
      );
      const task = await eventually(
        "it lands its next round and the task comes back to you for review",
        () => readTask(fleet, seeded.projectId, notes.id),
        (read) =>
          read.stage === "review" &&
          read.needsYou &&
          landed() !== null &&
          landed() !== firstLanding,
        300_000
      );
      expect(
        "the same attempt went on, no second one",
        task.attempts.length === 1,
        task.attempts
      );
    }
  );
}

/** How the hub hands your comment to the task's attempt session (jev-tasks.ts `commented`). */
const commentOn = (task: string) => `A comment on ${task}, your task:`;

/** The calls of `seen` from the last `mark` on: one round of an attempt's conversation. */
const since = (seen: Seen, mark: string): Seen => ({
  ...seen,
  all: seen.all.slice(Math.max(seen.all.lastIndexOf(mark), 0)),
  body: seen.body.slice(Math.max(seen.body.lastIndexOf(mark), 0)),
});

/**
 * What an attempt does: commit its file, finish; refused for want of a Mac,
 * end its turn as the refusal says, and finish again once the hub wakes it.
 * Your comment on its task opens a second round in the same conversation:
 * that round counts only its own calls.
 */
function attempt(whole: Seen, task: string, title: string): Reply {
  const file = title.startsWith(IOS)
    ? `apps/apple/Widget-${task}.swift`
    : `docs/notes-${task}.md`;
  const commented = whole.all.includes(commentOn(task));
  const round = commented ? "2" : "1";
  const seen = commented ? since(whole, commentOn(task)) : whole;
  const committed = `DONE-COMMIT-${task}-${round}`;
  if (!seen.body.includes(committed)) {
    return {
      everyMs: 20,
      words: [],
      tool: {
        name: "Bash",
        input: {
          command: `mkdir -p "$(dirname ${file})" && echo '// round ${round}' >> ${file} && git add ${file} && git -c user.name=Delegate -c user.email=d@probe.test commit -qm 'Work on ${task}' && echo ${committed}`,
          description: "Commit the work",
        },
      },
    };
  }
  const finish = {
    name: "finish_item",
    input: { headline: `Did ${task}.`, summary: `Committed ${file}.` },
  };
  const finishes = callCount(seen, "finish_item");
  const refusals = seen.body.split(NO_MAC).length - 1;
  const wakes =
    seen.all.split(MAC_ONLINE).length -
    1 +
    seen.all.split(WAIT_OVER).length -
    1;
  if (finishes === 0 || (finishes === refusals && wakes >= refusals)) {
    const name = listedAs(seen, "finish_item");
    return name
      ? { everyMs: 20, words: [], tool: { name, input: finish.input } }
      : (callsInOrder(seen, [finish]) ?? say("finish_item is not offered."));
  }
  return finishes === refusals ? say("Waiting for a Mac.") : say("Done.");
}

const journey: Journey = {
  name: "j5-task-review",
  flow: "Task review: a task needing a Mac waits, never fails; approve and send back",
  respond: (seen: Seen) => {
    if (!seen.tools) {
      return say("Task");
    }
    const at = ATTEMPT.exec(seen.all);
    if (at) {
      return attempt(seen, at[1] as string, at[2] as string);
    }
    const filing = FILE_TASK.exec(seen.all);
    if (filing) {
      const title =
        seen.all
          .slice(filing.index + filing[0].length)
          .split("\n")[0]
          ?.trim() ?? "";
      const start = START_TASK.exec(seen.all)?.[1];
      return (
        callsInOrder(seen, [
          { name: "task_create", input: { title, stage: "ready" } },
          ...(start ? [{ name: "task_start", input: { id: start } }] : []),
        ]) ?? say("Filed and started.")
      );
    }
    return say("Ready.");
  },
  clean: noMac,
  seed,
  leg: walk,
};

export default journey;
