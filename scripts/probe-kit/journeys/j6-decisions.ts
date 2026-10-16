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
import type { Locator } from "playwright-core";
import { pageHtml, type SeedPage } from "../../decisions-preview/seed";
import { MACHINE, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { say } from "./mock";
import { type Data, eventually, type Journey, type Leg, shows } from "./suite";

const SHAPE = "What shape is the plan?";
const TRIAL = "How long is the trial?";
const PER_MACHINE = "Per machine";
const A_MONTH = "A month";
const PICKS = /picked/;

interface Seeded {
  projectId: string;
}

/** The decision page: two cards, two options each. */
const decisionPage = (name: string, title: string): SeedPage => ({
  name,
  title,
  writer: "Price the plan",
  lede: "Two choices before the pricing page is built.",
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
        { id: "month", label: A_MONTH, line: "Thirty days, then pay." },
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

/** An option scrolled to the middle of its page's frame, then tapped. */
async function pick(option: Locator): Promise<void> {
  await option.evaluate((el) => el.scrollIntoView({ block: "center" }));
  await option.click();
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
    name,
    html: pageHtml(decisionPage(name, title)),
  });
  const decision = () =>
    fleet.api<DecisionRead>(`/api/projects/${projectId}/decisions/${name}`);
  const frame = page.getByTitle(`Decision page: ${title}`).contentFrame();
  const option = (question: string, label: string) =>
    frame
      .getByRole("group", { name: question })
      .getByRole("button", { name: new RegExp(`^${label}`) });

  await leg.step(
    "Open the project's decisions",
    () =>
      page.goto(`${base}/project/${projectId}?view=decisions`, {
        waitUntil: "domcontentloaded",
      }),
    () =>
      shows(
        page.getByRole("link", { name: new RegExp(title.slice(0, 40)) }),
        `the page's tile, “${title}”`
      )
  );

  let at = "";
  await leg.step(
    "Open the page",
    async () => {
      await page
        .getByRole("link", { name: new RegExp(title.slice(0, 40)) })
        .first()
        .click();
      at = page.url();
    },
    () => shows(option(SHAPE, PER_MACHINE), "the page's cards, live", 60_000)
  );

  await leg.step(
    "Pick an option on each card",
    async () => {
      // Each option scrolled up into the open part of the page (the page
      // runs on under the docked composer, as a person scrolls it), then
      // tapped; one pick, its count seen, then the next.
      await pick(option(SHAPE, PER_MACHINE));
      await shows(
        page.getByText(PICKS).filter({ hasText: "1 of 2" }),
        "the page's head counting 1 of 2 picked"
      );
      await pick(option(TRIAL, A_MONTH));
    },
    async () => {
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
    () => page.getByRole("button", { name: "I'm done picking" }).click(),
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
        page.getByRole("button", { name: "Make tasks" }),
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
