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
 * the plan's page wait (plans.ts `waitOn`, gone since) dropped only at a Send
 * (artifacts/service.ts `answeredBy`). Main fails every leg: questions.ts
 * is not there (the spec does not load), and needs.ts read `picks` and
 * `unsent`.
 *
 * No fleet; each leg is the hub's own rule, called:
 * (a) title-bars-close as he left it: two picks and a note, no Send. Every
 *     question reads answered (pick, pick, note), Needs you lists nothing
 *     (`needOf`), nothing waits on him (`pendingOf`: its writer's
 *     plan, read from Needs you, waits on it no more), and
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
 * Live in nightly 6821 (the cockpit session, 2026-11-05), three faults:
 * (f) artifact_read said "The person pressed Send just now" of the hub's
 *     own send (presenters/artifacts.ts read `sentAt` whoever sent) while he
 *     was away. A page the hub sent reads as the hub's send, he did not
 *     press Send, with his last answer's time; his own still reads as his.
 *     On main `sentBy` is not kept and the hub's send reads as his.
 * (g) The first restart sent every answered page touched within a day
 *     (service.ts `resumeMarks` → `marked` → `sendAnswered`) and woke its
 *     writer with answers it had read days before. Answers changed before
 *     the writer's last read (`readSeq`) or notice (`deliveredSeq`) are no
 *     news (needs.ts `answersUnheard`): the page settles telling no one; a
 *     note of his after the read is news.
 * (h) Every doc write ran `answersMoved`, the hub's own bookkeeping
 *     (`meta.drawn`) included, which reset the quiet timer of a pending
 *     send as if he had changed something. The docs tell a hub or agent
 *     write from his (docs.ts `keep`: only a joined client's is "person");
 *     only his pushes the delivery back (`personMarked`), and another's
 *     never sends while his delivery is coming (needs.ts `sendsOnChange`).
 *
 * (i) An ended delegate's fully answered page was never sent or decided:
 *     `sendAnswered` returned when `deps.finished(owner)`, though its parent
 *     held it in open_items. It goes to whoever holds it now, by the rule
 *     his marks already went by (artifacts/taker.ts, out of server.ts
 *     `deliverArtifactMarks`): its writer, else the session that delegated
 *     it, else the project's Caw. On main taker.ts is not there.
 *
 * (j) His "done picking" on the Decisions tab went by a rule of its own
 *     (decisions.ts `heardBy`: the writer unless ENDED_STATUSES, else Caw),
 *     never the session that delegated it. It goes by the same taker now:
 *     an ended delegate's project page reaches its parent, a note with it
 *     tells the parent the page is its own, and the page's read names the
 *     parent as the one that has it (`writer.heardBy`). On main the press
 *     goes to the delegate (or Caw) and `heardBy` is not there.
 *
 * (k) An agent's patch put its entry over his answer and its own read
 *     after it, so no one heard he had answered (the artifacts probe, its
 *     leg 4 inside leg 2's quiet window: his pick of b replaced by the
 *     agent's a, the page settled telling no one). A patch that replaces an
 *     answer of his after the session last had the page is refused naming
 *     it (overwrite.ts `answersReplaced`), unless read first or held by the
 *     patch's own test op; his answer stays news and goes once quiet. A
 *     held next version's merge keeps his answers since its fork
 *     (`answersKept`). On main overwrite.ts is not there.
 *
 *   bun scripts/probe-kit/run.ts answered-pages
 */

import type { CanvasAuthor } from "../../../packages/core/src/canvas";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import type { Pin } from "../../../packages/core/src/comments/model";
import type { DecisionCard } from "../../../packages/core/src/decisions";
import type {
  QuestionClose,
  SentBy,
} from "../../../packages/core/src/doc-meta";
import { type DocMeta, setMeta } from "../../../packages/core/src/doc-meta";
import { artifactResponsesNotice } from "../../../packages/core/src/injected";
import type { InstanceRow } from "../../../packages/core/src/protocol";
import { DAY_MS, MINUTE_MS } from "../../../packages/core/src/time";
import { artifactToolWords } from "../../../packages/core/src/words/artifact-tools";
import { noticeWords } from "../../../packages/core/src/words/notices";
import {
  type ArtifactClient,
  createArtifactDocs,
} from "../../../packages/hub/src/artifacts/docs";
import {
  type ArtifactFacts,
  type ArtifactSessions,
  answeredWhole,
  answersUnheard,
  heardSeq,
  needOf,
  pendingOf,
  sendsOnChange,
  unheardKeys,
} from "../../../packages/hub/src/artifacts/needs";
import {
  answersKept,
  answersReplaced,
  testedKeys,
} from "../../../packages/hub/src/artifacts/overwrite";
import {
  answersOf,
  noneOpen,
  pinCard,
  type Question,
  questionsOf,
  stillAsked,
} from "../../../packages/hub/src/artifacts/questions";
import type {
  ArtifactRead,
  AskedOf,
  PageHearer,
} from "../../../packages/hub/src/artifacts/service";
import { artifactTaker } from "../../../packages/hub/src/artifacts/taker";
import type {
  ArtifactChange,
  ArtifactRow,
  ArtifactsDb,
} from "../../../packages/hub/src/db/artifacts";
import {
  createDecisions,
  type DecisionsDeps,
} from "../../../packages/hub/src/decisions";
import type { HubLifetimeShape } from "../../../packages/hub/src/lifetime";
import { openItemsSection } from "../../../packages/hub/src/open-items";
import { artifactReadWords } from "../../../packages/hub/src/presenters/artifacts";
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

/** Its writer live; its plan holds the ask by the step it was asked at (needs.ts `planHolds`, the facts' `asked.step`). */
const SESSIONS: ArtifactSessions = {
  ended: false,
  harness: "claude",
  machineId: "machine-1",
  setUp: true,
  steps: [],
};

const states = (questions: Question[]): string =>
  questions.map((one) => `${one.key}=${one.state}`).join(", ");

const run = async ({ check }: Kit) => {
  // (a) Two picks and a note, no Send.
  const answered = questionsOfPage(ANSWERED);
  const facts = factsFrom(answered);
  check(
    "a: two picks and a note, no Send: every question answered (pick, pick, note), no need, nothing waits on him (nor in its writer's plan), and his answers go by themselves once quiet",
    answered.every((one) => one.state === "answered") &&
      answered.map((one) => one.answer?.by).join() === "pick,pick,note" &&
      needOf(page, facts, SESSIONS) === null &&
      pendingOf(page, facts, SESSIONS) === null &&
      answeredWhole(page, facts),
    `${states(answered)}; need ${JSON.stringify(needOf(page, facts, SESSIONS)?.pending)}`
  );
  const { "head-name": _note, ...twoPicks } = ANSWERED;
  const open = factsFrom(questionsOfPage(twoPicks));
  const need = needOf(page, open, SESSIONS);
  check(
    "a: head-name with no answer still waits on him: in Needs you at head-name, 2 of 3 answered, pending, and nothing goes by itself",
    need?.pending[0]?.kind === "answers" &&
      JSON.stringify(need.pending[0]) ===
        JSON.stringify({ kind: "answers", asked: 3, answered: 2 }) &&
      JSON.stringify(need.stop) === JSON.stringify({ card: "head-name" }) &&
      pendingOf(page, open, SESSIONS) !== null &&
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
      needOf(page, factsFrom(byPin), SESSIONS) === null &&
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
      needOf(page, factsFrom(afterTake), SESSIONS) === null &&
      stillAsked(afterTake).length === 2 &&
      !stillAsked(afterTake).some((one) => one.key === "card:head-name") &&
      anew.find((one) => one.key === "card:head-name")?.state === "answered" &&
      JSON.stringify(factsFrom(withdrawn).answers) ===
        JSON.stringify({ asked: 2, answered: 2 }) &&
      pendingOf(page, factsFrom(withdrawn), SESSIONS) === null,
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
        link: `[Answered page](cawco:artifact/${PAGE})`,
        title: "Answered page",
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
        link: `[Card close gone](cawco:artifact/${delegatePage})`,
        title: "Card close gone",
      },
      session: {
        ended: true,
        id: DELEGATE,
        link: `[Land the title bars](cawco:session/${DELEGATE})`,
        title: "Land the title bars",
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
  const own = section.indexOf("[Answered page]");
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
  const working = needOf(canvasRow("draw"), pinned, SESSIONS);
  const embedded = needOf(
    canvasRow("judge"),
    { ...pinned, media: true },
    SESSIONS
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
      needOf(preview, handed, SESSIONS) === null &&
      pendingOf(preview, handed, SESSIONS) === null &&
      !answeredWhole(preview, handed) &&
      askingPin[0]?.state === "open" &&
      needOf(canvasRow("try"), pinned, SESSIONS) !== null,
    JSON.stringify({ working, embedded, askingPin: states(askingPin) })
  );

  // (f) The hub's Send is said as the hub's, his last answer's time beside it.
  const sentRead = (sentBy: SentBy) =>
    artifactReadWords({
      id: PAGE,
      kind: "page",
      name: page.name,
      title: page.title,
      revision: 4,
      pageHash: HASH,
      sentAt: new Date(Date.now() - MINUTE_MS).toISOString(),
      sentBy,
      answeredAt: new Date(Date.now() - 3 * DAY_MS).toISOString(),
      seq: 40,
      state: {},
    } as unknown as ArtifactRead) as string;
  const byHub = sentRead("hub");
  const byHim = sentRead("person");
  check(
    "f: a page the hub sent reads as the hub's send, never as his Send, with his last answer's time; his own Send still reads as his",
    byHub.includes(artifactToolWords.readSentByHub("1 min ago")) &&
      !byHub.includes(artifactToolWords.readSentByPerson("1 min ago", null)) &&
      byHub.includes(artifactToolWords.readLastAnswer("3 days ago")) &&
      byHim.includes(artifactToolWords.readSentByPerson("1 min ago", null)),
    JSON.stringify({ byHub, byHim })
  );

  // (g) Answers the writer read settle the page with nothing sent to it.
  const heard = {
    "sheet-close": entry({ options: ["x"] }),
    "card-close": entry({ options: ["x"] }),
    "head-name": entry({ options: [], note: "the name, bigger" }),
  };
  const changesOf = [
    { by: "person" as const, key: "sheet-close", seq: 31 },
    { by: "person" as const, key: "card-close", seq: 33 },
    { by: "person" as const, key: "head-name", seq: 35 },
    { by: "agent" as const, key: "drawn", seq: 39 },
  ];
  const readAll = { readSeq: 38, deliveredSeq: 12 };
  const newer = [
    ...changesOf,
    { by: "person" as const, key: "head-name", seq: 41 },
  ];
  const pinAfter = [
    ...changesOf,
    { by: "person" as const, key: "pin:7", seq: 41 },
  ];
  check(
    "g: every answer read with artifact_read (or told by a Send) before the hub's send is no news, and the page settles telling no one; a note of his after the read is news",
    !(
      answersUnheard(readAll, changesOf, heard) ||
      answersUnheard({ readSeq: 0, deliveredSeq: 36 }, changesOf, heard)
    ) &&
      answersUnheard(readAll, newer, heard) &&
      !answersUnheard(readAll, pinAfter, heard) &&
      answersUnheard({ readSeq: 30, deliveredSeq: 0 }, changesOf, heard)
  );

  // (h) Only his writes are his change: a hub write never moves the quiet timer.
  const told: CanvasAuthor[] = [];
  const timers: (() => void)[] = [];
  const docs = createArtifactDocs({
    db: {
      append: () => undefined,
      updateCount: () => 0,
      compact: () => undefined,
      updates: () => [],
    } as unknown as ArtifactsDb,
    lifetime: {
      every: () => ({}),
      after: (_ms: number, later: () => void) => {
        timers.push(later);
        return {};
      },
      cancel: () => undefined,
    } as unknown as HubLifetimeShape,
    updated: (_id, by) => told.push(by),
  });
  // A page keeps no `drawn` (a component canvas's, by states file): this
  // write, a time, is read by nothing, and stays as the probe wrote it.
  docs.transact(PAGE, "hub", (doc) =>
    setMeta(doc, "drawn", AT as unknown as DocMeta["drawn"])
  );
  docs.transact(PAGE, "agent", (doc) => setMeta(doc, "revisedAt", AT));
  docs.transact(PAGE, { client: {} as ArtifactClient }, (doc) =>
    doc.getMap("state").set("head-name", heard["head-name"])
  );
  check(
    "h: the hub's own write and an agent's are not his change: neither sends while his delivery is coming (its timer untouched), one that finds the page whole and nothing coming sends it at once; his write sends only from his quiet delivery",
    JSON.stringify(told) === JSON.stringify(["agent", "agent", "person"]) &&
      !sendsOnChange(told[0] as CanvasAuthor, { coming: true, whole: true }) &&
      sendsOnChange(told[0] as CanvasAuthor, { coming: false, whole: true }) &&
      !sendsOnChange(told[0] as CanvasAuthor, {
        coming: false,
        whole: false,
      }) &&
      !sendsOnChange("person", { coming: false, whole: true }),
    JSON.stringify(told)
  );

  // (i) An ended writer's answered page goes to whoever holds it now.
  const session = (id: string, parent: string | null = null) =>
    ({ id, parentInstanceId: parent, title: id }) as InstanceRow;
  const writer = session(DELEGATE, WRITER);
  const parentRow = session(WRITER);
  const takerWith = (refusing: string[], projectId: string | null) =>
    artifactTaker(
      writer,
      { projectId },
      {
        caw: "project-caw",
        instance: (id) => (id === WRITER ? parentRow : undefined),
        refusal: (id) =>
          refusing.includes(id)
            ? "Its work's workspace was archived."
            : undefined,
      }
    );
  const standing = takerWith([], "project-1");
  const toParent = takerWith([DELEGATE], "project-1");
  const toCaw = takerWith([DELEGATE, WRITER], "project-1");
  const toNone = takerWith([DELEGATE, WRITER], null);
  // Stopped, with no refusal: ended all the same (core ENDED_STATUSES), so
  // setup-send leg 5's stopped writer's Set up goes to the project's Caw.
  const stoppedWriter = artifactTaker(
    { ...writer, status: "stopped" } as InstanceRow,
    { projectId: "project-1" },
    {
      caw: "project-caw",
      instance: () => undefined,
      refusal: () => undefined,
    }
  );
  check(
    "i: an answered page goes to whoever holds it, the one rule his marks go by: its writer while it takes input; ended, the session that delegated it (its open_items list holds it); that one ended too, the project's Caw; neither, no one; a stopped writer has ended though nothing refuses it",
    standing.to === "writer" &&
      standing.session.id === DELEGATE &&
      toParent.to === "parent" &&
      toParent.session.id === WRITER &&
      toParent.why === "Its work's workspace was archived" &&
      toCaw.to === "caw" &&
      toCaw.caw === "project-caw" &&
      toCaw.projectId === "project-1" &&
      toNone.to === "none" &&
      stoppedWriter.to === "caw" &&
      stoppedWriter.why === noticeWords.sessionEnded,
    JSON.stringify({ standing, toParent, toCaw, toNone, stoppedWriter })
  );

  // (j) His "done picking" on an ended delegate's project page reaches its parent.
  const pageSends: { route: string; to: PageHearer }[] = [];
  const pageTells: { note: string; to: string }[] = [];
  const projectPage = {
    ...page,
    name: "card-close-gone",
    kind: "page",
    instanceId: DELEGATE,
    projectId: "project-1",
    updatedAt: new Date(AT),
  } as ArtifactRow;
  const fleetRows = new Map([
    [DELEGATE, session(DELEGATE, WRITER)],
    [WRITER, parentRow],
  ]);
  const decisionDeps: DecisionsDeps = {
    artifacts: () => [projectPage],
    changed: () => undefined,
    commit: () => Promise.resolve(),
    folderNames: () => Promise.resolve([]),
    folderText: (_project, path) =>
      Promise.resolve(
        path === "decisions/card-close-gone/index.html"
          ? `<article class="dp-card"><h2>Which close?</h2><div data-cawco-choice="card-close"><button data-option="x"><b>An x</b></button></div></article>`
          : undefined
      ),
    instance: (id) => fleetRows.get(id),
    taker: (artifact) =>
      artifactTaker(fleetRows.get(artifact.instanceId ?? ""), artifact, {
        caw: "project-caw",
        instance: (id) => fleetRows.get(id),
        refusal: (id) =>
          id === DELEGATE ? "Its work's workspace was archived." : undefined,
      }),
    page: () => ({
      meta: { revisedAt: AT, sentAt: null, sentText: null },
      state: {},
    }),
    projectExists: () => true,
    send: (_artifact, route, to) => {
      pageSends.push({ route, to });
      return Promise.resolve("session" in to ? to.session.id : "caw-session");
    },
    sendInFlight: () => false,
    takeWrites: () => null,
    tasks: () => Promise.resolve([]),
    tell: (instance, said) => {
      pageTells.push({
        to: instance.id,
        note: "note" in said ? (said.note ?? "") : "",
      });
    },
    tellConversation: () => Promise.reject(new Error("Caw was asked")),
  };
  const decisions = createDecisions(decisionDeps);
  const pressed = await decisions.send(
    "project-1",
    "card-close-gone",
    undefined
  );
  await decisions.send("project-1", "card-close-gone", "the x, smaller");
  const projectRead = await decisions.read("project-1", "card-close-gone");
  const [press] = pageSends;
  check(
    "j: his done picking on an ended delegate's project page goes to the session that delegated it, never to Caw; a note with it tells that session the page is its own now; the page names that session as the one that has it",
    pressed.to === "session" &&
      pageSends.length === 1 &&
      press !== undefined &&
      "session" in press.to &&
      press.to.session.id === WRITER &&
      pageTells.length === 1 &&
      pageTells[0]?.to === WRITER &&
      !!pageTells[0]?.note.includes(
        noticeWords.handedToParent(DELEGATE, PAGE)
      ) &&
      projectRead.writer?.ended === true &&
      projectRead.writer.heardBy?.instanceId === WRITER,
    JSON.stringify({
      pressed,
      pageSends: pageSends.map((one) =>
        "session" in one.to ? one.to.session.id : "caw"
      ),
      pageTells,
      writer: projectRead.writer,
    })
  );

  // (k) An agent's patch never replaces an answer of his it has not had.
  answerChecks(check, { changesOf, readAll });
};

/**
 * (k): he picks b on `sheet-close` after the session's last read, and
 * inside his quiet window the agent patches it to a. The patch is refused
 * in words naming b (artifacts/service.ts `answersHad`, which throws before
 * its write, so the page still reads b), the session's read stays where it
 * was, and his answers are still news: the hub's send goes once quiet, its
 * notice naming the page. Read first, or a test op holding b, and the same
 * patch stands; a held next version's merge keeps his answer since its fork.
 */
const answerChecks = (
  check: Kit["check"],
  given: {
    changesOf: ArtifactChange[];
    readAll: { deliveredSeq: number; readSeq: number };
  }
) => {
  const pickedB: Record<string, ChoiceEntry> = {
    ...ANSWERED,
    "sheet-close": entry({ options: ["b"] }),
  };
  const picked = [
    ...given.changesOf,
    { by: "person" as const, key: "sheet-close", seq: 41 },
  ];
  const toA = [
    { op: "replace" as const, path: "/sheet-close/options", value: ["a"] },
  ];
  const patchedA = { ...pickedB, "sheet-close": entry({ options: ["a"] }) };
  const replacedBy = (
    readSeq: number,
    patch: Parameters<typeof testedKeys>[0] = toA
  ) =>
    answersReplaced({
      before: pickedB,
      after: patchedA,
      standing: pickedB,
      tested: testedKeys(patch, pickedB),
      unheard: unheardKeys(heardSeq({ ...given.readAll, readSeq }), picked),
    });
  const refused = replacedBy(given.readAll.readSeq);
  const words = artifactToolWords.answersStand(
    refused.map((key) =>
      artifactToolWords.answerSaid(key, pickedB[key] as ChoiceEntry)
    ),
    "read"
  );
  const facts = factsFrom(questionsOfPage(pickedB));
  const notice = artifactResponsesNotice({
    id: PAGE,
    kind: "page",
    name: page.name,
    title: page.title,
    since: heardSeq(given.readAll),
  });
  check(
    "k: he picks b after the session's read and the agent patches it to a inside his quiet window: the patch is refused naming b, nothing is written, and his answer is still news, so the hub's send goes once quiet with its notice",
    refused.join() === "sheet-close" &&
      words.includes("sheet-close (picked b)") &&
      words.includes("nothing was changed") &&
      answersUnheard(given.readAll, picked, pickedB) &&
      answeredWhole(page, facts) &&
      notice.includes(`title=${encodeURIComponent(page.title)}`),
    JSON.stringify({ refused, words, notice: notice.slice(0, 120) })
  );
  const tested = replacedBy(given.readAll.readSeq, [
    { op: "test", path: "/sheet-close", value: pickedB["sheet-close"] },
    ...toA,
  ]);
  const testedA = replacedBy(given.readAll.readSeq, [
    { op: "test", path: "/card-close", value: pickedB["card-close"] },
    ...toA,
  ]);
  check(
    "k: once the session has read b, or its patch's own test op holds b, the same patch stands; a test of another entry does not",
    replacedBy(41).length === 0 &&
      tested.length === 0 &&
      testedA.join() === "sheet-close",
    JSON.stringify({ afterRead: replacedBy(41), tested, testedA })
  );
  // A held next version forked at seq 38: its maker's patch of a merged
  // over his b of seq 41, which the merge keeps; card-close, his before the
  // fork, is the maker's to change.
  const merged = {
    ...pickedB,
    "sheet-close": entry({ options: ["a"] }),
    "card-close": entry({ options: ["z"] }),
  };
  const kept = answersKept(pickedB, merged, unheardKeys(38, picked));
  check(
    "k: a held next version's merge keeps his answer made after its fork (b), and lets the maker's change of one he made before it stand",
    Object.keys(kept).join() === "sheet-close" &&
      kept["sheet-close"].options.join() === "b",
    JSON.stringify(kept)
  );
};

const spec: Spec = {
  group: "Previews, pages and comments",
  name: "answered-pages",
  run,
};
export default spec;
