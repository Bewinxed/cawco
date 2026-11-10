/**
 * Changed since you looked: the changes not looked at, their tour through the page, and what to check in the rail.
 */
import type { ActivityLine, Pin } from "@cawco/core/comments/model";
import type { ChangedItem } from "@cawco/core/doc-meta";
import { pinName } from "@cawco/core/pin-name";
import { untrack } from "svelte";
import { failureWords } from "#lib/platform/hub-read.js";
import { dur } from "#lib/platform/motion/curves.svelte.js";
import { askAgain } from "./artifact-doc";
import type { ChangeLine } from "./ChangeLines.svelte";
import type { PaneDoc } from "./pane-doc.svelte";
import type { PaneNotice } from "./pane-notice.svelte";
import type { PaneSubject } from "./pane-subject.svelte";
import type { PreviewFrame } from "./preview-frame.svelte";

interface PageStop {
  anchors: string[];
  pin: string | null;
}
/** One stop of the tag: what changed there, the pin standing with it, and its words. */
interface ChangeStop {
  anchors: string[];
  label: string;
  pin: string | null;
}
/** The page's stops as it said them, each a list of anchors and a pin or none; anything else left out. */
const changeStopsOf = (value: unknown): PageStop[] =>
  Array.isArray(value)
    ? value.flatMap((one: unknown) => {
        const stop = one as { anchors?: unknown; pin?: unknown } | null;
        return stop &&
          Array.isArray(stop.anchors) &&
          stop.anchors.every((anchor) => typeof anchor === "string") &&
          (stop.pin === null || typeof stop.pin === "string")
          ? [{ anchors: stop.anchors as string[], pin: stop.pin }]
          : [];
      })
    : [];
/** A changed thing as a line: what it is, its words then and now, its move, its revision, how often. */
export const lineOf = (item: ChangedItem): ChangeLine => ({
  element: item.element ?? item.label,
  after: item.after ?? item.label,
  anchor: item.anchor,
  ...(item.before === undefined ? {} : { before: item.before }),
  ...(item.moved ? { moved: item.moved } : {}),
  ...(item.revision === undefined ? {} : { revision: item.revision }),
  ...(item.times ? { times: item.times } : {}),
});
/** A thread's line, as the hub kept it (the doc's `activity`). */
export const lineOfActivity = (line: ActivityLine): ChangeLine => ({
  element: line.element,
  after: line.after,
  anchor: line.anchor,
  revision: line.revision,
  ...(line.before === undefined ? {} : { before: line.before }),
  ...(line.moved ? { moved: line.moved } : {}),
});
export interface ChangeTourDeps {
  readonly cardPin: () => Pin | null;
  readonly instanceId: () => string;
  readonly openCard: (id: string, via?: "key" | "pointer") => void;
  readonly paneDoc: PaneDoc;
  readonly paneNotice: PaneNotice;
  readonly paneSubject: PaneSubject;
  readonly previewFrame: PreviewFrame;
  readonly unread: () => ReadonlySet<string>;
}
export class ChangeTour {
  readonly #deps: ChangeTourDeps;

  /** Changed since you looked, over the page at the well's foot: told to the page as what covers it. */
  changesTag = $state<HTMLFieldSetElement>();

  /** How tall the page's own foot bar stands over its viewport's foot, px (`cawco:page-foot`): the tag stands above it. */
  pageFoot = $state(0);

  /*
   * Changed since you looked (PRD §5.7, "Pointing and what changed"): what
   * changed since he looked (the hub's `meta.changes`, carried across
   * revisions) less what he has looked at (the doc's `seen`), each ringed
   * on the page (`c-change-ring`); and the pins with an answer he hasn't
   * looked at. The tag at the well's top steps through them in the check
   * order, a pin and its changed element one stop: a step brings it out,
   * chooses it and pings its ring, and opens a pin's thread; each is seen
   * once its ping has played, and all of them on his Send (the hub's).
   */
  readonly unseenChanges = $derived.by((): ChangedItem[] => {
    const changes = this.#deps.paneDoc.view?.changes;
    const seen = this.#deps.paneDoc.view?.seen;
    return changes && seen
      ? changes.items.filter((item) => !seen.has(item.anchor))
      : [];
  });

  /** The stops as the page orders them (`cawco:change-stops`): each change's anchors and the pin standing with it. */
  pageStops = $state.raw<PageStop[]>([]);

  /** The stops not looked at yet, in the check order, then what was taken out (no box to ring). */
  readonly changeStops = $derived.by((): ChangeStop[] => {
    const labels = new Map(
      this.unseenChanges.map((item) => [item.anchor, item.label])
    );
    const pinLabel = (id: string) => {
      const pin = this.#deps.paneDoc.pins.find((one) => one.id === id);
      return pin ? `Pin ${pin.number} · ${pinName(pin)}` : "";
    };
    const told = new Set<string>();
    const stops: ChangeStop[] = [];
    for (const stop of this.pageStops) {
      const anchors = stop.anchors.filter((anchor) => labels.has(anchor));
      const pin =
        stop.pin && this.#deps.unread().has(stop.pin) ? stop.pin : null;
      for (const anchor of anchors) {
        told.add(anchor);
      }
      if (anchors.length > 0 || pin) {
        stops.push({
          anchors,
          pin,
          label: anchors[0]
            ? (labels.get(anchors[0]) ?? "")
            : pinLabel(pin ?? ""),
        });
      }
    }
    for (const item of this.unseenChanges) {
      if (!told.has(item.anchor)) {
        stops.push({ anchors: [item.anchor], pin: null, label: item.label });
      }
    }
    // In the rail's check order: what answers him, what changed under him
    // with no answer, then the rest; page order within each.
    const items = new Map(
      this.unseenChanges.map((item) => [item.anchor, item])
    );
    const rank = (stop: ChangeStop) => {
      const of = stop.anchors.map((anchor) => items.get(anchor));
      if (of.some((item) => item?.answered)) {
        return 0;
      }
      return of.some((item) => item?.pin) ? 1 : 2;
    };
    return stops
      .map((stop, at) => ({ stop, at, rank: rank(stop) }))
      .sort((a, b) => a.rank - b.rank || a.at - b.at)
      .map(({ stop }) => stop);
  });

  /** The stops as they stood at the first step: "k of N" counts them while he steps. */
  tour = $state.raw<ChangeStop[] | null>(null);

  tourAt = $state(0);

  /**
   * A step of the tag: by one stop each way, or the first when it starts;
   * brought out, chosen and seen. `via`, a key or a press: a pin's thread a
   * press opens wears no keyboard ring on its pill.
   */
  stepChange = (by: 1 | -1 | 0, via: "key" | "pointer") => {
    const stops = this.tour ?? this.changeStops;
    if (stops.length === 0) {
      return;
    }
    if (this.tour) {
      this.tourAt = (this.tourAt + by + stops.length) % stops.length;
    } else {
      this.tour = stops;
      this.tourAt = by === -1 ? stops.length - 1 : 0;
    }
    const stop = stops[this.tourAt];
    if (!stop) {
      return;
    }
    const [anchor] = stop.anchors;
    if (anchor && !anchor.startsWith("removed:")) {
      this.#deps.previewFrame.post({
        type: "cawco:show-element",
        selector: anchor,
        outline: "chosen",
      });
    }
    this.seeSoon(stop.anchors);
    if (stop.pin) {
      this.#deps.openCard(stop.pin, via);
    }
  };

  /*
   * What to check (the owner's pick, B: change lines in each thread, the
   * rail as the inbox), from what changed since he looked: the comments an
   * update answered, then those whose element changed with no answer, then
   * what changed under no comment. A row leaves as he looks at it: its
   * thread opened, its spot stepped to, a chip pressed.
   */
  readonly checking = $derived.by(() => {
    const held = new Set(this.#deps.paneDoc.pins.map((pin) => pin.id));
    const byPin = new Map<string, ChangedItem[]>();
    const unasked: ChangedItem[] = [];
    for (const item of this.unseenChanges) {
      if (item.pin && held.has(item.pin)) {
        byPin.set(item.pin, [...(byPin.get(item.pin) ?? []), item]);
      } else if (item.kind !== "removed") {
        unasked.push(item);
      }
    }
    const number = (id: string) =>
      this.#deps.paneDoc.pins.find((pin) => pin.id === id)?.number ?? 0;
    const order = [...byPin.keys()].sort((a, b) => number(a) - number(b));
    const answers = (id: string) =>
      (byPin.get(id) ?? []).some((item) => item.answered);
    return {
      byPin,
      unasked,
      pins: [
        ...order.filter((id) => answers(id)),
        ...order.filter((id) => !answers(id)),
      ],
    };
  });

  readonly checkCount = $derived(
    this.checking.pins.length + this.checking.unasked.length
  );

  /**
   * Whether an update changed what pin `pin` stands on and the agent never
   * answered it: a line of its own the update left unanswered, with no reply
   * of the agent's in its thread since.
   */
  readonly changedNoAnswer = (pin: Pin): boolean => {
    const lines = this.#deps.paneDoc.view?.activity[pin.id] ?? [];
    const replied = pin.thread.findLast((entry) => entry.by === "agent")?.at;
    return lines.some(
      (line) => !line.answered && (!replied || replied < line.at)
    );
  };

  /** The comments whose Ask again is on its way. */
  askingAgain = $state.raw<ReadonlySet<string>>(new Set());

  /** Looks written once their ping has played; the pane going before then writes them at once, so no look is lost. */
  readonly looks = new Set<{
    anchors: string[];
    revision: number;
    timer: ReturnType<typeof setTimeout>;
  }>();

  /** Every look still waiting on its ping, written now: the doc it goes in is about to be let go. */
  writeLooks = () => {
    for (const look of this.looks) {
      clearTimeout(look.timer);
      this.#deps.paneDoc.doc?.seeChanges(look.revision, look.anchors);
    }
    this.looks.clear();
  };

  /**
   * A change's spot brought out on the page (scrolled to, chosen, its ring
   * pinging), with its comment's thread open when one stands on it or it
   * answers one: a To check row, a change chip, the thread's own lines.
   */
  stepToChange = (anchor: string) => {
    const item = this.#deps.paneDoc.view?.changes?.items.find(
      (one) => one.anchor === anchor
    );
    const its =
      item?.pin ??
      Object.entries(this.#deps.paneDoc.view?.activity ?? {}).find(
        ([, lines]) => lines.some((line) => line.anchor === anchor)
      )?.[0];
    if (its && this.#deps.paneDoc.pins.some((pin) => pin.id === its)) {
      this.#deps.openCard(its, "pointer");
    }
    if (!anchor.startsWith("removed:")) {
      this.#deps.previewFrame.post({
        type: "cawco:show-element",
        selector: anchor,
        outline: "chosen",
      });
    }
    this.seeSoon([anchor]);
  };
  constructor(deps: ChangeTourDeps) {
    this.#deps = deps;
    $effect(() => {
      const anchors = this.unseenChanges
        .filter((item) => item.kind === "element" || item.kind === "card")
        .map((item) => item.anchor);
      const answered = [...this.#deps.unread()];
      if (this.#deps.previewFrame.connected) {
        untrack(() =>
          this.#deps.previewFrame.post({
            type: "cawco:changes",
            anchors,
            pins: answered,
          })
        );
      }
    });
    // Every stop looked at: the tag leaves, and the next revision starts afresh.
    $effect(() => {
      if (this.changeStops.length === 0 && this.tour) {
        this.tour = null;
      }
    });
    // The open thread is looked at: what changed under it leaves To check once its ring has pinged.
    $effect(() => {
      const pin = this.#deps.cardPin();
      const mine = pin ? (this.checking.byPin.get(pin.id) ?? []) : [];
      if (mine.length > 0) {
        untrack(() => this.seeSoon(mine.map((item) => item.anchor)));
      }
    });
  }

  /** The person pressed a ringed element in Interact mode: he has looked at it. */
  changePressed(anchor: unknown) {
    const revision = this.#deps.paneDoc.view?.changes?.revision;
    if (typeof anchor === "string" && revision !== undefined) {
      this.#deps.paneDoc.doc?.seeChanges(revision, [anchor]);
    }
  }

  /** A comment's Ask again: it goes to the session again, whole; once it went, what changed under it is looked at. */
  async askAgainPin(id: string) {
    if (!this.#deps.paneSubject.artifact || this.askingAgain.has(id)) {
      return;
    }
    this.askingAgain = new Set([...this.askingAgain, id]);
    try {
      await askAgain(
        this.#deps.instanceId(),
        this.#deps.paneSubject.artifact.id,
        id
      );
      this.seeSoon(
        (this.checking.byPin.get(id) ?? []).map((item) => item.anchor),
        0
      );
    } catch (error) {
      this.#deps.paneNotice.say({ message: failureWords(error), again: null });
    } finally {
      this.askingAgain = new Set(
        [...this.askingAgain].filter((one) => one !== id)
      );
    }
  }

  /**
   * These changes looked at, once their ring's ping has played (`--dur-loop`,
   * or `after` ms): the step that brought him there pings it, and a ring
   * looked at fades off, so the look is written after the ping, not over it.
   */
  seeSoon(anchors: string[], after = dur("--dur-loop")) {
    const revision = this.#deps.paneDoc.view?.changes?.revision;
    if (revision === undefined || anchors.length === 0) {
      return;
    }
    const look = {
      revision,
      anchors,
      timer: 0 as unknown as ReturnType<typeof setTimeout>,
    };
    look.timer = setTimeout(() => {
      this.looks.delete(look);
      this.#deps.paneDoc.doc?.seeChanges(revision, anchors);
    }, after);
    this.looks.add(look);
  }

  /** A To check row pressed: its thread opens, and its first change is brought out. */
  openChecked(id: string, via: "key" | "pointer") {
    const [first] = this.checking.byPin.get(id) ?? [];
    this.#deps.openCard(id, via);
    if (first && !first.anchor.startsWith("removed:")) {
      this.#deps.previewFrame.post({
        type: "cawco:show-element",
        selector: first.anchor,
        outline: "chosen",
      });
    }
  }

  /** The stops as the page orders them (`cawco:change-stops`). */
  heardStops(message: Record<string, unknown>) {
    this.pageStops = changeStopsOf(message.stops);
  }

  /** The page's own foot bar over the viewport's foot (its Send): Changed since you looked stands above it (`cawco:page-foot`). */
  heardFoot(message: Record<string, unknown>) {
    this.pageFoot =
      typeof message.px === "number" && Number.isFinite(message.px)
        ? Math.max(0, message.px)
        : 0;
  }
}
