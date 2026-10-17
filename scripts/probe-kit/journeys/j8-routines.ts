/**
 * J8, routines: run now, then pause. A project's routine (made through the
 * hub's API as the person or Caw makes one; a delegate runs it) stands in
 * the project's Routines view. The person runs it now from its row's menu:
 * the hub starts a run, its delegate is given the routine's instruction and
 * reports, and the run ends with a result. Then the person pauses it: the
 * hub holds it off, the row says Paused, and its menu offers Resume.
 *
 * A run's delegate works in a workspace boundary: this journey runs only
 * where one can start (the host), never inside a workspace.
 */
import { join } from "node:path";
import { SESSION_TITLE_MAX } from "../../../packages/hub/src/work-items";
import { MACHINE, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { callsInOrder, say } from "./mock";
import { type Data, eventually, type Journey, type Leg, shows } from "./suite";

const ROUTINE = /JOURNEY-ROUTINE (\S+)/;
const PAUSED = "Paused";

interface Seeded {
  projectId: string;
}

interface RunRow {
  ended_at: number | null;
  id: string;
  outcome: string | null;
  state: string;
}

async function seed(fleet: KitFleet, data: Data): Promise<Seeded> {
  const dir = join(fleet.sandbox, `${data}-ops`);
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir} && git -C ${dir} -c user.name=Owner -c user.email=o@probe.test commit -q --allow-empty -m First`.quiet();
  const { id } = await fleet.api<{ id: string }>("/api/projects", {
    name: data === "stretched" ? "Ops — Ops — Ops" : "Ops",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  return { projectId: id };
}

const runsOf = (fleet: KitFleet, routine: string) =>
  fleet.query<RunRow>(
    "SELECT id, state, outcome, ended_at FROM routine_runs WHERE routine_id = ? ORDER BY started_at, attempt",
    routine
  );

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const { projectId } = leg.seeded as Seeded;
  // A routine's name runs to the hub's limit for a session's name
  // (routines.ts `checked`): the stretched data set stretches it up to the
  // limit, never past. Its instruction has no limit, and stretches whole.
  const name = leg
    .title(`Morning board check ${leg.id}`)
    .slice(0, SESSION_TITLE_MAX)
    .trimEnd();
  const routine = await fleet.api<{ id: string }>("/api/routines", {
    projectId,
    name,
    cron: "0 6 1 1 *",
    timeZone: "UTC",
    target: "delegate",
    prompt: `JOURNEY-ROUTINE ${leg.id} ${leg.title("check the board and report what is stuck.")}`,
  });
  // Made, a routine runs once as its test: that run settles first.
  await eventually(
    "the routine's test run ended",
    () => runsOf(fleet, routine.id),
    (rows) => rows.length > 0 && rows.every((row) => row.state === "ended"),
    300_000
  );
  const before = runsOf(fleet, routine.id).length;
  const menu = page.getByRole("button", { name: `More for ${name}` });

  await leg.step(
    "Open the project's routines",
    () =>
      page.goto(`${base}/project/${projectId}?view=routines`, {
        waitUntil: "domcontentloaded",
      }),
    () =>
      shows(
        page.getByText(name, { exact: true }),
        `the routine's row, “${name}”`
      )
  );

  await leg.step(
    "Run it now",
    async () => {
      await menu.click();
      await page.getByRole("menuitem", { name: "Run now" }).click();
    },
    async () => {
      const runs = await eventually(
        "the hub ran it once more, to its end with a result",
        () => runsOf(fleet, routine.id),
        (rows) =>
          rows.length === before + 1 &&
          rows.at(-1)?.state === "ended" &&
          rows.at(-1)?.outcome !== null,
        300_000
      );
      await eventually(
        "the run's delegate was given the routine's instruction",
        () =>
          fleet.seen.filter(
            (one) => one.tools && one.all.includes(`JOURNEY-ROUTINE ${leg.id}`)
          ).length,
        (count) => count > 0
      );
      await eventually(
        "the run ended delivered",
        () => runs.at(-1)?.outcome,
        (outcome) => outcome !== "failed"
      );
    }
  );

  await leg.step(
    "Pause it",
    async () => {
      await menu.click();
      await page.getByRole("menuitem", { name: "Pause" }).click();
    },
    async () => {
      await eventually(
        "the hub holds it paused",
        () => fleet.api<{ enabled: boolean }>(`/api/routines/${routine.id}`),
        (read) => read.enabled === false
      );
      await shows(
        page
          .getByRole("row")
          .filter({ hasText: name })
          .getByText(PAUSED, { exact: true }),
        "the routine's row saying Paused"
      );
      await menu.click();
      await shows(
        page.getByRole("menuitem", { name: "Resume" }),
        "Resume in its menu"
      );
      await page.keyboard.press("Escape");
    }
  );
}

const journey: Journey = {
  name: "j8-routines",
  flow: "Routines: run now, pause",
  respond: (seen: Seen) => {
    if (!seen.tools) {
      return say("Board check");
    }
    const key = ROUTINE.exec(seen.all)?.[1];
    const next = key
      ? callsInOrder(seen, [
          {
            name: "finish_item",
            input: {
              headline: `Checked the board for ${key}: nothing stuck.`,
              summary: "Every task has moved in the last day.",
            },
          },
        ])
      : null;
    return next ?? say("Reported.");
  },
  seed,
  leg: walk,
};

export default journey;
