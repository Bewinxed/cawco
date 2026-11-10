/**
 * What a session's plan says waits on the person (the plan panel's
 * `needs`, the away recap's waits, needs.ts rule 2's hold) is read from the
 * one list Needs you reads (hub artifacts/needs.ts over questions.ts),
 * never from a copy of its own.
 *
 * 2026-11-05: the recap the cockpit session was sent on his return named
 * seven pages "which no step names" as waiting on him (ece517b8, 70ff64bf,
 * 3360f51d, 109f7c53, 669f4274, 6fde362d, 11ac93d3). None was in the hub's
 * Needs you, and every question on them was taken, withdrawn or answered.
 * The recap, the plan panel's `needs` and rule 2's `planWaitsOnArtifact`
 * all read the plan's stored page waits (`session_plans.page_waits`, set by
 * plans.ts `waitOn`), which the hub dropped only on a later change of the
 * page's doc (artifacts/service.ts `answersMoved`): a page answered or
 * closed before that rule landed, or with no change since, stayed "waiting".
 * The store is gone (migration 0379): each reads Needs you (core plan.ts
 * `planWaitsOf`), and rule 2 reads the artifact's own ask (needs.ts
 * `planHolds`: `asked.step`, the step it was asked at) and the steps.
 *
 * No fleet; each leg is the hub's own code, called: questions.ts
 * `questionsOf`, needs.ts `needOf` and `movedOn`, plans.ts `createPlans`
 * over a stub database, core `planWaitsOf` and `presenceLine`. The plan as
 * main held it tonight had a page wait on each of five pages:
 * - CLOSED: one question taken, one withdrawn, a step still naming it;
 *   ANSWERED: its one card picked; OPEN: one card picked, one open, no step
 *   names it; STEPPED: one card open, named by the step in progress; LATE:
 *   one card open, its latest ask made at no step, the writer's next turn
 *   ended since.
 * - r0. As main read them (the plan's page waits), the recap, the plan
 *   panel's `needs` and rule 2 all hold CLOSED and ANSWERED: the fault.
 * - r1. Needs you lists OPEN and STEPPED alone.
 * - r2. The plan panel (`plans.read`) has OPEN in its `needs` and STEPPED
 *   on its step; neither CLOSED nor ANSWERED is in it.
 * - r3. The recap names exactly Needs you, STEPPED on its step and OPEN
 *   alone, and its presence line links neither CLOSED nor ANSWERED.
 * - r4. Rule 2 reads the artifact's own ask: LATE, which the stored page
 *   wait held on main, is let go; STEPPED, asked at a step, stands though
 *   no step is in progress any more; CLOSED and ANSWERED ask nothing.
 * - r5. Needs you moves (OPEN answered): the plan is read again
 *   (`needsMoved`), its followers hear `needs` go, and nothing else in it.
 * - r6. Another session's need and one put away with Not now are not this
 *   session's; with nothing in Needs you the recap names no wait.
 *
 *   bun scripts/probe-kit/run.ts recap-waits
 */
import type { ArtifactNeed } from "../../../packages/core/src/artifact-needs";
import type { ChoiceEntry } from "../../../packages/core/src/choices";
import type { DecisionCard } from "../../../packages/core/src/decisions";
import type {
  ArtifactAsked,
  QuestionClose,
} from "../../../packages/core/src/doc-meta";
import {
  type PresenceSaid,
  presenceLine,
} from "../../../packages/core/src/injected";
import {
  type PlanDelta,
  type PlanSnapshot,
  type PlanStep,
  type PlanWait,
  planWaitsOf,
  stepNamesArtifact,
} from "../../../packages/core/src/plan";
import type { InstanceRow } from "../../../packages/core/src/protocol";
import { waitArtifact } from "../../../packages/core/src/wait-targets";
import {
  type ArtifactFacts,
  type ArtifactSessions,
  movedOn,
  needOf,
  pendingOf,
} from "../../../packages/hub/src/artifacts/needs";
import {
  answersOf,
  noneOpen,
  questionsOf,
} from "../../../packages/hub/src/artifacts/questions";
import type { ArtifactRow } from "../../../packages/hub/src/db/artifacts";
import { createPlans, type PlansDeps } from "../../../packages/hub/src/plans";
import type { Kit, Spec } from "../spec";

const SESSION = "9f997798-0000-4000-8000-000000000001";
const OTHER = "9f997798-0000-4000-8000-000000000002";
const AT = "2026-11-05T20:00:00.000Z";
const HASH = "0".repeat(64);

const CLOSED = "ece517b8-1111-4111-8111-111111111111";
const ANSWERED = "70ff64bf-2222-4222-8222-222222222222";
const OPEN = "3360f51d-3333-4333-8333-333333333333";
const STEPPED = "109f7c53-4444-4444-8444-444444444444";
const LATE = "669f4274-5555-4555-8555-555555555555";

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

/** Asked at step 1, while the session was at work on its plan (service.ts `askedNow`). */
const AT_STEP: ArtifactAsked = { at: AT, by: SESSION, step: "1" };

/** A decision page of the session's: its cards, his picks, the agent's closes, its latest ask. */
interface Page {
  asked: ArtifactAsked;
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
    asked: AT_STEP,
    cards: ["head", "foot"],
    closes: { "card:head": close("taken"), "card:foot": close("withdrawn") },
  },
  {
    id: ANSWERED,
    title: "Answered page",
    asked: AT_STEP,
    cards: ["head"],
    state: { head: picked },
  },
  {
    id: OPEN,
    title: "Open page",
    asked: AT_STEP,
    cards: ["head", "foot"],
    state: { head: picked },
  },
  { id: STEPPED, title: "Stepped page", asked: AT_STEP, cards: ["head"] },
  {
    id: LATE,
    title: "Late page",
    asked: { at: AT, by: SESSION, movedAt: "2026-11-05T20:05:00.000Z" },
    cards: ["head"],
  },
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
const factsOf = (
  page: Page,
  state: Record<string, ChoiceEntry> = page.state ?? {}
): ArtifactFacts => {
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
    state,
    closes: page.closes ?? {},
  });
  const { asked, answered, firstOpen } = answersOf(questions);
  return {
    asked: page.asked,
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

/** The step in progress naming a card of STEPPED, and one still naming a card of CLOSED. */
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

/** The plan's page waits as main stored them tonight: one on each page, none dropped. */
const STORED_PAGE_WAITS = PAGES.map((page) => page.id);

const sessionsWith = (steps: readonly PlanStep[]): ArtifactSessions => ({
  ended: false,
  harness: "claude",
  machineId: "machine-1",
  setUp: false,
  steps,
});

/** Needs you by the hub's own rule (needs.ts `needOf`), each page read with `states`' picks where given. */
const needsOf = (
  steps: readonly PlanStep[],
  states: Record<string, Record<string, ChoiceEntry>> = {}
): ArtifactNeed[] =>
  PAGES.flatMap((page) => {
    const need = needOf(
      rowOf(page),
      factsOf(page, states[page.id]),
      sessionsWith(steps)
    );
    return need ? [need] : [];
  });

/** No open step names it. */
const unnamed = (id: string): boolean =>
  !STEPS.some((step) => stepNamesArtifact(step, id));

/** Main's rules over the stored page waits: the recap's (server.ts `waitingOn`), the panel's (plans.ts `compute`), rule 2's (core `planWaitsOnArtifact`). */
const asMainRead = {
  recap: (): string[] => [
    ...STEPS.flatMap((step) => {
      const id =
        step.status === "completed" || !step.waitsOn
          ? undefined
          : waitArtifact(step.waitsOn);
      return id ? [id] : [];
    }),
    ...STORED_PAGE_WAITS.filter(unnamed),
  ],
  panel: (): string[] => STORED_PAGE_WAITS.filter(unnamed),
  rule2: (id: string): boolean =>
    STORED_PAGE_WAITS.includes(id) || !unnamed(id),
};

/** The plans module over a stub database holding the session's steps, and Needs you as `lane` holds it now. */
const plansOver = (lane: { now: ArtifactNeed[] }) => {
  const published: (PlanSnapshot | PlanDelta)[] = [];
  const row = {
    id: SESSION,
    workItemId: null,
    projectId: null,
  } as unknown as InstanceRow;
  const db = {
    getInstancesByIds: () => [row],
    sessionPlan: () => ({
      instanceId: SESSION,
      steps: STEPS,
      orphanedComments: [],
      spec: null,
      specAt: null,
      awaySeen: null,
      updatedAt: new Date(AT),
    }),
    planChangesOf: () => [],
    workItem: () => undefined,
  } as unknown as PlansDeps["db"];
  const tasks = {
    waitState: () => Promise.resolve({ settled: false }),
  } as unknown as PlansDeps["tasks"];
  const plans = createPlans({
    db,
    tasks,
    needs: () => lane.now,
    publish: (_id, message) => published.push(message),
  });
  return { plans, published };
};

const said = (waiting: readonly PlanWait[]): string =>
  presenceLine({
    kind: "on",
    recap: {
      notes: "- the build landed",
      section: "20:00",
      since: "20:00",
      ...(waiting.length > 0 ? { waiting } : {}),
    },
  } satisfies PresenceSaid);

const pageOf = (id: string): Page => PAGES.find((one) => one.id === id) as Page;

const run = async ({ check }: Kit) => {
  // r0. As main read them.
  const recap = new Set(asMainRead.recap());
  const panel = new Set(asMainRead.panel());
  check(
    "r0: as main read the plan's stored page waits, the recap, the plan panel's needs and rule 2 all hold the page with every question closed and the page answered",
    recap.has(CLOSED) &&
      recap.has(ANSWERED) &&
      panel.has(ANSWERED) &&
      asMainRead.rule2(CLOSED) &&
      asMainRead.rule2(ANSWERED) &&
      asMainRead.rule2(LATE),
    `recap ${[...recap].join(", ")} | panel ${[...panel].join(", ")}`
  );

  // r1. Needs you, by the hub's own rule.
  const needs = needsOf(STEPS);
  const listed = needs.map((need) => need.artifactId);
  check(
    "r1: Needs you lists the open page and the stepped page alone: not the closed, answered or late page",
    listed.length === 2 && listed.includes(OPEN) && listed.includes(STEPPED),
    listed.join(", ")
  );

  // r2. The plan panel, read by the plans module itself.
  const lane = { now: needs };
  const { plans, published } = plansOver(lane);
  const plan = await plans.read(SESSION);
  check(
    "r2: the plan panel's needs hold the open page alone (the stepped page shows on its step), never the closed or answered page",
    "steps" in plan &&
      JSON.stringify(plan.needs) === JSON.stringify([OPEN]) &&
      plan.steps.some((step) => stepNamesArtifact(step, STEPPED)),
    JSON.stringify("steps" in plan ? plan.needs : plan.response)
  );

  // r3. The recap names exactly Needs you.
  const waiting = planWaitsOf(SESSION, STEPS, needs);
  const line = said(waiting);
  const stepped = waiting.find((one) => one.artifact.id === STEPPED);
  const open = waiting.find((one) => one.artifact.id === OPEN);
  check(
    "r3: the recap names exactly what Needs you lists, the stepped page on its step and the open page alone, and its presence line links neither the closed page nor the answered one",
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

  // r4. Rule 2 reads the artifact's own ask.
  const late = pageOf(LATE);
  const steppedPage = pageOf(STEPPED);
  const stepsDone = STEPS.map((step) => ({
    ...step,
    status: "completed" as const,
  }));
  check(
    "r4: rule 2 reads the artifact's own ask: the late page (asked at no step, its writer's next turn ended) is let go though main's stored page wait held it; the stepped page, asked at a step, stands with every step done; the closed and answered pages ask nothing",
    movedOn(LATE, late.asked, STEPS) &&
      needOf(rowOf(late), factsOf(late), sessionsWith(STEPS)) === null &&
      !movedOn(STEPPED, steppedPage.asked, stepsDone) &&
      needOf(
        rowOf(steppedPage),
        factsOf(steppedPage),
        sessionsWith(stepsDone)
      ) !== null &&
      [CLOSED, ANSWERED].every(
        (id) =>
          pendingOf(
            rowOf(pageOf(id)),
            factsOf(pageOf(id)),
            sessionsWith(STEPS)
          ) === null
      ),
    `late moved on ${movedOn(LATE, late.asked, STEPS)}; stepped, every step done, moved on ${movedOn(STEPPED, steppedPage.asked, stepsDone)}`
  );

  // r5. Needs you moves: the open page answered.
  lane.now = needsOf(STEPS, { [OPEN]: { head: picked, foot: picked } });
  const before = published.length;
  plans.needsMoved(lane.now);
  const again = await plans.read(SESSION);
  const heard = published.slice(before);
  check(
    "r5: Needs you moves (the open page answered): the plan is read again, its followers hear its needs go, and its steps stay",
    "steps" in again &&
      again.needs === undefined &&
      heard.length === 1 &&
      JSON.stringify(heard[0]).includes("/needs") &&
      again.steps.length === STEPS.length,
    JSON.stringify(heard)
  );

  // r6. Another session's need, a need put away, and none at all.
  const others: ArtifactNeed[] = needs.map((need) =>
    need.artifactId === OPEN
      ? { ...need, instanceId: OTHER }
      : { ...need, parked: true }
  );
  const none = said(planWaitsOf(SESSION, STEPS, []));
  check(
    "r6: another session's need and one put away with Not now are not this session's; with nothing in Needs you, the recap names no wait",
    planWaitsOf(SESSION, STEPS, others).length === 0 &&
      !none.includes("cawco:artifact/") &&
      !none.includes("cawco:step/"),
    none
  );
};

const spec: Spec = {
  group: "The hub and machines",
  name: "recap-waits",
  run,
};
export default spec;
