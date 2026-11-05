/**
 * A decision page stops waiting on the person once he has answered it, by
 * a pick, a note on a question, or a pin on it the agent replied to and
 * resolved, Send or no Send; a question with none of those still waits on
 * him. The session that asked reads every question, open or answered, in
 * one list (open_items), and closes each it acted on with question_close.
 * The owner, 2026-11-05, of title-bars-close: a pick on `sheet-close`, a
 * pick on `card-close`, and on `head-name` no pick but his note, and the
 * page still asked him for Send and kept his session's needs-you hand up.
 *
 * On main, a page's open questions were its cards not picked (core
 * `picksMade`: "A note alone is a note, never a pick") and its writes not
 * sent (needs.ts `unsent` reason, from core `unsentChoices`), so a note
 * left the card open and every pick held the page in Needs you until Send;
 * the plan's page wait (plans.ts `waitOn`) dropped only at a Send
 * (artifacts/service.ts `answeredBy`). Main fails every leg: questions.ts
 * is not there (the spec does not load), and needs.ts read `picks` and
 * `unsent`.
 *
 * No fleet; each leg is the hub's own rule, called:
 * (a) title-bars-close as he left it: two picks and a note, no Send. Every
 *     question reads answered (pick, pick, note), Needs you lists nothing
 *     (`needOf`), nothing waits on him (`pendingOf`: the hub's
 *     `answersMoved` drops the plan's page wait when this is null), and
 *     his answers go to the session by themselves once quiet
 *     (`answeredWhole`). The note taken away, `head-name` is open: the
 *     page is in Needs you at `head-name`, "2 of 3 answered", and still
 *     waits on him.
 * (b) A pin on `head-name` the agent replied to and resolved answers it;
 *     a pin on a card whose id only starts the same (`head`) answers
 *     nothing; a pin in a card's Preview answers that card.
 * (c) The agent takes the note's question with question_close: it is
 *     `taken`, still counted answered, and the asking session's list
 *     (`stillAsked`) holds it no more; a newer note of his stands answered
 *     again. A withdrawn question is no longer asked: 2 of 2.
 * (d) The Open items section lists an ended delegate's page under its
 *     parent, after the parent's own, its open and answered questions by
 *     their links, the answer in his words.
 * (e) Working canvases never wait on him: a `draw` canvas with a pin the
 *     agent asked on, a canvas a page only embeds with a pin asking, and a
 *     preview handed up with his tuned values are no need and ask nothing.
 *
 *   bun scripts/probe-kit/run.ts answered-pages
 */
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import type { Pin } from "../../../packages/core/src/comments";
import type { DecisionCard } from "../../../packages/core/src/decisions";
import {
  type ArtifactFacts,
  type ArtifactSessions,
  answeredWhole,
  needOf,
  pendingOf,
} from "../../../packages/hub/src/artifacts/needs";
import {
  answersOf,
  noneOpen,
  pinCard,
  type Question,
  type QuestionClose,
  questionsOf,
  stillAsked,
} from "../../../packages/hub/src/artifacts/questions";
import type { AskedOf } from "../../../packages/hub/src/artifacts/service";
import type { ArtifactRow } from "../../../packages/hub/src/db/artifacts";
import { openItemsSection } from "../../../packages/hub/src/open-items";
import type { Kit, Spec } from "../kit";

const PAGE = "109f7c53-44db-47c7-bc7f-7805647dd14a";
const CANVAS = "2b8c2520-5f58-4d8c-a9b1-ec8042304dc6";
const PREVIEW = "0901cb29-1c9f-4c87-a6f0-1e31ca976a38";
const WRITER = "writer-session";
const DELEGATE = "delegate-session";
const AT = "2026-11-05T09:36:45.412Z";
const HASH = "0".repeat(64);

const card = (id: string, question: string): DecisionCard => ({
  after: [],
  id,
  kind: null,
  mockup: null,
  multiple: false,
  options: [
    {
      id: "a",
      label: `${id} A`,
      line: "",
      cost: "",
      keycap: 1,
      recommended: true,
    },
    {
      id: "b",
      label: `${id} B`,
      line: "",
      cost: "",
      keycap: 2,
      recommended: false,
    },
  ],
  question,
  section: null,
  why: "",
});

const CARDS = [
  card("sheet-close", "Where does a sheet's Close stand?"),
  card(
    "card-close",
    "Do the plan card and the delegate shelf keep their Close?"
  ),
  card("head-name", "What names the artifact at the head of its panel?"),
].map((one) => ({ id: one.id, card: one }));

const entry = (more: Partial<ChoiceEntry>): ChoiceEntry => ({
  at: AT,
  note: null,
  options: [],
  pageHash: HASH,
  value: null,
  ...more,
});

/** As he left it: two picks and his note on head-name, never sent. */
const ANSWERED: Record<string, ChoiceEntry> = {
  "sheet-close": entry({ options: ["a"] }),
  "card-close": entry({ options: ["a"] }),
  "head-name": entry({
    note: "its name, and each preview must be titled by the agent, slugs are for slugs, not humans!",
  }),
};

const pin = (
  number: number,
  selector: string,
  more: Partial<Pin> = {}
): Pin => ({
  anchor: { selector, source: null },
  at: AT,
  by: "person",
  elements: [],
  id: `pin-${number}`,
  kind: "comment",
  number,
  thread: [
    { id: `p${number}`, by: "person", text: "slugs are for slugs", at: AT },
    {
      id: `a${number}`,
      by: "agent",
      text: "Taken: every artifact gets a title.",
      at: "2026-11-05T09:37:28.007Z",
    },
  ],
  ...more,
});

const page: ArtifactRow = {
  id: PAGE,
  name: "title-bars-close",
  kind: "page",
  does: "pick",
  title: "Probe pick artifact",
  ask: "Pick the title bars' Close",
  instanceId: WRITER,
  projectId: "project-1",
  heldFor: null,
  openedRevision: 4,
  revision: 4,
  createdAt: new Date(AT),
} as ArtifactRow;

const questionsOfPage = (
  state: Record<string, ChoiceEntry>,
  pins: Pin[] = [],
  closes: Record<string, QuestionClose> = {},
  media = new Map<string, string>()
): Question[] =>
  questionsOf({
    artifact: {
      id: PAGE,
      name: page.name,
      title: "Answered page",
      ask: page.ask,
    },
    asked: true,
    pinsMayAsk: true,
    cards: CARDS,
    judged: false,
    media,
    pins,
    state,
    closes,
  });

/** The facts the hub reads of an artifact, its questions counted as artifacts/service.ts `factsOf` counts them. */
const factsFrom = (
  questions: Question[],
  more: Partial<ArtifactFacts> = {}
): ArtifactFacts => {
  const { asked, answered, firstOpen } = answersOf(questions);
  return {
    asked: { at: AT, by: WRITER, step: "Wait for the picks" },
    answers: asked > 0 ? { asked, answered } : null,
    asking: [],
    askingAt: null,
    changes: null,
    closed: [],
    draft: false,
    firstOpen,
    gone: null,
    handed: false,
    judged: noneOpen(questions, "judge"),
    lookedAt: AT,
    media: false,
    revisedAt: AT,
    unsent: 3,
    ...more,
  };
};

/** Its writer live, its plan waiting on the page the hub set (plans.ts `waitOn`). */
const sessions = (waitsOn: string): ArtifactSessions => ({
  ended: false,
  harness: "claude",
  machineId: "machine-1",
  setUp: true,
  waits: { pageWaits: [waitsOn], steps: [] },
});

const states = (questions: Question[]): string =>
  questions.map((one) => `${one.key}=${one.state}`).join(", ");

const run = ({ check }: Kit) => {
  // (a) Two picks and a note, no Send.
  const answered = questionsOfPage(ANSWERED);
  const facts = factsFrom(answered);
  check(
    "a: two picks and a note, no Send: every question answered (pick, pick, note), no need, nothing waits on him (the plan's page wait drops), and his answers go by themselves once quiet",
    answered.every((one) => one.state === "answered") &&
      answered.map((one) => one.answer?.by).join() === "pick,pick,note" &&
      needOf(page, facts, sessions(PAGE)) === null &&
      pendingOf(page, facts, sessions(PAGE)) === null &&
      answeredWhole(page, facts),
    `${states(answered)}; need ${JSON.stringify(needOf(page, facts, sessions(PAGE))?.pending)}`
  );
  const { "head-name": _note, ...twoPicks } = ANSWERED;
  const open = factsFrom(questionsOfPage(twoPicks));
  const need = needOf(page, open, sessions(PAGE));
  check(
    "a: head-name with no answer still waits on him: in Needs you at head-name, 2 of 3 answered, pending, and nothing goes by itself",
    need?.pending[0]?.kind === "answers" &&
      JSON.stringify(need.pending[0]) ===
        JSON.stringify({ kind: "answers", asked: 3, answered: 2 }) &&
      JSON.stringify(need.stop) === JSON.stringify({ card: "head-name" }) &&
      pendingOf(page, open, sessions(PAGE)) !== null &&
      !answeredWhole(page, open),
    JSON.stringify(need)
  );

  // (b) A pin on it the agent replied to and resolved.
  const resolved = {
    resolvedAt: "2026-11-05T09:41:06.520Z",
    resolvedBy: "agent" as const,
  };
  const byPin = questionsOfPage(twoPicks, [
    pin(4, "#decision-head-name > header:nth-of-type(1)", resolved),
  ]);
  const openPin = questionsOfPage(twoPicks, [
    pin(4, "#decision-head-name > header:nth-of-type(1)"),
  ]);
  const media = new Map([[CANVAS, "head-name"]]);
  const inPreview = questionsOfPage(
    twoPicks,
    [
      pin(2, "div:nth-of-type(2)", {
        ...resolved,
        anchor: {
          selector: "div:nth-of-type(2)",
          source: null,
          frames: [`[data-cawco-artifact="${CANVAS}"]`],
          embed: { artifact: CANVAS },
        },
      }),
    ],
    {},
    media
  );
  check(
    "b: a pin on head-name the agent replied to and resolved answers it (unresolved, it does not); a selector that only starts with another card's id names no card; a pin in a card's Preview answers that card",
    byPin.find((one) => one.key === "card:head-name")?.answer?.by === "pin" &&
      needOf(page, factsFrom(byPin), sessions(PAGE)) === null &&
      openPin.find((one) => one.key === "card:head-name")?.state === "open" &&
      pinCard(
        { selector: "#decision-head-name > header", source: null },
        ["head", "head-name"],
        new Map()
      ) === "head-name" &&
      pinCard(
        { selector: "#decision-head-name-note", source: null },
        ["head"],
        new Map()
      ) === null &&
      inPreview.find((one) => one.key === "card:head-name")?.state ===
        "answered",
    `${states(byPin)} | unresolved ${states(openPin)} | in its Preview ${states(inPreview)}`
  );

  // (c) The agent takes it; a newer answer stands again; a withdrawal.
  const taken: QuestionClose = {
    as: "taken",
    at: "2026-11-05T10:00:00.000Z",
    by: WRITER,
    why: "“its name, and each preview must be titled by the agent”",
  };
  const afterTake = questionsOfPage(ANSWERED, [], { "card:head-name": taken });
  const anew = questionsOfPage(
    {
      ...ANSWERED,
      "head-name": entry({
        note: "and on the phone too",
        at: "2026-11-05T10:05:00.000Z",
      }),
    },
    [],
    { "card:head-name": taken }
  );
  const withdrawn = questionsOfPage(twoPicks, [], {
    "card:head-name": { ...taken, as: "withdrawn", why: "superseded" },
  });
  check(
    "c: taken, head-name still counts answered and leaves the asking session's list; a newer note of his stands answered again; withdrawn, it is no longer asked (2 of 2) and nothing waits on him",
    afterTake.find((one) => one.key === "card:head-name")?.state === "taken" &&
      needOf(page, factsFrom(afterTake), sessions(PAGE)) === null &&
      stillAsked(afterTake).length === 2 &&
      !stillAsked(afterTake).some((one) => one.key === "card:head-name") &&
      anew.find((one) => one.key === "card:head-name")?.state === "answered" &&
      JSON.stringify(factsFrom(withdrawn).answers) ===
        JSON.stringify({ asked: 2, answered: 2 }) &&
      pendingOf(page, factsFrom(withdrawn), sessions(PAGE)) === null,
    `taken ${states(afterTake)}; anew ${states(anew)}; withdrawn ${JSON.stringify(factsFrom(withdrawn).answers)}`
  );

  // (d) The parent's list: its own first, then its ended delegate's page.
  const delegatePage = "5f05d50e-6c02-466a-a416-8ed9c46646d8";
  const listed: AskedOf[] = [
    {
      artifact: {
        id: PAGE,
        kind: "page",
        name: page.name,
        does: "pick",
        link: `[title-bars-close](cawco:artifact/${PAGE})`,
      },
      session: null,
      questions: stillAsked(questionsOfPage(twoPicks)),
    },
    {
      artifact: {
        id: delegatePage,
        kind: "page",
        name: "card-close-gone",
        does: "pick",
        link: `[card-close-gone](cawco:artifact/${delegatePage})`,
      },
      session: {
        ended: true,
        link: `[Land the title bars](cawco:session/${DELEGATE})`,
      },
      questions: stillAsked(
        questionsOf({
          artifact: {
            id: delegatePage,
            name: "card-close-gone",
            title: "Card close gone",
            ask: "Pick",
          },
          asked: true,
          pinsMayAsk: true,
          cards: [CARDS[1] as (typeof CARDS)[number]],
          judged: false,
          media: new Map(),
          pins: [],
          state: { "card-close": entry({ note: "keep it" }) },
          closes: {},
        })
      ),
    },
  ];
  const section = openItemsSection(
    {
      asks: [],
      notes: [],
      plan: null,
      projectId: "project-1",
      questions: listed,
      session: WRITER,
      tasks: [],
    },
    { cursor: 0, detailed: false }
  );
  const own = section.indexOf("[title-bars-close]");
  const theirs = section.indexOf(
    `(page, made in [Land the title bars](cawco:session/${DELEGATE}), ended: yours now)`
  );
  check(
    "d: the parent's Open items list its own page first, then its ended delegate's page as its own now, each question by its link, open or answered in his words",
    own >= 0 &&
      theirs > own &&
      section.includes(
        `  - open: [What names the artifact at the head of its panel?](cawco:decision/${PAGE}/head-name)`
      ) &&
      section.includes("  - answered, picked “sheet-close A”") &&
      section.includes(
        `  - answered, note “keep it” (2026-11-05 09:36): [Do the plan card and the delegate shelf keep their Close?](cawco:decision/${delegatePage}/card-close)`
      ),
    section
  );

  // (e) Working canvases, embedded canvases and handed previews never wait on him.
  const asking = pin(7, "svg", {
    thread: [
      { id: "p7", by: "person", text: "what's this", at: AT },
      {
        id: "a7",
        by: "agent",
        text: "Should this go left?",
        at: AT,
        asks: true,
      },
    ],
  });
  const canvasRow = (does: ArtifactRow["does"]): ArtifactRow =>
    ({
      ...page,
      id: CANVAS,
      name: "rail-one-group",
      kind: "canvas",
      does,
      ask: "",
    }) as ArtifactRow;
  const pinned = factsFrom([], { asking: [7], askingAt: AT, unsent: 0 });
  const working = needOf(canvasRow("draw"), pinned, sessions(CANVAS));
  const embedded = needOf(
    canvasRow("judge"),
    { ...pinned, media: true },
    sessions(CANVAS)
  );
  const preview = {
    ...page,
    id: PREVIEW,
    name: "move-face-work",
    kind: "preview",
    does: "judge",
    title: "Probe judge artifact",
    ask: "Judge the move",
    openedRevision: null,
  } as ArtifactRow;
  const handed = factsFrom([], {
    handed: true,
    unsent: 1,
    judged: true,
  });
  const askingPin = questionsOf({
    artifact: {
      id: CANVAS,
      name: "rail-one-group",
      title: "Rail one group",
      ask: "",
    },
    asked: false,
    pinsMayAsk: true,
    cards: [],
    judged: false,
    media: new Map(),
    pins: [asking],
    state: {},
    closes: {},
  });
  check(
    "e: a draw canvas with a pin asking, a canvas a page only embeds with a pin asking, and a handed-up preview with his tuned values are no need and nothing goes by itself (the same pin on a canvas of his asks)",
    working === null &&
      embedded === null &&
      needOf(preview, handed, sessions(PREVIEW)) === null &&
      pendingOf(preview, handed, sessions(PREVIEW)) === null &&
      !answeredWhole(preview, handed) &&
      askingPin[0]?.state === "open" &&
      needOf(canvasRow("try"), pinned, sessions(CANVAS)) !== null,
    JSON.stringify({ working, embedded, askingPin: states(askingPin) })
  );
  return Promise.resolve();
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "answered-pages",
  run,
};
export default spec;
