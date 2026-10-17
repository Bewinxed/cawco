/**
 * J4, Caw asks and the person answers. In a project with Caw on, the
 * person's words to Caw start his turn, and he asks two questions at once
 * (two AskUserQuestion calls in one message), each option with its
 * description. Caw's head counts two; the thread's card says “1 of 2”; the
 * person answers it by click, the card moves to “2 of 2”, and the person
 * answers that one by its number key and Enter, as the card's keycaps
 * offer. Caw's next turn carries both answers.
 *
 * Caw's session runs inside his place's boundary: this journey runs only
 * where a workspace boundary can start (the host), never inside a workspace.
 */
import { join } from "node:path";
import type { Page } from "playwright-core";
import { MACHINE, type Seen } from "../../scratch-fleet";
import type { KitFleet } from "../kit";
import { pendingAsks } from "./asks";
import { caw, cawSays, ZERO } from "./j1-check-in";
import { say } from "./mock";
import { type Data, eventually, type Journey, type Leg, shows } from "./suite";

const CAW = "You are Caw";
const ASKED = "JOURNEY-CAW";
const VOICE = "Which voice for the launch post?";
const TONE = "Which tone for the replies?";
const PLAIN = "Plain";
const WARM = "Warm";
const TWO_NEED = /^Needs you, 2(\D|$)/;
const QUESTION = /^Question from Caw/;
const FIRST_OF_TWO = /1 of 2/;
const SECOND_OF_TWO = /2 of 2/;
/** The Plain option as the card names it: its keycap, its label and its description. */
const PLAIN_DESCRIBED = /Plain Say it plainly, no flourish/;

const question = (text: string) => ({
  questions: [
    {
      question: text,
      header: "Pick",
      multiSelect: false,
      options: [
        { label: PLAIN, description: "Say it plainly, no flourish." },
        { label: WARM, description: "Say it warmly, as a friend would." },
      ],
    },
  ],
});

/** How Claude Code hands an answered question back (its tool result). */
const answered = (text: string, label: string) => `"${text}"="${label}"`;

interface Seeded {
  projectId: string;
}

async function seed(fleet: KitFleet, data: Data): Promise<Seeded> {
  const dir = join(fleet.sandbox, `${data}-launch`);
  await Bun.$`mkdir -p ${dir} && git init -q -b main ${dir} && git -C ${dir} -c user.name=Owner -c user.email=o@probe.test commit -q --allow-empty -m First`.quiet();
  const { id } = await fleet.api<{ id: string }>("/api/projects", {
    name: data === "stretched" ? "Launch — Launch — Launch" : "Launch",
    machineId: MACHINE,
    cwd: dir,
    caw: true,
  });
  return { projectId: id };
}

/** The card for the ask the thread's composer stands in, by its place among two. */
const cardAt = (page: Page, place: RegExp) =>
  page
    .getByRole("region", { name: QUESTION })
    .filter({ has: page.getByRole("heading", { name: place }) })
    .filter({ visible: true })
    .first();

async function walk(leg: Leg): Promise<void> {
  const { fleet, page, base } = leg;
  const { projectId } = leg.seeded as Seeded;
  const token = `${ASKED} ${leg.id}`;
  const opened = await fleet.api<{ thread: { id: string; title: string } }>(
    `/api/projects/${projectId}/threads`,
    { body: `${token}: ${leg.title("draft the launch post")}` }
  );
  const thread = opened.thread.id;
  /** His asks' row in what needs you, named for the thread they stand in. */
  const row = `Open ${opened.thread.title}`;
  const asksHere = async () =>
    (await pendingAsks(fleet)).filter((one) => one.threadId === thread);
  await eventually(
    "Caw parked his two questions",
    asksHere,
    (asks) => asks.length === 2,
    240_000
  );

  await leg.step(
    "Open the dashboard",
    () => page.goto(base, { waitUntil: "domcontentloaded" }),
    () =>
      eventually(
        "Caw's head says two need you",
        () => cawSays(page),
        (said) => TWO_NEED.test(said)
      )
  );

  await leg.step(
    "Open what needs you, then Caw's question",
    async () => {
      await caw(page).click();
      await page
        .getByLabel(row, { exact: true })
        .filter({ visible: true })
        .first()
        .click();
    },
    async () => {
      await eventually(
        "the thread is open",
        () => new URL(page.url()).pathname,
        (path) => path === `/session/thread:${thread}`
      );
      const first = cardAt(page, FIRST_OF_TWO);
      await shows(first, "Caw's question, 1 of 2");
      await shows(
        first.getByRole("radio", { name: PLAIN_DESCRIBED }),
        "each option with its description"
      );
    }
  );

  await leg.step(
    "Answer the first by click",
    async () => {
      const first = cardAt(page, FIRST_OF_TWO);
      await first.getByRole("radio", { name: new RegExp(PLAIN) }).click();
      await first.getByRole("button", { name: "Answer" }).click();
    },
    async () => {
      await eventually(
        "the hub holds one ask left",
        asksHere,
        (asks) => asks.length === 1
      );
      await shows(cardAt(page, SECOND_OF_TWO), "the second question, 2 of 2");
    }
  );

  await leg.step(
    "Answer the second by its number key, then Enter",
    async () => {
      await page.keyboard.press("2");
      await page.keyboard.press("Enter");
    },
    async () => {
      await eventually(
        "the hub holds no ask in the thread",
        asksHere,
        (asks) => asks.length === 0
      );
      await eventually(
        "Caw's next turn carries both answers",
        () =>
          fleet.seen.find(
            (one) =>
              one.afterTool &&
              one.all.includes(token) &&
              one.body.includes(answered(VOICE, PLAIN)) &&
              one.body.includes(answered(TONE, WARM))
          ),
        Boolean,
        60_000
      );
      await eventually(
        "Caw's head says all caught up",
        () => cawSays(page),
        (said) => said.startsWith(ZERO)
      );
    }
  );
}

const journey: Journey = {
  name: "j4-caw-asks",
  flow: "Caw asks and the person answers: by click, then by number key",
  respond: (seen: Seen) => {
    if (!seen.tools) {
      return say("Launch post");
    }
    // The person's words reach Caw as a turn of their own, or, while a turn
    // of his is still running (an earlier leg's), read mid-turn after a
    // tool's result (MID_TURN): he asks on either.
    if (
      seen.all.includes(CAW) &&
      seen.last.includes(ASKED) &&
      (!seen.afterTool || seen.lastMidTurn)
    ) {
      return {
        everyMs: 20,
        words: [],
        tools: [
          { name: "AskUserQuestion", input: question(VOICE) },
          { name: "AskUserQuestion", input: question(TONE) },
        ],
      };
    }
    return say("Plain voice, warm replies: drafting it now.");
  },
  seed,
  leg: walk,
};

export default journey;
