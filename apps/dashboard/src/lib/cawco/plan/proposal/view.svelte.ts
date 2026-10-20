/**
 * One frame's own state: which rows stand open, which to-dos the person
 * ticked or agreed to, which step's page the phone has pushed, the clock
 * every running time counts on, and what the person changed in the plan:
 * a step reworded, moved, removed or added, a comment on its thread. Each
 * change is told to whoever conducts that step (`receiverOf`), and the step
 * shows their acknowledgement: sent, seen, then their reply. The backend
 * for it is built after the pick; here a frame plays the answers on a clock.
 */
import { getContext, setContext } from "svelte";
import { SvelteMap, SvelteSet } from "svelte/reactivity";
import { type Clock, tickingClock } from "#lib/cawco/motion/clock.svelte.js";
import {
  carriersOf,
  clockWords,
  counting,
  type PlanFixture,
  type Step,
  type StepState,
  type SubStep,
} from "./fixtures";

/** What the person did to a step, for the receiver's answer. */
export type Change =
  "reworded" | "moved" | "removed" | "added" | "ticked" | "commented";

/** Who hears a change: the step's conductor, and who else hears a line. */
export interface Receiver {
  /** Also told: the parent session, when a delegate conducts the step. */
  also?: string;
  to: string;
}

/** A step's acknowledgement: sent, seen, then the receiver's reply. */
export interface Ack extends Receiver {
  change: Change;
  phase: "sent" | "seen" | "replied";
  reply?: string;
}

/** One message on a step's thread. */
export interface Comment {
  /** The receiver answering, not the person. */
  answer?: boolean;
  by: string;
  text: string;
}

/** What a frame stands at as it starts: at rest, a step open, or one change already made. */
export type Scenario =
  "rest" | "opened" | "edited" | "commented" | "acknowledged";

export interface FrameView {
  acks: SvelteMap<string, Ack>;
  /** Steps the person added, at the foot of the plan. */
  added: Step[];
  /** Sub-steps the person added under a step, by its id. */
  addedSubs: SvelteMap<string, SubStep[]>;
  /** Proposed to-dos the person agreed to. */
  agreed: SvelteSet<string>;
  /** The plan's rows as the person has them: added, moved, reworded (a removed one stays, marked). */
  arrange: (steps: Step[]) => Step[];
  clock: Clock;
  /** A row the "after" chip just pointed at, lit for a moment. */
  lit: { id: string | null };
  /** Moves a step one place up or down among the plan's rows. */
  move: (steps: Step[], id: string, by: -1 | 1) => void;
  /** Folds standing open, by row id. */
  opened: SvelteSet<string>;
  /** The phone draws it: finger rows, and a pushed page for B and C. */
  phone: boolean;
  /** The phone's pushed page: a step's or a delegate's id. */
  pushed: { id: string | null };
  removed: SvelteSet<string>;
  stateOf: (id: string, state: StepState) => StepState;
  /** Tells a step's conductor what the person changed; its answer plays out. */
  tell: (step: Step, change: Change, comment?: string) => void;
  threads: SvelteMap<string, Comment[]>;
  ticked: SvelteSet<string>;
  timeOf: (
    id: string,
    state: StepState,
    startedAgo?: number,
    took?: string
  ) => string;
  toggle: (id: string) => void;
  /** Steps the person reworded: their words now. */
  words: SvelteMap<string, string>;
}

const KEY = Symbol("plan-frame");

/** This session, as a receiver's name: a line's first word. */
const THIS_SESSION = "This session";

/** A receiver's name mid-sentence: "this session" in lower case, a delegate's as it is. */
export const midSentence = (name: string): string =>
  name === THIS_SESSION ? "this session" : name;

/**
 * Who conducts a step: the delegate that carries it (its parent hears a
 * line), else this session, which on a task is the task's live attempt.
 */
export function receiverOf(plan: PlanFixture, step: Step): Receiver {
  const carrier = carriersOf(plan, step).find(
    (one) => one.status !== "done" && one.status !== "fail"
  );
  return carrier
    ? { to: carrier.name, also: THIS_SESSION }
    : { to: THIS_SESSION };
}

/** The receiver's answer to a change, in its own words. */
const REPLIES: Record<Change, string> = {
  reworded: "Updated my plan to match.",
  moved: "Taking it in that order.",
  removed: "Dropped it; nothing else depended on it.",
  added: "Added it; I'll take it after the step I'm on.",
  ticked: "Marked it done on my side too.",
  commented: "Will do; I'll work from that now.",
};

/** How long a receiver takes to see a change, then to answer it. Our call. */
const SEEN_MS = 900;
const REPLY_MS = 2600;

export function frameView(options: {
  loaded: number;
  phone: boolean;
  plan: () => PlanFixture;
  scenario?: Scenario;
}): FrameView {
  const opened = new SvelteSet<string>();
  const ticked = new SvelteSet<string>();
  const agreed = new SvelteSet<string>();
  const removed = new SvelteSet<string>();
  const words = new SvelteMap<string, string>();
  const acks = new SvelteMap<string, Ack>();
  const threads = new SvelteMap<string, Comment[]>();
  const addedSubs = new SvelteMap<string, SubStep[]>();
  const added = $state<Step[]>([]);
  const order = $state({ ids: null as string[] | null });
  const pushed = $state({ id: null as string | null });
  const lit = $state({ id: null as string | null });
  const clock = tickingClock(() =>
    options.plan().steps.some((step) => counting(step.state))
  );
  const stateOf = (id: string, state: StepState): StepState => {
    if (!ticked.has(id)) {
      return state;
    }
    return state === "done" ? "todo" : "done";
  };
  const arrange = (steps: Step[]): Step[] => {
    const all = [...steps, ...added];
    const ids = order.ids ?? all.map((step) => step.id);
    const placed = [
      ...ids.flatMap((id) => all.filter((step) => step.id === id)),
      ...all.filter((step) => !ids.includes(step.id)),
    ];
    // A removed step keeps its place, drawn as a line that says so (and
    // takes it back), so the receiver's answer has somewhere to land.
    return placed.map((step) => {
      const now = words.get(step.id);
      const more = addedSubs.get(step.id) ?? [];
      return now || more.length > 0
        ? {
            ...step,
            words: now ?? step.words,
            subs: [...(step.subs ?? []), ...more],
          }
        : step;
    });
  };
  const tell = (step: Step, change: Change, comment?: string) => {
    const who = receiverOf(options.plan(), step);
    acks.set(step.id, { ...who, change, phase: "sent" });
    setTimeout(() => {
      const now = acks.get(step.id);
      if (now?.change === change && now.phase === "sent") {
        acks.set(step.id, { ...now, phase: "seen" });
      }
    }, SEEN_MS);
    setTimeout(() => {
      const now = acks.get(step.id);
      if (now?.change !== change) {
        return;
      }
      const reply = REPLIES[change];
      acks.set(step.id, { ...now, phase: "replied", reply });
      if (comment !== undefined) {
        threads.set(step.id, [
          ...(threads.get(step.id) ?? []),
          { by: who.to, text: reply, answer: true },
        ]);
      }
    }, REPLY_MS);
  };
  const view: FrameView = {
    acks,
    added,
    addedSubs,
    agreed,
    arrange,
    clock,
    lit,
    move: (steps, id, by) => {
      const ids = arrange(steps).map((step) => step.id);
      const at = ids.indexOf(id);
      const to = at + by;
      if (at < 0 || to < 0 || to >= ids.length) {
        return;
      }
      [ids[at], ids[to]] = [ids[to] as string, ids[at] as string];
      order.ids = ids;
    },
    opened,
    phone: options.phone,
    pushed,
    removed,
    stateOf,
    tell,
    threads,
    ticked,
    timeOf: (id, state, startedAgo, took) => {
      const now = stateOf(id, state);
      if (now === "done" || now === "failed") {
        return took ?? "";
      }
      if (counting(now) && startedAgo !== undefined) {
        return clockWords(clock.now - (options.loaded - startedAgo));
      }
      return "";
    },
    toggle: (id) => {
      if (opened.has(id)) {
        opened.delete(id);
      } else {
        opened.add(id);
      }
    },
    words,
  };
  seed(view, options.plan(), options.scenario ?? "rest");
  setContext(KEY, view);
  return view;
}

/**
 * The stories' states: a step open; a to-do reworded and seen by this
 * session; a step a delegate carries commented on, sent; the same comment
 * answered.
 */
function seed(view: FrameView, plan: PlanFixture, scenario: Scenario): void {
  const step = (id: string) => plan.steps.find((one) => one.id === id);
  if (scenario === "opened") {
    // The date picker open to its description, its sub-steps and its delegate.
    view.opened.add("a2");
    return;
  }
  if (scenario === "edited") {
    const booking = step("a6");
    if (booking) {
      view.words.set(
        "a6",
        "Book a class end to end on the iPhone, deposit and all"
      );
      view.acks.set("a6", {
        ...receiverOf(plan, booking),
        change: "reworded",
        phase: "seen",
      });
    }
    return;
  }
  if (scenario === "commented" || scenario === "acknowledged") {
    const picker = step("a2");
    if (!picker) {
      return;
    }
    const who = receiverOf(plan, picker);
    const asked: Comment = {
      by: "You",
      text: "Read closed_days only; the tide site is wrong on bank holidays.",
    };
    view.opened.add("a2");
    if (scenario === "commented") {
      view.threads.set("a2", [asked]);
      view.acks.set("a2", { ...who, change: "commented", phase: "sent" });
      return;
    }
    const reply =
      "Will do: closed_days only. I've told the calendar check to skip the tide site.";
    view.threads.set("a2", [asked, { by: who.to, text: reply, answer: true }]);
    view.acks.set("a2", {
      ...who,
      change: "commented",
      phase: "replied",
      reply,
    });
  }
}

export const useView = (): FrameView => getContext<FrameView>(KEY);

/**
 * Points the person at a step another one waits on: scrolls it into its
 * scroller's view and lights it a moment (the hover ghost's landing).
 */
export function pointAt(view: FrameView, from: HTMLElement, id: string): void {
  const frame = from.closest('[data-slot="plan"]');
  const row = frame?.querySelector<HTMLElement>(`[data-row="${id}"]`);
  if (!row) {
    return;
  }
  row.scrollIntoView({ block: "nearest", behavior: "smooth" });
  view.lit.id = id;
  setTimeout(() => {
    if (view.lit.id === id) {
      view.lit.id = null;
    }
  }, 1200);
}
