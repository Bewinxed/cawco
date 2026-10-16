/**
 * J5, task review, with the Apple build gate's protection: a task needing a
 * Mac waits, never fails, while no Mac is free; then it lands, comes to the
 * person for review, and is approved. A second task is sent back with what
 * should change, and its next attempt is given those words.
 *
 * A project with the Apple gate on and the code stages (`review` is the
 * person's): a session there files two tasks with `task_create` and starts
 * each with `task_start` (as task-approval's filer does). One task's
 * attempt commits under apps/apple: with no Mac online, its finish_item is
 * answered with the gate's sentence and it waits with wait_item, the item
 * still running and the task never failed (apple-gate's (d)). A Mac comes
 * online (a second scratch machine reporting darwin-arm64, a stub build
 * script in the project), the attempt finishes again, the gate's check
 * passes on the Mac, and the task reaches review.
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
import type { KitFleet } from "../kit";
import { caw } from "./j1-check-in";
import { callsInOrder, listedAs, say } from "./mock";
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
/** How the gate answers finish_item with no Mac online (apple-gate.ts). */
const NO_MAC = "lands only once the iOS build compiles on a Mac";
const AGAIN = "Comments since the last attempt";
const GATE_CHECK = "iOS build compiles";
/** The review's actions (TaskReview.svelte): Approve → its next stage, Send back → its stage. */
const APPROVE = /^Approve →/;
const SEND_BACK_TO = /^Send back →/;
const FINISHED = /"name":"mcp__cawco__finish_item"/g;
const WAITED = /"name":"mcp__cawco__wait_item"/g;
const REGEX_SIGNS = /[.*+?^${}()|[\]\\]/g;
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
  const gate = await fetch(`${fleet.base}/api/projects/${id}`, {
    method: "PATCH",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({ appleGate: true }),
  });
  if (!(stages.ok && gate.ok)) {
    throw new Error(
      `the project's stages and gate: ${stages.status} ${await stages.text()}; ${gate.status} ${await gate.text()}`
    );
  }
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

  await leg.step(
    "Open what needs you, then the iOS task",
    async () => {
      await caw(page).click();
      await page
        .getByLabel(new RegExp(`^Open .*${literal(iosTitle.slice(0, 30))}`))
        .filter({ visible: true })
        .first()
        .click();
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
      await page
        .getByLabel(new RegExp(`^Open .*${literal(notesTitle.slice(0, 30))}`))
        .filter({ visible: true })
        .first()
        .click();
    },
    () => shows(review(notes.id), "the notes task's review")
  );

  await leg.step(
    "Send it back with what should change",
    async () => {
      const pane = review(notes.id);
      await pane.getByRole("button", { name: "Send back" }).click();
      await pane.getByLabel("What should change").fill(changes);
      await pane.getByRole("button", { name: SEND_BACK_TO }).click();
    },
    async () => {
      await eventually(
        "a new attempt starts on the task, given your words",
        () =>
          fleet.seen.some(
            (one) =>
              one.tools &&
              ATTEMPT.exec(one.all)?.[1] === notes.id &&
              one.all.includes(AGAIN) &&
              one.all.includes(changes)
          ),
        Boolean,
        300_000
      );
      await eventually(
        "the task has two attempts",
        () => readTask(fleet, seeded.projectId, notes.id),
        (read) => read.attempts.length === 2
      );
    }
  );
}

/** `words` matched as they are, inside a pattern. */
const literal = (words: string) => words.replace(REGEX_SIGNS, "\\$&");

/** What an attempt does: commit its file, finish; refused for want of a Mac, wait for one, then finish again. */
function attempt(seen: Seen, task: string, title: string): Reply {
  const file = title.startsWith(IOS)
    ? `apps/apple/Widget-${task}.swift`
    : `docs/notes-${task}.md`;
  const round = seen.all.includes(AGAIN) ? "2" : "1";
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
  const finishes = (seen.body.match(FINISHED) ?? []).length;
  const waits = (seen.body.match(WAITED) ?? []).length;
  const refused = seen.body.split(NO_MAC).length - 1 > waits;
  if (finishes > 0 && refused) {
    return (
      callsInOrder(seen, [
        {
          name: "wait_item",
          input: { minutes: 3, reason: "waiting for a Mac to come online" },
        },
      ]) ?? say("Waiting for a Mac.")
    );
  }
  if (finishes === 0 || (waits > 0 && finishes === waits)) {
    const name = listedAs(seen, "finish_item");
    return name
      ? { everyMs: 20, words: [], tool: { name, input: finish.input } }
      : (callsInOrder(seen, [finish]) ?? say("finish_item is not offered."));
  }
  return say("Done.");
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
