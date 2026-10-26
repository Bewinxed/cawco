/**
 * J6, decisions: pick and send in place. A session wrote a decision page
 * for its project (as artifact_create publishes one); the person opens the
 * project's Decisions, opens the page in place, picks an option on each
 * card, and presses I'm done picking.
 *
 * The outcome: the hub holds the page sent, the session that wrote it is
 * sent the picks (its model is asked with the options chosen), and the page
 * stays where it is, now offering its next step (Make tasks).
 */
import { join } from "node:path";
import type { FrameLocator, Locator } from "playwright-core";
import { decisionsWords } from "../../../packages/core/src/words/decisions";
import { pageProgram, type SeedPage } from "../../decisions-preview/seed";
import { MACHINE, type Seen } from "../../scratch-fleet";
import { type KitFleet, pressIn } from "../kit";
import { say } from "./mock";
import {
  type Data,
  eventually,
  expect,
  gone,
  type Journey,
  type Leg,
  shows,
} from "./suite";

const SHAPE = "What shape is the plan?";
const TRIAL = "How long is the trial?";
const PER_MACHINE = "One per host";
const A_MONTH = "A month";
const PICKS = /picked/u;
const CAW_SHEET = /^Caw, lead of /u;

interface Seeded {
  projectId: string;
}

/** The decision page: two cards, two options each. */
const decisionPage = (name: string, title: string): SeedPage => ({
  name,
  title,
  writer: "Price the plan",
  ask: "Pick how the hosted plan is priced",
  cards: [
    {
      id: "shape",
      question: SHAPE,
      why: "What a customer pays for decides the page's first line.",
      options: [
        { id: "seat", label: "Per seat", line: "Each person on the team." },
        {
          id: "machine",
          label: PER_MACHINE,
          line: "Each machine that joins the fleet.",
          recommended: true,
        },
      ],
    },
    {
      id: "trial",
      question: TRIAL,
      why: "The trial's length is in the page's call to action.",
      options: [
        { id: "week", label: "A week", line: "Seven days, then pay." },
        {
          id: "month",
          label: A_MONTH,
          line: "Thirty days, then pay.",
          recommended: true,
        },
      ],
    },
  ],
});

/** The project a data set's pages are written for. */
async function seed(fleet: KitFleet, data: Data): Promise<Seeded> {
  const dir = join(fleet.sandbox, `${data}-pricing`);
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir}`.quiet();
  const { id } = await fleet.api<{ id: string }>("/api/projects", {
    name: data === "stretched" ? "Pricing — Pricing — Pricing" : "Pricing",
    machineId: MACHINE,
    cwd: dir,
    caw: false,
  });
  return { projectId: id };
}

/**
 * An option scrolled to the middle of its page's frame, then pressed once
 * nothing on the dashboard stands over it (kit pressIn).
 */
async function pick(frame: FrameLocator, option: Locator): Promise<void> {
  await option.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await pressIn(frame, option);
}

interface DecisionRead {
  picked: number;
  sentAt: string | null;
  state: string;
}

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const { projectId } = leg.seeded as Seeded;
  const name = `plan-${leg.id}`;
  const title = leg.title(`Price the hosted plan, ${leg.id}`);
  const writer = await fleet.spawn("claude", `Writer ${leg.id}`, undefined, {
    projectId,
  });
  await fleet.api(`/api/instances/${writer}/artifacts`, {
    kind: "page",
    does: "pick",
    ask: "Pick one option on each card",
    name,
    program: pageProgram(decisionPage(name, title)),
  });
  const decision = () =>
    fleet.api<DecisionRead>(`/api/projects/${projectId}/decisions/${name}`);
  const frame = page.getByTitle(`Decision page: ${title}`).contentFrame();
  // A project whose board is empty opens Caw's panel (CawLead.arrive); on a
  // phone it is a sheet over the page, which puts itself away as a decision
  // page opens. Beside the page (tablet, desk) it covers none of it.
  const sheet = page.getByRole("dialog", { name: CAW_SHEET });
  // A card answered by one pick is a radiogroup named by its question, each
  // option a radio named by its label (ui/option-group).
  const option = (question: string, label: string) =>
    frame
      .getByRole("radiogroup", { name: question })
      .getByRole("radio", { name: label, exact: true });

  await leg.step(
    "Open the project's decisions",
    () =>
      page.goto(`${base}/project/${projectId}?view=decisions`, {
        waitUntil: "domcontentloaded",
      }),
    async () => {
      await shows(
        page.getByRole("link", { name: new RegExp(title.slice(0, 40), "u") }),
        `the page's row, “${title}”`
      );
      if (leg.size === "phone") {
        await shows(
          sheet,
          "Caw's sheet, open on a project with an empty board"
        );
      }
    }
  );

  let at = "";
  await leg.step(
    "Open the page",
    async () => {
      await page
        .getByRole("link", { name: new RegExp(title.slice(0, 40), "u") })
        .first()
        .click();
      at = page.url();
    },
    async () => {
      await gone(sheet, "Caw's sheet over the page, put away by itself");
      await shows(option(SHAPE, PER_MACHINE), "the page's cards, live", 60_000);
    }
  );

  // The phone's page scroller: a reveal in the page's frame carries up into it.
  const scrolled = () =>
    page
      .locator('[data-slot="project-page"]')
      .first()
      .evaluate((el) => el.scrollTop);
  await leg.step(
    "Pick an option on each card, the second with Caw back",
    async () => {
      // Each option scrolled to the middle of the page, then pressed; one
      // pick, its count seen, then the next.
      await pick(frame, option(SHAPE, PER_MACHINE));
      await shows(
        page.getByText(PICKS).filter({ hasText: "1 of 2" }),
        "the page's head counting 1 of 2 picked"
      );
      if (leg.size !== "phone") {
        await pick(frame, option(TRIAL, A_MONTH));
        return;
      }
      // On a phone: his seat brings his sheet back over the page (one
      // press), and the second card's option, revealed in the page's frame,
      // lands above the sheet: the page scroller moves it there (its scroll
      // padding is the sheet's while it stands), and the press finds
      // nothing over it (kit pressIn). Then he is put away to send.
      await page.getByRole("button", { name: CAW_SHEET }).first().click();
      await shows(sheet, "Caw's sheet back over the page, by his seat");
      const before = await scrolled();
      await pick(frame, option(TRIAL, A_MONTH));
      const after = await scrolled();
      expect(
        "the reveal moved the phone's page scroller",
        after > before,
        `scrollTop ${before} → ${after}`
      );
      await sheet.getByRole("button", { name: "Close" }).click();
    },
    async () => {
      await gone(sheet, "Caw's sheet, put away to send");
      await eventually(
        "the hub holds both picks",
        decision,
        (read) => read.picked === 2
      );
      await shows(
        page.getByText(PICKS).filter({ hasText: "2 of 2" }),
        "the page's head counting 2 of 2 picked"
      );
    }
  );

  await leg.step(
    "Send the picks: I'm done picking",
    () => page.getByRole("button", { name: decisionsWords.done }).click(),
    async () => {
      await eventually(
        "the hub holds the page sent, its two picks kept",
        decision,
        (read) =>
          read.state !== "picking" && read.sentAt !== null && read.picked === 2
      );
      // The picks travel by reference: the session is told the page has
      // responses and reads them itself with artifact_read.
      await eventually(
        "the session that wrote it is told its page has the person's responses",
        () =>
          fleet
            .query<{ body: string }>(
              "SELECT body FROM sent_messages WHERE instance_id = ?",
              writer
            )
            .map((row) => row.body)
            .join("\n"),
        (sent) => sent.includes(`The page \\"${name}\\" has new responses`),
        60_000
      );
      await shows(
        page.getByRole("button", { name: decisionsWords.makeTasks }),
        "the page's next step, Make tasks"
      );
      await eventually(
        "the page stayed where it was",
        () => page.url(),
        (url) => url === at
      );
    }
  );
}

const journey: Journey = {
  name: "j6-decisions",
  flow: "Decisions: pick and send in place",
  respond: (_seen: Seen) => say("Ready."),
  seed,
  leg: walk,
};

export default journey;
