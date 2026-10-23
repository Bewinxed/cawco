/**
 * J8, routines: make one by hand, run now, then pause. The person makes a
 * routine on the project's Routines view with its form (Create routine,
 * in the Routines block's head): the
 * hub reads its schedule back as it is typed, lists the routine once it is
 * created (a delegate runs it, as one Caw makes), and starts its test run
 * once. The person runs it now from its row's menu:
 * the hub starts a run, its delegate is given the routine's instruction and
 * reports, and the run ends with a result. Then the person pauses it: the
 * hub holds it off, the row says Paused, and its menu offers Resume.
 *
 * A run's delegate works in a workspace boundary: this journey runs only
 * where one can start (the host), never inside a workspace.
 */
import { join } from "node:path";
import { commonWords } from "../../../packages/core/src/words/common";
import { routinesWords } from "../../../packages/core/src/words/routines";
import { SESSION_TITLE_MAX } from "../../../packages/hub/src/work-items";
import { MACHINE, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { callsInOrder, say } from "./mock";
import { type Data, eventually, type Journey, type Leg, shows } from "./suite";

const ROUTINE = /JOURNEY-ROUTINE (\S+)/;
const PAUSED = "Paused";
/** A schedule with no run inside the week: only its test and Run now run it. */
const CRON = "0 6 1 1 *";
/** The read-back's words for a schedule that runs this week: its next run. */
const NEXT_RUN = /· next run /;
/** Any name: the strip is an image named by the schedule's words. */
const NAMED = /\S/;

interface Seeded {
  projectId: string;
}

interface RunRow {
  ended_at: number | null;
  id: string;
  outcome: string | null;
  slot: string;
  state: string;
}

/** A routine as `GET /api/routines` lists it (routines.ts `RoutineView`), what this journey reads. */
interface Listed {
  createdBy: string;
  cron: string;
  delegateType: string | null;
  id: string;
  name: string;
  prompt: string;
  target: string;
  timeZone: string;
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
    "SELECT id, slot, state, outcome, ended_at FROM routine_runs WHERE routine_id = ? ORDER BY started_at, attempt",
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
  const prompt = `JOURNEY-ROUTINE ${leg.id} ${leg.title("check the board and report what is stuck.")}`;
  const zone = "Europe/London";
  const listed = () =>
    fleet
      .api<Listed[]>(`/api/routines?projectId=${encodeURIComponent(projectId)}`)
      .then((rows) => rows.find((row) => row.name === name));
  const form = page.getByRole("form", { name: routinesWords.newRoutine });

  await leg.step(
    "Open the project's routines, then Create routine",
    async () => {
      await page.goto(`${base}/project/${projectId}?view=routines`, {
        waitUntil: "domcontentloaded",
      });
      // Caw is off but answers when written to, so the empty state asks
      // him: Create routine stands in the block's head, on the first leg
      // and on the next alike.
      await page
        .getByRole("button", { name: routinesWords.createRoutine })
        .click();
    },
    () => shows(form.getByLabel("Name"), "the routine form's Name field")
  );

  await leg.step(
    "Fill the form: a name, what each run does, and when: every week on Mondays at 07:30, in London",
    async () => {
      await form.getByLabel("Name").fill(name);
      await form.getByLabel(routinesWords.promptLabel).fill(prompt);
      const exact = { exact: true };
      await form
        .getByLabel("When", exact)
        .selectOption({ label: routinesWords.repeats.week });
      await form.getByLabel("On", exact).selectOption({ label: "Mondays" });
      await form.getByLabel("At", exact).fill("07:30");
      await form.getByLabel(routinesWords.zoneLabel).selectOption(zone);
    },
    // The hub reads the schedule back, by its own parser, right under When,
    // and its week stands on the strip: every day's label inside the strip.
    async () => {
      await shows(
        form.getByText(NEXT_RUN),
        "the hub's read-back of a weekly schedule, with its next run"
      );
      const spilled = await form
        .getByRole("img", { name: NAMED })
        .first()
        .evaluate((strip) => {
          const box = strip.getBoundingClientRect();
          return [...strip.querySelectorAll("[aria-hidden] span")]
            .filter((mark) => mark.textContent?.trim())
            .map((mark) => {
              const at = mark.getBoundingClientRect();
              return {
                text: mark.textContent,
                start: at.left - box.left,
                end: box.right - at.right,
              };
            })
            .filter((mark) => mark.start < -0.5 || mark.end < -0.5);
        });
      if (spilled.length > 0) {
        throw new Error(
          `the schedule strip's labels stand past its edges: ${JSON.stringify(spilled)}`
        );
      }
    }
  );

  await leg.step(
    "Change When to a custom schedule that never runs this week",
    async () => {
      await form
        .getByLabel("When", { exact: true })
        .selectOption({ label: "Custom" });
      await form.getByLabel(routinesWords.customLabel).fill(CRON);
    },
    () =>
      shows(
        form.getByText("· no run in the next week"),
        "the hub's read-back of the custom schedule"
      )
  );

  let id = "";
  await leg.step(
    "Create it",
    () =>
      form.getByRole("button", { name: routinesWords.createRoutine }).click(),
    async () => {
      const made = await eventually(
        "the hub lists the routine, as the form filled it",
        listed,
        (row) => row !== undefined
      );
      if (
        made?.target !== "delegate" ||
        made.createdBy !== "owner" ||
        made.cron !== CRON ||
        made.timeZone !== zone ||
        made.prompt !== prompt ||
        made.delegateType !== null
      ) {
        throw new Error(
          `the hub lists the routine unlike the form: ${JSON.stringify(made)}`
        );
      }
      ({ id } = made);
      // Made, it runs once at once as its test (projects PRD §5.5), and
      // once only: every run row is that one test slot (a failed attempt's
      // retry is the same slot again, routines.ts `fireExtra`).
      const oneTest = (rows: RunRow[]) => {
        const slot = rows[0]?.slot ?? "";
        if (
          !slot.startsWith("test:") ||
          rows.some((row) => row.slot !== slot)
        ) {
          throw new Error(
            `the routine's runs are not its one test run: ${JSON.stringify(rows)}`
          );
        }
        return rows;
      };
      oneTest(
        await eventually(
          "its test run started",
          () => runsOf(fleet, id),
          (rows) => rows.length > 0
        )
      );
      await shows(
        page.getByText(name, { exact: true }),
        `the routine's row, “${name}”`
      );
      oneTest(
        await eventually(
          // Its last attempt: one that failed is tried once more.
          "the routine's test run ended",
          () => runsOf(fleet, id),
          (rows) =>
            rows.at(-1)?.state === "ended" &&
            (rows.at(-1)?.outcome !== "failed" || rows.length > 1),
          300_000
        )
      );
    }
  );
  const before = runsOf(fleet, id).length;
  const menu = page.getByRole("button", { name: commonWords.moreFor(name) });

  await leg.step(
    "Run it now",
    async () => {
      await menu.click();
      await page.getByRole("menuitem", { name: "Run now" }).click();
    },
    async () => {
      const runs = await eventually(
        "the hub ran it once more, to its end with a result",
        () => runsOf(fleet, id),
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
        () => fleet.api<{ enabled: boolean }>(`/api/routines/${id}`),
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
  flow: "Routines: create by hand, run now, pause",
  host: "each run of the routine starts in a workspace of its own",
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
