/**
 * One frame's own state: which rows stand open, which to-dos the person
 * ticked or agreed to, which step's page the phone has pushed, and the
 * clock every running time counts on. Each frame makes one (`frameView`)
 * from what it freezes at, so the person can open and close everything.
 */
import { getContext, setContext } from "svelte";
import { SvelteSet } from "svelte/reactivity";
import { type Clock, tickingClock } from "#lib/cawco/motion/clock.svelte.js";
import {
  clockWords,
  counting,
  type PlanFixture,
  type StepState,
} from "./fixtures";

export interface FrameView {
  /** Proposed to-dos the person agreed to. */
  agreed: SvelteSet<string>;
  clock: Clock;
  /** A row the "after" chip just pointed at, lit for a moment. */
  lit: { id: string | null };
  /** Folds standing open, by row id. */
  opened: SvelteSet<string>;
  /** The phone draws it: finger rows, and a pushed page for B and C. */
  phone: boolean;
  /** The phone's pushed page: a step's or a delegate's id. */
  pushed: { id: string | null };
  stateOf: (id: string, state: StepState) => StepState;
  ticked: SvelteSet<string>;
  timeOf: (
    id: string,
    state: StepState,
    startedAgo?: number,
    took?: string
  ) => string;
  toggle: (id: string) => void;
}

const KEY = Symbol("plan-frame");

export function frameView(options: {
  loaded: number;
  phone: boolean;
  plan: () => PlanFixture;
}): FrameView {
  const opened = new SvelteSet<string>();
  const ticked = new SvelteSet<string>();
  const agreed = new SvelteSet<string>();
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
  const view: FrameView = {
    agreed,
    clock,
    lit,
    opened,
    phone: options.phone,
    pushed,
    stateOf,
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
  };
  setContext(KEY, view);
  return view;
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
