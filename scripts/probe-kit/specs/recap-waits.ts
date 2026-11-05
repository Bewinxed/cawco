/**
 * What the away recap says waits on the person is exactly what Needs you
 * says waits on him (hub artifacts/needs.ts, read from questions.ts), never
 * a list of its own.
 *
 * 2026-11-05: the recap the cockpit session was sent on his return named
 * seven pages "which no step names" as waiting on him (ece517b8, 70ff64bf,
 * 3360f51d, 109f7c53, 669f4274, 6fde362d, 11ac93d3). None was in the hub's
 * Needs you, and every question on them was taken, withdrawn or answered.
 * The recap read the plan's page waits (hub plans.ts `waitOn`, kept in
 * `session_plans.page_waits`) and its steps' `waitsOn`, which the hub drops
 * only on a later change of the page's doc (artifacts/service.ts
 * `answersMoved`), so a page closed before that rule landed, or with no
 * change since, stayed "waiting" there.
 *
 * No fleet; each leg is the hub's own rule, called (needs.ts `needOf` over
 * questions.ts `questionsOf`, core injected.ts `awayWaitsOf` and
 * `presenceLine`), on a plan that still holds a page wait on each of four
 * pages and a step whose `waitsOn` names a card of two of them:
 * - CLOSED: one question taken, one withdrawn; ANSWERED: its one card
 *   picked; OPEN: one card picked, one open, no step names it; STEPPED: one
 *   card open, named by the open step's `waitsOn`.
 * - r0. As main read the recap (the plan's waits), CLOSED and ANSWERED are
 *   named as waiting: the fault.
 * - r1. Needs you lists OPEN and STEPPED alone.
 * - r2. The recap names exactly those, STEPPED on its step and OPEN alone,
 *   and its presence line links neither CLOSED nor ANSWERED.
 * - r3. A need of another session, or one put away with Not now, is not
 *   this session's recap; with nothing in Needs you the line says nothing
 *   waits.
 *
 *   bun scripts/probe-kit/run.ts recap-waits
 */

import type { ArtifactNeed } from "../../../packages/core/src/artifact-needs";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import type { DecisionCard } from "../../../packages/core/src/decisions";
import {
  type AwayWait,
  awayWaitsOf,
  type PresenceSaid,
  presenceLine,
} from "../../../packages/core/src/injected";
import {
  type PlanStep,
  type PlanWaits,
  stepNamesArtifact,
} from "../../../packages/core/src/plan";
import { waitArtifact } from "../../../packages/core/src/wait-targets";
import {
  type ArtifactFacts,
  type ArtifactSessions,
  needOf,
} from "../../../packages/hub/src/artifacts/needs";
import {
  answersOf,
  noneOpen,
  type QuestionClose,
  questionsOf,
} from "../../../packages/hub/src/artifacts/questions";
import type { ArtifactRow } from "../../../packages/hub/src/db/artifacts";
import type { Kit, Spec } from "../kit";

const SESSION = "9f997798-0000-4000-8000-000000000001";
const OTHER = "9f997798-0000-4000-8000-000000000002";
const AT = "2026-11-05T20:00:00.000Z";
const HASH = "0".repeat(64);

const CLOSED = "ece517b8-1111-4111-8111-111111111111";
const ANSWERED = "70ff64bf-2222-4222-8222-222222222222";
const OPEN = "3360f51d-3333-4333-8333-333333333333";
const STEPPED = "109f7c53-4444-4444-8444-444444444444";

const card = (id: string): DecisionCard => ({
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
  question: `Which ${id}?`,
  section: null,
  why: "",
});

const picked: ChoiceEntry = {
  at: AT,
  note: null,
  options: ["a"],
  pageHash: HASH,
  value: null,
};

const close = (as: QuestionClose["as"]): QuestionClose => ({
  as,
  at: AT,
  by: SESSION,
  why: as === "taken" ? "“the first”" : "superseded",
});

/** A decision page of the session's, with its cards, his picks and the agent's closes. */
interface Page {
  cards: string[];
  closes?: Record<string, QuestionClose>;
  id: string;
  state?: Record<string, ChoiceEntry>;
  title: string;
}

const PAGES: Page[] = [
  {
    id: CLOSED,
    title: "Closed page",
    cards: ["head", "foot"],
    closes: { "card:head": close("taken"), "card:foot": close("withdrawn") },
  },
  {
    id: ANSWERED,
    title: "Answered page",
    cards: ["head"],
    state: { head: picked },
  },
  {
    id: OPEN,
    title: "Open page",
    cards: ["head", "foot"],
    state: { head: picked },
  },
  { id: STEPPED, title: "Stepped page", cards: ["head"] },
];

const rowOf = (page: Page): ArtifactRow =>
  ({
    id: page.id,
    name: page.title.toLowerCase().replace(" ", "-"),
    kind: "page",
    does: "pick",
    title: page.title,
    ask: `Pick on the ${page.title.toLowerCase()}`,
    instanceId: SESSION,
    projectId: null,
    heldFor: null,
    openedRevision: 1,
    revision: 1,
    createdAt: new Date(AT),
  }) as ArtifactRow;

/** The facts the hub reads of a page, its questions counted as artifacts/service.ts `factsOf` counts them. */
const factsOf = (page: Page): ArtifactFacts => {
  const questions = questionsOf({
    artifact: {
      id: page.id,
      name: page.title,
      title: page.title,
      ask: rowOf(page).ask,
    },
    asked: true,
    pinsMayAsk: true,
    cards: page.cards.map((id) => ({ id, card: card(id) })),
    judged: false,
    media: new Map(),
    pins: [],
    state: page.state ?? {},
    closes: page.closes ?? {},
  });
  const { asked, answered, firstOpen } = answersOf(questions);
  return {
    asked: { at: AT, by: SESSION, step: "1" },
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
    unsent: 0,
  };
};

/** The open step whose `waitsOn` names a card of STEPPED, and one still naming a card of CLOSED. */
const STEPS: PlanStep[] = [
  {
    id: "1",
    content: "Wait on his pick of the head",
    depth: 0,
    status: "in_progress",
    waitsOn: `${STEPPED}#head`,
  },
  {
    id: "2",
    content: "Wait on the closed page",
    depth: 0,
    status: "pending",
    waitsOn: `${CLOSED}#head`,
  },
];

/** The plan as the hub held it tonight: a page wait on each page, none dropped. */
const PLAN: PlanWaits = {
  pageWaits: PAGES.map((page) => page.id),
  steps: STEPS,
};

const sessions: ArtifactSessions = {
  ended: false,
  harness: "claude",
  machineId: "machine-1",
  setUp: false,
  waits: PLAN,
};

/** The recap's waits as main read them (server.ts `waitingOn`): the steps' waits, then the plan's page waits no step names. */
const asMainRead = (plan: PlanWaits): string[] => [
  ...plan.steps.flatMap((step) => {
    const id =
      step.status === "completed" || !step.waitsOn
        ? undefined
        : waitArtifact(step.waitsOn);
    return id ? [id] : [];
  }),
  ...plan.pageWaits.filter(
    (id) => !plan.steps.some((step) => stepNamesArtifact(step, id))
  ),
];

const said = (waiting: readonly AwayWait[]): string =>
  presenceLine({
    kind: "on",
    recap: {
      notes: "- the build landed",
      section: "20:00",
      since: "20:00",
      ...(waiting.length > 0 ? { waiting } : {}),
    },
  } satisfies PresenceSaid);

const run = ({ check }: Kit) => {
  // r0. As main read it.
  const main = new Set(asMainRead(PLAN));
  check(
    "r0: as main read the recap (the plan's page waits and steps), the page with every question closed and the page answered are named as waiting",
    main.has(CLOSED) && main.has(ANSWERED),
    [...main].join(", ")
  );

  // r1. Needs you, by the hub's own rule.
  const needs = PAGES.flatMap((page) => {
    const need = needOf(rowOf(page), factsOf(page), sessions);
    return need ? [need] : [];
  });
  const listed = needs.map((need) => need.artifactId);
  check(
    "r1: Needs you lists the open page and the stepped page alone: neither the closed page nor the answered one",
    listed.length === 2 && listed.includes(OPEN) && listed.includes(STEPPED),
    listed.join(", ")
  );

  // r2. The recap names exactly Needs you.
  const waiting = awayWaitsOf(SESSION, STEPS, needs);
  const line = said(waiting);
  const stepped = waiting.find((one) => one.artifact.id === STEPPED);
  const open = waiting.find((one) => one.artifact.id === OPEN);
  check(
    "r2: the recap names exactly what Needs you lists, the stepped page on its step and the open page alone, and its presence line links neither the closed page nor the answered one",
    JSON.stringify(waiting.map((one) => one.artifact.id).sort()) ===
      JSON.stringify([...listed].sort()) &&
      stepped?.step?.id === "1" &&
      open !== undefined &&
      open.step === undefined &&
      line.includes(`cawco:artifact/${OPEN}`) &&
      line.includes(`cawco:artifact/${STEPPED}`) &&
      line.includes(`cawco:step/${SESSION}/1`) &&
      !line.includes(CLOSED) &&
      !line.includes(ANSWERED),
    line
  );

  // r3. Another session's need, a need put away, and none at all.
  const others: ArtifactNeed[] = needs.map((need) =>
    need.artifactId === OPEN
      ? { ...need, instanceId: OTHER }
      : { ...need, parked: true }
  );
  const none = said(awayWaitsOf(SESSION, STEPS, []));
  check(
    "r3: another session's need and one put away with Not now are not this session's recap; with nothing in Needs you, its line names no wait",
    awayWaitsOf(SESSION, STEPS, others).length === 0 &&
      !none.includes("cawco:artifact/") &&
      !none.includes("cawco:step/"),
    none
  );
  return Promise.resolve();
};

const spec: Spec = {
  group: "The hub and machines",
  name: "recap-waits",
  run,
};
export default spec;
