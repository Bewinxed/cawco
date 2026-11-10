/**
 * A session that made a card waiting on the person reads as needing them,
 * as a session with a question parked does (core activity.ts
 * `waitingOnYou`): its tab's glyph, its row's mark, Caw's seat and Find's
 * state read that one rule, through the dashboard's `activityOf` and the
 * hub's `waitingOnYou`.
 *
 * 2026-11-05, live: Caw's tab drew Working's circular arrows while five
 * cards he had made waited on the person's picks, two tasks blocked on
 * them. A session's needs-you was its parked asks alone (client.svelte.ts
 * `activityNow`: `target.pending.length > 0`; the hub's Find:
 * `pending.list()`), and a card is no ask: it is in Needs you as an
 * artifact (hub artifacts/needs.ts `needOf`), which nothing that marks a
 * session read.
 *
 * No fleet; each artifact goes through the hub's own `needOf`:
 * (a) a decision page of five cards, none picked, made by session `caw`
 *     whose plan waits on it: Needs you lists it under `caw`, and `caw`
 *     waits on you.
 * (b) every card answered: nothing listed, `caw` waits on nothing.
 * (c) put away with Not now (`parked`): `caw` waits on nothing.
 * (d) a canvas to judge never opened, and a question parked under another
 *     session: both sessions wait on you; a session with neither does not.
 * (e) a delegate whose ask is routed to its parent (`routedTo: "parent"`)
 *     waits on that agent, not on you, until the parent hands it up (the
 *     hub's `unroute` takes the routing off); the dashboard's `activityOf`
 *     reads it as working, and blocked once the ask is the person's.
 *
 * (f) a delegate this page does not follow (no tab, no peek), whose only
 *     ask is routed to its parent, shows no hand wherever it is drawn (the
 *     dashboard's `activityOf`, through `sessionActivity`): the daemon's
 *     pulse says `blocked` for every ask its harness parked, the parent's
 *     too, and reads only as working; with the routed ask held here, and
 *     with none held (the pulse heard it first, or it was settled and the
 *     pulse never came down). An ask that is the person's shows the hand.
 *
 * (g) a session with a page card waiting on the person: the session waits
 *     on you (its needs-you mark), and its Files lists that page first,
 *     ahead of every newer artifact, from the same list the mark reads
 *     (`artifactNeedsOpen`); the rest keep their order. Its card's press
 *     opens it, as every Files card's does.
 *
 * Main fails (g): `waitingFirst` is not there (the spec does not load), and
 * Files listed the waiting page after every newer artifact, under "N more".
 *
 * Main fails (e) too: every ask parked made its session need you, its
 * parent's or not. Main fails (f): `sessionActivity` is not there (the spec
 * does not load), and client.svelte.ts `activityNow` returned `blocked` for
 * an unfollowed session whose pulse said so with no ask of it held here
 * (`pulseSays === "blocked" && !(target && isSubscribed(instanceId))`).
 *
 * Main fails: `waitingOnYou` is not there (the spec does not load), and
 * every mark read the asks alone. (a)'s need is there on main: Needs you listed the cards;
 * no mark read them.
 *
 *   bun scripts/probe-kit/run.ts waiting-on-you
 */
import {
  activityOf,
  sessionActivity,
} from "../../../apps/dashboard/src/lib/cawco/activity";
import { waitingFirst } from "../../../apps/dashboard/src/lib/cawco/files/waiting-first";
import { waitingOnYou } from "../../../packages/core/src/activity";
import type { ArtifactNeed } from "../../../packages/core/src/artifact-needs";
import {
  type ArtifactFacts,
  type ArtifactSessions,
  needOf,
} from "../../../packages/hub/src/artifacts/needs";
import type { ArtifactRow } from "../../../packages/hub/src/db/artifacts";
import type { Kit, Spec } from "../spec";

const CAW = "caw-session";
const OTHER = "other-session";
const QUIET = "quiet-session";
const DELEGATE = "delegate-session";
const PAGE = "page-decisions";
const CANVAS = "canvas-header";

/** The fields of a row Needs you's rules read; the rest no rule there reads. */
const rowOf = (
  fields: Pick<
    ArtifactRow,
    "ask" | "does" | "id" | "instanceId" | "kind" | "title"
  >
): ArtifactRow =>
  ({
    name: fields.id,
    projectId: "project-1",
    heldFor: null,
    openedRevision: null,
    revision: 1,
    createdAt: new Date("2026-11-05T10:00:00Z"),
    ...fields,
  }) as ArtifactRow;

/** A published artifact's facts, its ask made by `by` while its plan waited on it. */
const factsOf = (by: string, more: Partial<ArtifactFacts>): ArtifactFacts => ({
  asked: { at: "2026-11-05T10:00:00Z", by, step: "Wait for the picks" },
  asking: [],
  askingAt: null,
  changes: null,
  closed: [],
  answers: null,
  draft: false,
  firstOpen: null,
  gone: null,
  handed: false,
  judged: false,
  lookedAt: null,
  media: false,
  revisedAt: "2026-11-05T10:00:00Z",
  unsent: 0,
  ...more,
});

/** Its writer live on a machine; its plan holds the ask by the step it was asked at (needs.ts `planHolds`, the facts' `asked.step`). */
const SESSIONS: ArtifactSessions = {
  ended: false,
  harness: "claude",
  machineId: "machine-1",
  setUp: false,
  steps: [],
};

const page = rowOf({
  id: PAGE,
  kind: "page",
  does: "pick",
  title: "Probe pick artifact",
  ask: "Pick the five calls the tasks wait on",
  instanceId: CAW,
});

const needs = (...items: (ArtifactNeed | null)[]): ArtifactNeed[] =>
  items.filter((one): one is ArtifactNeed => one !== null);

const said = (waiting: Set<string>): string => JSON.stringify([...waiting]);

const spec: Spec = {
  group: "The hub and machines",
  name: "waiting-on-you",
  // Nothing here waits: each leg is the hub's rule and the core's, called.
  run: ({ check }: Kit) => {
    const open = needOf(
      page,
      factsOf(CAW, {
        answers: { asked: 5, answered: 0 },
        firstOpen: "head",
      }),
      SESSIONS
    );
    const waiting = waitingOnYou({ asks: [], artifacts: needs(open) });
    check(
      "a: a decision page with five cards unpicked is in Needs you under the session that made it, and that session waits on you",
      open?.instanceId === CAW && waiting.has(CAW),
      `need: ${JSON.stringify(open?.pending)}; waiting: ${said(waiting)}`
    );

    const answered = needOf(
      page,
      factsOf(CAW, { answers: { asked: 5, answered: 5 } }),
      SESSIONS
    );
    const afterAnswer = waitingOnYou({ asks: [], artifacts: needs(answered) });
    check(
      "b: every card answered: nothing in Needs you, and the session waits on nothing",
      answered === null && afterAnswer.size === 0,
      `need: ${JSON.stringify(answered)}; waiting: ${said(afterAnswer)}`
    );

    const parked = waitingOnYou({
      asks: [],
      artifacts: needs(open).map((one) => ({ ...one, parked: true })),
    });
    check(
      "c: the page put away with Not now: the session waits on nothing",
      parked.size === 0,
      said(parked)
    );

    const canvas = needOf(
      rowOf({
        id: CANVAS,
        kind: "canvas",
        does: "judge",
        title: "Probe judge artifact",
        ask: "Judge the header",
        instanceId: CAW,
      }),
      factsOf(CAW, {}),
      SESSIONS
    );
    const both = waitingOnYou({
      asks: [{ instanceId: OTHER }, { instanceId: null }],
      artifacts: needs(canvas),
    });
    check(
      "d: a canvas to judge never opened and a question parked under another session: both wait on you, a session with neither does not",
      canvas?.pending[0]?.kind === "unopened" &&
        both.has(CAW) &&
        both.has(OTHER) &&
        !both.has(QUIET) &&
        both.size === 2,
      `need: ${JSON.stringify(canvas?.pending)}; waiting: ${said(both)}`
    );

    const routed = waitingOnYou({
      asks: [{ instanceId: DELEGATE, routedTo: "parent" }],
      artifacts: [],
    });
    const handedUp = waitingOnYou({
      asks: [{ instanceId: DELEGATE }],
      artifacts: [],
    });
    const parentsAsk = activityOf({
      pending: [{ routedTo: "parent" }],
      busy: false,
    });
    const personsAsk = activityOf({
      pending: [{ routedTo: "parent" }, {}],
      busy: false,
    });
    check(
      "e: an ask routed to the delegate's parent: it waits on nothing of yours and reads as working; handed up to you, it waits on you and reads as blocked",
      routed.size === 0 &&
        handedUp.has(DELEGATE) &&
        parentsAsk === "working" &&
        personsAsk === "blocked",
      `routed: ${said(routed)}; handed up: ${said(handedUp)}; activity, routed: ${parentsAsk}; with one of yours: ${personsAsk}`
    );

    const unfollowed = {
      moving: false,
      runningDelegates: 0,
      subscribed: false,
      pulse: "blocked" as const,
    };
    const routedHere = sessionActivity({
      ...unfollowed,
      waiting: waitingOnYou({
        asks: [{ instanceId: DELEGATE, routedTo: "parent" }],
        artifacts: [],
      }).has(DELEGATE),
      session: { pending: [{ routedTo: "parent" }], busy: true },
    });
    const pulseAlone = sessionActivity({
      ...unfollowed,
      waiting: waitingOnYou({ asks: [], artifacts: [] }).has(DELEGATE),
    });
    const settledHere = sessionActivity({
      ...unfollowed,
      waiting: false,
      session: { pending: [], busy: false },
    });
    const yours = sessionActivity({
      ...unfollowed,
      waiting: waitingOnYou({
        asks: [{ instanceId: DELEGATE }],
        artifacts: [],
      }).has(DELEGATE),
      session: { pending: [{}], busy: true },
    });
    check(
      "f: a delegate not open here whose pulse says blocked for an ask routed to its parent shows no hand, the ask held here or not; an ask of yours shows it",
      routedHere === "working" &&
        pulseAlone === "working" &&
        settledHere === "working" &&
        yours === "blocked",
      `routed ask held: ${routedHere}; pulse alone: ${pulseAlone}; held none: ${settledHere}; yours: ${yours}`
    );

    const PAGE_ID = "0b1c2d3e-4f50-4617-8899-aabbccddeeff";
    const waitingNeeds = needs(open).map((one) => ({
      ...one,
      artifactId: PAGE_ID,
    }));
    const marked = waitingOnYou({ asks: [], artifacts: waitingNeeds });
    const files = waitingFirst(
      [{ id: "newest" }, { id: "newer" }, { id: PAGE_ID }, { id: "older" }],
      new Set(
        waitingNeeds
          .filter((one) => one.instanceId === CAW)
          .map((one) => one.artifactId)
      )
    ).map((one) => one.id);
    check(
      "g: a session with a page card waiting on you wears the mark, and its Files lists that page first, the rest in their order",
      marked.has(CAW) && files.join(",") === `${PAGE_ID},newest,newer,older`,
      `waiting: ${said(marked)}; files: ${files.join(",")}`
    );
    return Promise.resolve();
  },
};

export default spec;
