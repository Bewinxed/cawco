/**
 * What the plan-view preview shows: a real plan, the orchestrator session's
 * (cockpit#23cb5219, "Orchestrate cockpit fleet work") as it stood on
 * 2026-10-25 at about 10:00, its steps' words, states and holders as the hub
 * keeps them, and its delegates by their own titles (`cawco tool
 * list_sessions`). All three variations draw these same rows, so the owner
 * compares one plan three ways; a frame only changes which folds stand open.
 * Data only.
 */
import type { MarkStatus } from "#lib/cawco/TreeMark.svelte";

/**
 * What a step is doing, as its tile says it: to do (the empty tile), doing,
 * waiting on you, waiting on a step or a slot, done, failed.
 */
export type StepState =
  "todo" | "doing" | "you" | "waiting" | "done" | "failed";

/** What a line under the words says something waits on. */
export interface Wait {
  kind: "you" | "slot" | "fail";
  words: string;
}

/** A session's own sub-step, or a delegate's step. */
export interface SubStep {
  id: string;
  /** When it started, ms before the page loaded (counted while it runs). */
  startedAgo?: number;
  state: StepState;
  took?: string;
  words: string;
}

export interface Delegate {
  /** Its session, for its sprite and hue. */
  id: string;
  /** Its name, short: what the stack leads with. */
  name: string;
  /** Where it runs, for its hue. */
  place: string;
  /** How far its own plan has got; none yet while it has no plan. */
  plan: { done: number; total: number } | null;
  /** What it is working on: the step it carries, in its own words. */
  problem: string;
  /** Its report, once it has one. */
  report?: string;
  startedAgo?: number;
  status: MarkStatus;
  /** The step of this session it carries. */
  step: string;
  steps: SubStep[];
  took?: string;
  /** What it waits on, when it waits. */
  wait?: Wait;
}

export interface Step {
  /** Steps this one starts after. */
  after?: string[];
  /** Who carries it: delegates, by id. */
  delegates?: string[];
  /** What the step is, in a few sentences (markdown). */
  description: string;
  id: string;
  /** The to-do grew into a task of its own: that task's id, title and stage. */
  promoted?: { id: string; stage: string; title: string };
  /** A to-do the session offered and the person has not agreed to. */
  proposed?: boolean;
  /** Its name in a few words, where another step points at it. */
  short: string;
  startedAgo?: number;
  state: StepState;
  subs?: SubStep[];
  took?: string;
  words: string;
}

export interface PlanFixture {
  delegates: Delegate[];
  spec: { ago: string; markdown: string };
  steps: Step[];
}

/** How far a plan has got: its to-dos, a proposed one not yet one. */
export function progress(from: PlanFixture): { done: number; total: number } {
  const counted = from.steps.filter((step) => !step.proposed);
  return {
    done: counted.filter((step) => step.state === "done").length,
    total: counted.length,
  };
}

/**
 * A step's time, one way everywhere: seconds alone under a minute ("52s"),
 * then minutes and two-figure seconds ("1m 05s"), as the run's times read.
 */
export function clockWords(ms: number): string {
  const seconds = Math.max(0, Math.floor(ms / 1000));
  if (seconds < 60) {
    return `${seconds}s`;
  }
  return `${Math.floor(seconds / 60)}m ${String(seconds % 60).padStart(2, "0")}s`;
}

/** Whether a step's time is counting. */
export const counting = (state: StepState): boolean =>
  state === "doing" || state === "you";

/** The delegates a step carries, in the plan's order. */
export const carriersOf = (from: PlanFixture, step: Step): Delegate[] =>
  (step.delegates ?? []).flatMap((id) => {
    const found = from.delegates.find((one) => one.id === id);
    return found ? [found] : [];
  });

/** The steps a step waits on that have not finished. */
export const openBefore = (from: PlanFixture, step: Step): Step[] =>
  (step.after ?? []).flatMap((id) => {
    const found = from.steps.find((one) => one.id === id);
    return found && found.state !== "done" ? [found] : [];
  });

/**
 * A delegate's place in the stack: what needs you first (waiting on you,
 * then failed), then working, queued, done. Base44's agent "comes back to
 * you when it needs an answer from you or hits something it cannot get
 * past" (docs.base44.com/changelog/product): the first row answers "does
 * anything need me?".
 */
const ORDER: Record<MarkStatus, number> = {
  attn: 0,
  fail: 1,
  live: 2,
  idle: 3,
  done: 4,
};
export const stackOrder = (delegates: Delegate[]): Delegate[] =>
  [...delegates].sort((a, b) => ORDER[a.status] - ORDER[b.status]);

/** The first lines of the orchestrator plan's spec, as it stood. */
const SPEC = `## Folded: 10-25 09:17–10:55 (he was away)

- Landed: full pin replies in transcript rows (698e9e861); Ctrl/Cmd+Enter never interrupts (ca4b39f4a); OpenCode/pi long calls 24 h (1e0976e09); criteria ticked on a criteria-met close (36364c1a3); sheet Vite default loader + no restart for a stage that never served (eb97f6e2a, eb62be7cb); relay router forwards card, UPnP gone (8ef0b09da, migration 0313); Caw centred in heroes, starter cards words only (62ba67d31); suggestions component reviewed (aadddf952).
- Opened for him: suggestions-look, task-todo-counts, owner-presence (2 new cards), pairing (re-pick).
- Found: five waiting previews broke today's rules; fixes running. Release still blocked on the stage-2 pins check.`;

/**
 * A delegate holding a step: its session (id, title, workspace) as
 * `list_sessions` names it, and its state and own plan's count as the hub's
 * delegate list gave them at about 11:00 (plan-delegates.md).
 */
interface Holder {
  id: string;
  place: string;
  plan?: { done: number; total: number };
  /** A finished one's result, as the hub records it. */
  report?: string;
  /** Its state on the hub (delegate_list): running, done, or waiting on something. */
  status: "live" | "done" | "idle";
  title: string;
  /** What a waiting one waits on, in the hub's words. */
  wait?: string;
}

const WS = "/home/bewinxed/.worktrees";

/** The delegates holding the plan's steps, by their handles. */
const HOLDERS: Record<string, Holder> = {
  "cockpit-d67837a1#8b3d98bb": {
    id: "8b3d98bb-9fed-46fa-b56f-1738b9705714",
    title: "Use Vite default config loader",
    place: `${WS}/cockpit-d67837a1`,
    status: "done",
    report: "Landed eb62be7cb.",
  },
  "cockpit-cbd392e4#ba7f2542": {
    id: "ba7f2542-c908-494f-b819-6fe82609cf50",
    title: "Centre Caw in thread and Decisions heroes",
    place: `${WS}/cockpit-cbd392e4`,
    status: "done",
    report: "Landed 62ba67d31.",
  },
  "cockpit-1ffb3dd0#7991217d": {
    id: "7991217d-f33c-4cff-980d-af6fb6858721",
    title: "Build Decisions tab as list",
    place: `${WS}/cockpit-1ffb3dd0`,
    status: "live",
    plan: { done: 0, total: 5 },
  },
  "cockpit-36ef3dcd#381601da": {
    id: "381601da-fa50-4b7f-b43c-fc047c975af9",
    title: "Land relay router forwards card",
    place: `${WS}/cockpit-36ef3dcd`,
    status: "done",
    report: "Landed 8ef0b09da.",
  },
  "cockpit-6d91f23f#f25598a7": {
    id: "f25598a7-c742-4788-a89b-ddb71c156f06",
    title: "Fix Caw panel preview audit rows",
    place: `${WS}/cockpit-6d91f23f`,
    status: "live",
    plan: { done: 0, total: 10 },
  },
  "cockpit-5792bdf7#e8c38a3d": {
    id: "e8c38a3d-01e9-4640-8c4e-196cbc12807c",
    title: "Fix Workflows preview audit breaks",
    place: `${WS}/cockpit-5792bdf7`,
    status: "done",
    report: "Landed 1f1cb5d78.",
  },
  "cockpit-399853c2#05caa8f4": {
    id: "05caa8f4-e870-4a46-8060-d397cfb6d0e7",
    title: "Fix icons r4 and plan r8 previews",
    place: `${WS}/cockpit-399853c2`,
    status: "live",
  },
  "cockpit-346ad01f#8190c6cc": {
    id: "8190c6cc-d57e-4a45-9701-245256738eb9",
    title: "Fix design graph round 29 preview",
    place: `${WS}/cockpit-346ad01f`,
    status: "live",
    plan: { done: 0, total: 8 },
  },
  "cockpit-7fbc6b89#c2dee236": {
    id: "c2dee236-9251-4487-b52b-2e8d4676474e",
    title: "Build away clock and unseen mark",
    place: `${WS}/cockpit-7fbc6b89`,
    status: "live",
    plan: { done: 3, total: 6 },
  },
  "cockpit-10b3687f#2a6c2b31": {
    id: "2a6c2b31-44ef-41c2-8cc7-e38225334675",
    title: "Build Caw vector rig",
    place: `${WS}/cockpit-10b3687f`,
    status: "live",
    plan: { done: 1, total: 8 },
  },
  "cockpit-ee3554aa#4e27eb48": {
    id: "4e27eb48-0adb-488f-aeb0-ef5dd3afb1cf",
    title: "Redesign suggestion chips component",
    place: `${WS}/cockpit-ee3554aa`,
    status: "live",
    plan: { done: 0, total: 5 },
  },
  "cockpit-91de6abc#b92aaca1": {
    id: "b92aaca1-f57f-47b7-b448-920cd6d29a9b",
    title: "Fix any-folder delegate spec failures",
    place: `${WS}/cockpit-91de6abc`,
    status: "idle",
    wait: "Waiting on the parent's host and Mac runs",
  },
  "cockpit-e616815d#98320328": {
    id: "98320328-f118-4478-a65d-066030c9c1b6",
    title: "Fix stage 2 OpenCode pin leg",
    place: `${WS}/cockpit-e616815d`,
    status: "idle",
    wait: "Waiting on the parent's host run (pins rig)",
  },
  "cockpit-c148d558#debd12e4": {
    id: "debd12e4-eb18-4f47-b300-3adc065a3480",
    title: "Capture design-rule reach previews",
    place: `${WS}/cockpit-c148d558`,
    status: "live",
  },
  "cockpit-a7c95e33#2ce19ca2": {
    id: "2ce19ca2-0385-4a27-a513-986d600ca695",
    title: "Draw project page options preview",
    place: `${WS}/cockpit-a7c95e33`,
    status: "live",
    plan: { done: 0, total: 9 },
  },
  "cockpit-4d01a9b9#0f9bad32": {
    id: "0f9bad32-6182-4454-9a97-fc9abf4fc161",
    title: "Fix shaking preview panel scrollbars",
    place: `${WS}/cockpit-4d01a9b9`,
    status: "live",
    plan: { done: 0, total: 4 },
  },
  "cockpit-32cafa84#b1bc0497": {
    id: "b1bc0497-0659-49d3-8be2-5e385aba4f00",
    title: "Hang thread card from its pin",
    place: `${WS}/cockpit-32cafa84`,
    status: "live",
    plan: { done: 2, total: 11 },
  },
  "cockpit-c42ab0b5#2ff551ce": {
    id: "2ff551ce-d941-4c01-be97-0cfdf490f1f4",
    title: "Measure virtua cold-load prototype questions",
    place: `${WS}/cockpit-c42ab0b5`,
    status: "done",
    report: "Cold-load demo 7907b4dba.",
  },
  "cockpit-347ff80a#0a4a08c0": {
    id: "0a4a08c0-d55a-4c91-a3af-988cb565ea0a",
    title: "Show full pin exchange in transcript rows",
    place: `${WS}/cockpit-347ff80a`,
    status: "done",
    report: "Landed a8b89ef52.",
  },
  "bewinxed#e0db8835": {
    id: "e0db8835-da3c-4ea7-9378-e56e11859366",
    title: "Run compaction benchmark for real",
    place: "/home/bewinxed",
    status: "idle",
    plan: { done: 7, total: 13 },
    wait: "Waiting on account windows to reset",
  },
  "cockpit-31e523c2#5a6f9dcb": {
    id: "5a6f9dcb-96e8-4827-abb3",
    title: "Link-first chips in tool answers",
    place: `${WS}/cockpit-31e523c2`,
    status: "done",
    report: "Landed e560bf13c.",
  },
};

/** This preview's own leaf, the one delegate whose plan it reads step by step. */
const THIS_LEAF = "cockpit-399853c2#05caa8f4";
/** Its session id: the delegate the pulse is drawn on. */
export const LEAF_ID = (HOLDERS[THIS_LEAF] as Holder).id;

/**
 * This leaf's own plan, step by step, as it ran: the icons preview first,
 * then this plan view, then its report.
 */
const LEAF_STEPS = [
  "Icons: options side by side with count, Back symbol, house tokens, outline Pick",
  "Icons: real session and delegate names in tree/chips SVGs",
  "Icons: measure, captures + manifest, commit, push",
  "Plan: real plan content from session 23cb5219",
  "Plan: title bars, bare step glyphs, options in first view",
  "Plan: measure, captures + manifest, check, commit, push",
  "Report",
];

/** How far this leaf's plan had got at a moment: steps done, and the one under way. */
function leafSteps(done: number): SubStep[] {
  return LEAF_STEPS.map((words, index) => {
    let state: StepState = "todo";
    if (index < done) {
      state = "done";
    } else if (index === done) {
      state = "doing";
    }
    return { id: `l${index + 1}`, words, state };
  });
}

/**
 * A plan row: its id, its state in the hub's words, its text, and who
 * holds it (delegate handles, or "him" for the owner).
 */
type Row = [
  id: string,
  status: "pending" | "in_progress" | "completed",
  text: string,
  holders: string[],
];

const HIM = "him";

/** The plan as it stood, row for row (orchestrator-plan.md). */
const ROWS: Row[] = [
  [
    "sheet-loader",
    "in_progress",
    "Sheet Vite config loads with Vite's default loader (eb97f6e2a); host check queued; start-time failures stop restarting",
    ["cockpit-d67837a1#8b3d98bb"],
  ],
  [
    "his-cards",
    "pending",
    "Waiting on him: away-notes reminders and the catch-up, task to-do counts, pairing picks, cold-load build pick",
    [HIM],
  ],
  [
    "owed-sweep",
    "in_progress",
    "Starter cards lose per-item glyphs; Decisions tab becomes a list; tablet comments panel options; relay router change lands",
    [
      "cockpit-cbd392e4#ba7f2542",
      "cockpit-1ffb3dd0#7991217d",
      "cockpit-36ef3dcd#381601da",
    ],
  ],
  [
    "previews",
    "in_progress",
    "Five waiting previews fixed to today's rules, then shown with pictures",
    [
      "cockpit-6d91f23f#f25598a7",
      "cockpit-5792bdf7#e8c38a3d",
      "cockpit-399853c2#05caa8f4",
      "cockpit-346ad01f#8190c6cc",
    ],
  ],
  [
    "owner-presence",
    "in_progress",
    "Away clock 5 minutes and the plan ring's mark for unseen away notes",
    ["cockpit-7fbc6b89#c2dee236"],
  ],
  [
    "caw-rig",
    "in_progress",
    "Caw's vector rig: fixes, then an anatomy read, then his page",
    ["cockpit-10b3687f#2a6c2b31"],
  ],
  [
    "suggestions",
    "in_progress",
    "Reusable suggestions component: night Caw fix, then his page",
    ["cockpit-ee3554aa#4e27eb48"],
  ],
  [
    "any-folder",
    "in_progress",
    "Delegates in any folder: Mac copy fix, host and Mac checks",
    ["cockpit-91de6abc#b92aaca1"],
  ],
  [
    "release-blocked",
    "in_progress",
    "Release stage-2 OpenCode pin check fails; proof run queued on the host",
    ["cockpit-e616815d#98320328"],
  ],
  [
    "task-todos",
    "in_progress",
    "Criteria ticked when a task closes as met; host check queued",
    [],
  ],
  ["pairing", "in_progress", "Pairing screen ready; waits on his picks", [HIM]],
  [
    "design-rules-reach",
    "in_progress",
    "Pictures of the new title-bar and needs-you rules on today's screens",
    ["cockpit-c148d558#debd12e4"],
  ],
  [
    "project-page",
    "in_progress",
    "Project page options drawn on real tasks, then his decision page",
    ["cockpit-a7c95e33#2ce19ca2"],
  ],
  [
    "preview-shake",
    "in_progress",
    "Preview panel scrollbar shaking",
    ["cockpit-4d01a9b9#0f9bad32"],
  ],
  [
    "comment-card",
    "in_progress",
    "Comment card hangs from its pin like the top bar's cards",
    ["cockpit-32cafa84#b1bc0497"],
  ],
  [
    "cold-load",
    "in_progress",
    "Transcript cold-load demo gets transitions.dev's loading motion",
    ["cockpit-c42ab0b5#2ff551ce"],
  ],
  [
    "pin-hover",
    "in_progress",
    "Full pin reply in transcript rows (landed); resolve-without-text follow-up",
    ["cockpit-347ff80a#0a4a08c0"],
  ],
  [
    "false-interrupt",
    "completed",
    "Ctrl/Cmd+Enter never stops a turn (landed ca4b39f4a), ships next release",
    [],
  ],
  [
    "host-queue",
    "in_progress",
    "Host checks one at a time; results go to their builders",
    [],
  ],
  [
    "address",
    "pending",
    "Address setup design waits on the failure pattern pick",
    [HIM],
  ],
  ["console", "in_progress", "Console follow-ups queued", []],
  [
    "compaction-bench",
    "in_progress",
    "Compaction benchmark finishing without OpenCode",
    ["bewinxed#e0db8835"],
  ],
  [
    "perf",
    "in_progress",
    "Speed fixes: hub messages, page reads, tab return, canvases",
    [],
  ],
  [
    "plugin-agents",
    "in_progress",
    "OpenCode and pi long calls match Claude Code (landed)",
    [],
  ],
  [
    "chips",
    "in_progress",
    "Agents name tasks by chips",
    ["cockpit-31e523c2#5a6f9dcb"],
  ],
  [
    "github-connect",
    "in_progress",
    "GitHub connection ships with the next release",
    [],
  ],
  [
    "paused",
    "pending",
    "Paused on his word: questions page, stop-stays, comments on WebKit",
    [HIM],
  ],
  [
    "app-hold-owed",
    "pending",
    "iPhone and Mac app work owed once the hold lifts",
    [HIM],
  ],
];

/**
 * The steps that wait on another, as the plan's own words say: the pairing
 * picks and the cold-load build pick are among the cards waiting on him.
 */
const AFTER: Record<string, string[]> = {
  pairing: ["his-cards"],
  "cold-load": ["his-cards"],
};

/**
 * The plan's steps that are tasks of the project's own (task_read): the
 * address setup is tsk-26, the owed app work tsk-59.
 */
const TASKS: Record<string, { id: string; stage: string; title: string }> = {
  address: {
    id: "tsk-26",
    stage: "Ready",
    title: "Set up the cawco address as one tray led by caw the character",
  },
  "app-hold-owed": {
    id: "tsk-59",
    stage: "Ready",
    title: "Keep the owed app work until he lifts the iOS/Mac hold",
  },
};

/** A step's state from its hub status and who holds it: his are waiting on you. */
function stateOf(status: Row[1], holders: string[]): StepState {
  if (status === "completed") {
    return "done";
  }
  if (holders.includes(HIM)) {
    return "you";
  }
  return status === "in_progress" ? "doing" : "todo";
}

/** A step's name where another points at it: its id in the plan, as words. */
const shortOf = (id: string) => id.replaceAll("-", " ");

function delegateOf(handle: string, step: string, leafDone: number): Delegate {
  const held = HOLDERS[handle] as Holder;
  const leaf = handle === THIS_LEAF;
  const steps = leaf ? leafSteps(leafDone) : [];
  return {
    id: held.id,
    name: held.title,
    problem: held.title,
    place: held.place,
    plan: leaf
      ? { done: leafDone, total: LEAF_STEPS.length }
      : (held.plan ?? null),
    status: held.status,
    step,
    steps,
    wait: held.wait ? { kind: "slot", words: held.wait } : undefined,
    report: held.report,
  };
}

function at(leafDone: number): PlanFixture {
  const steps: Step[] = ROWS.map(([id, status, text, holders]) => {
    const carriers = holders.filter((one) => one !== HIM);
    return {
      id,
      words: text,
      short: shortOf(id),
      description: text,
      state: stateOf(status, holders),
      after: AFTER[id],
      delegates:
        carriers.length > 0
          ? carriers.map((one) => (HOLDERS[one] as Holder).id)
          : undefined,
      promoted: TASKS[id],
    };
  });
  const delegates = ROWS.flatMap(([id, , , holders]) =>
    holders
      .filter((one) => one !== HIM)
      .map((one) => delegateOf(one, id, leafDone))
  );
  return { steps, delegates, spec: { ago: "today", markdown: SPEC } };
}

/** How far this leaf's plan stood when the still frames were drawn. */
const LEAF_NOW = 5;

/** The plan every still frame draws. */
export const plan: PlanFixture = at(LEAF_NOW);

/** The live frame's beats: this leaf's own plan moving on, said under the frame. */
export const LIVE_BEATS = [
  "This leaf starts on the icons preview",
  "The icons preview is pushed; it starts on the plan view",
  "The plan view is drawn; it measures and captures it",
] as const;

const LEAF_AT_BEAT = [0, 3, LEAF_NOW] as const;

/** The live frame at a beat. Rows keep their ids, so what stays slides. */
export function livePlan(beat: number): PlanFixture {
  return at(LEAF_AT_BEAT[beat % LEAF_AT_BEAT.length] as number);
}
