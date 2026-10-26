/**
 * A list of rows grouped by machine that changes what it shows as one relay
 * (relay-plan.ts, as data): the old lines leave top down toward the side
 * away from the choice, each new line arrives the moment the old line in its
 * place has gone, and each box's height is driven (motion/relay-boxes) so an
 * old line never overflows into the box below. The home's Working/Finished
 * list and the usage page's Where it goes run it. Made as its component
 * starts; the component binds `list` and draws `drawn`.
 */
import { flushSync } from "svelte";
import { dur, motionOk } from "../motion/curves.svelte";
import { IN_MS, ListSwap } from "../motion/list-swap.svelte";
import {
  boxHeights,
  driveHeights,
  onScreen,
  waitForBoxes,
} from "../motion/relay-boxes";
import { reflowsFrom, reread } from "../motion/rows.svelte";
import {
  type Arrival,
  type MoreLine,
  planRelay,
  type RelayGroup,
  type RelayLine,
} from "./relay-plan";

type Kind = "stay" | "new" | "gone";

/** One change in flight: what leaves, what arrives, when. */
export interface RelayState<G> {
  /** Each arriving line's place in the cascade, and the earliest it may start. */
  enter: Map<string, Arrival>;
  /** Machines whose old rows leave in place of new ones (a layer over them). */
  layered: Set<string>;
  /** Each leaving line's place in the cascade. */
  leave: Map<string, number>;
  /** The groups drawn before the change, as they were drawn. */
  old: G[];
}

/** One change: what the list will show, and the state that shows it. */
export interface Change<R, G, L, X> {
  /** Changes the state, in the frame the relay starts. */
  apply: () => void;
  /** The groups the changed state draws. */
  fresh: G[];
  /** What else the plan keeps of what is drawn now. */
  keep: X;
  /** A leaving line as the list draws it. */
  line: (line: RelayLine<R>) => L;
  /** The "N more" lines either side of the change. */
  more: MoreLine[];
  /** Once every line has arrived and the plan is let go. */
  settled?: () => void;
}

export class GroupRelay<
  R extends { id: string },
  G extends RelayGroup<R>,
  L extends RelayLine<R>,
  X extends object,
> {
  plan = $state.raw<(RelayState<G> & X) | null>(null);
  readonly swap = new ListSwap<L>();
  list = $state<HTMLElement>();
  #heights: Animation[] = [];
  #settle: ReturnType<typeof setTimeout> | undefined;
  readonly #groups: () => G[];
  readonly #place: (machineId: string) => number;
  readonly #boxes: string;
  readonly #screen: string;

  /** What is drawn: every machine either side of a change, in one order. */
  readonly drawn = $derived.by(() => {
    const live = new Map(this.#groups().map((g) => [g.machineId, g]));
    const old = new Map((this.plan?.old ?? []).map((g) => [g.machineId, g]));
    const ids = [...new Set([...old.keys(), ...live.keys()])].sort(
      (a, b) => this.#place(a) - this.#place(b)
    );
    return ids.map((id) => {
      const fresh = live.get(id);
      const was = old.get(id);
      let kind: Kind = "stay";
      if (this.plan && !was) {
        kind = "new";
      } else if (!fresh) {
        kind = "gone";
      }
      return {
        group: (fresh ?? was) as G,
        rows: fresh?.rows ?? [],
        gone: this.swap.leaving.filter((line) => line.machineId === id),
        kind,
      };
    });
  });

  /**
   * `groups`: what the list shows now; `place`: a machine's place in the
   * list; `boxes`: the boxes whose heights a change drives, from the list;
   * `screen`: the boxes whose lines can be on screen.
   */
  constructor(options: {
    groups: () => G[];
    place: (machineId: string) => number;
    boxes: string;
    screen: string;
  }) {
    this.#groups = options.groups;
    this.#place = options.place;
    this.#boxes = options.boxes;
    this.#screen = options.screen;
  }

  /**
   * Changes what the list shows, as one relay: `change.apply` changes the
   * state, and every line, header and height moves from what is drawn this
   * frame to what that state draws.
   */
  relay(dir: number, change: Change<R, G, L, X>): void {
    const { list } = this;
    const before = list
      ? boxHeights(list, this.#boxes)
      : new Map<string, number>();
    // Mid-change, only what is on screen this frame is drawn: a line not
    // yet arrived, or still below its opening box, has nothing to leave.
    const seen = this.plan && list ? onScreen(list, this.#screen) : null;
    const drawnNow = (key: string) => !seen || seen.has(key);
    // What is drawn now: the groups as they stand, mid-change or not. A
    // group already closing has said its goodbye; it is not said twice.
    const old: G[] = this.drawn
      .filter((entry) => entry.kind !== "gone")
      .map((entry) => ({
        ...entry.group,
        rows: entry.rows.filter((row) => drawnNow(row.id)),
      }));
    this.#stopHeights();

    const relayed = planRelay(old, change.fresh, change.more, drawnNow);
    const base = {
      ...change.keep,
      layered: relayed.layered,
      leave: relayed.leave,
      old,
    };
    const lines = relayed.lines.map(change.line);
    const moving = motionOk.current;

    // The list's reflow, and every one around it, lets go of every place:
    // from here this owns them.
    reread(reflowsFrom(list ?? null));
    flushSync(() => {
      this.plan = { ...base, enter: relayed.enter };
      this.swap.swap(lines, dir, { keep: lines.length });
      change.apply();
    });

    let done = dur("--dur-panel");
    if (list && moving) {
      const driven = driveHeights(list, this.#boxes, before, relayed.lastOut);
      this.#heights = driven.runs;
      const enter = waitForBoxes(driven.opened, relayed.enter);
      done = Math.max(
        driven.done,
        ...relayed.lastOut.values(),
        ...[...enter.values()].map(
          (at) => ListSwap.enterAt(at.i, at.notBefore) + IN_MS
        )
      );
      flushSync(() => {
        this.plan = { ...base, enter };
      });
    }

    this.swap.hold(moving ? done : 0);
    clearTimeout(this.#settle);
    this.#settle = setTimeout(
      () => {
        // The leaving lines go in this same task as everything else the
        // change lets go of, so the reflows around the list hear it once,
        // after they have read where it all stands (`reread`, below).
        flushSync(() => {
          this.plan = null;
          change.settled?.();
          this.swap.release();
        });
        // Done: every box is at its natural height; a closed one lets go.
        this.#stopHeights();
        // Let go: the list and every box around it stand at their own
        // heights now, with no change to the DOM their reflows would hear.
        reread(reflowsFrom(this.list ?? null));
      },
      moving ? done : 0
    );
  }

  #stopHeights(): void {
    for (const run of this.#heights) {
      run.cancel();
    }
    this.#heights = [];
  }

  /** A line's arrival in the swap, as an `animation` value; none when it does not move. */
  enterAnim = (key: string): string | undefined => {
    const at = this.plan?.enter.get(key);
    return at ? this.swap.rowAnim(at.i, at.notBefore) : undefined;
  };

  /** A line's leaving, as an `animation` value; none when it does not leave. */
  leaveAnim = (key: string): string | undefined => {
    const at = this.plan?.leave.get(key);
    return at === undefined ? undefined : this.swap.leaveAnim(at);
  };

  /**
   * A header's motion: arriving with a new machine, leaving with a gone
   * one; gone before it ever arrived (a switch mid-change), it has none and
   * is unseen (`headUnseen`).
   */
  headAnim = (kind: Kind, id: string): string | undefined => {
    const key = `head:${id}`;
    return kind === "gone" ? this.leaveAnim(key) : this.enterAnim(key);
  };

  headUnseen = (kind: Kind, id: string): boolean =>
    kind === "gone" && !this.plan?.leave.has(`head:${id}`);
}
