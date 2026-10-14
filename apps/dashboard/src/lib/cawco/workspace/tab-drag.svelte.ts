/**
 * A tab dragged by the pointer moves the tab itself, as a browser's tab
 * strip does (owner: "right now it just shows a stale capture, which
 * captures a bit of the adjacent tab, it should work like the tab drag
 * rearrange in chrome"). No snapshot, no drag image, no ghost: the real tab
 * lifts out of the stack, follows the pointer 1:1 along its strip, clamped
 * to the strip's ends, its rim and feet with it, and its neighbours slide
 * into the slot it leaves as its middle passes theirs. Let go, it settles
 * into its slot and the order is written once; Escape, or the press being
 * taken away, sends everything back where it was.
 *
 * Pointer events, one path, a mouse's or a pen's. A finger's press on a tab
 * is its scroll, its pull and its held menu (PaneTabs `pullMenu`), and a
 * coarse pointer offers no drag at all (dnd.svelte.ts).
 *
 * Carried off its strip, the tab stays in it where the pointer's x puts it,
 * every neighbour back in its place, and the drop is what lies under the
 * pointer, with that target's own hint: another group's strip takes it at
 * the place the pointer is between its tabs; a group's pane splits at its
 * edge or takes it into its tabs (dnd.svelte.ts `paneEdgeAt`); anywhere
 * else it goes back.
 *
 * Motion: the tab follows the pointer with no easing, as a hand moves it.
 * Its neighbours, and the tab's settle on release, move on the strip's own
 * slide (`--dur-panel`, `--ease-drawer`, PaneTabs `slide`): a neighbour's
 * as a transition of `translate` it can take over mid-way, the release as
 * the strip's FLIP of the order it writes, every moving tab on one clock.
 * With less motion nothing eases: the neighbours stand in their slots at
 * once, and so does the tab once let go.
 */

import type { Edge } from "@atlaskit/pragmatic-drag-and-drop-hitbox/types";
import { flushSync } from "svelte";
import { motionOk } from "../motion/curves.svelte";
import {
  clearHints,
  coarse,
  dropInStrip,
  dropOnPane,
  paneEdgeAt,
  showPaneHint,
  showTabHint,
  stripIndexAt,
} from "./dnd.svelte";
import { workspace } from "./workspace.svelte";

/**
 * How far a pressed tab travels before it is a drag, px. Our own call: a
 * click that wobbles a pixel or two still chooses, and the tab answers well
 * before the hand has moved a tab's pad.
 */
const START = 4;
/** How near a scrolling strip's end the pointer scrolls it, px. */
const EDGE = 32;
/** The fastest that scroll goes, at the very end, px a frame. */
const SCROLL_MAX = 12;

/** What a drop here would do. */
type Target =
  | { kind: "strip" }
  | { kind: "pane"; leafId: string; edge: Edge | null }
  | { kind: "group"; leafId: string; index: number }
  | { kind: "none" };

export interface TabDrag {
  leafId: string;
  /** Heard as the tab lifts: anything its press would otherwise open shuts. */
  onlift: () => void;
  sessionId: string;
}

/** The session a strip's tab element stands for. */
const idOf = (tab: Element) =>
  tab.querySelector("[data-session-tab]")?.getAttribute("data-session-tab") ??
  "";

/** A strip's tabs that are in its order now (not one leaving), in that order. */
function tabsOf(track: Element, order: string[]): HTMLElement[] {
  const byId = new Map<string, HTMLElement>();
  for (const el of track.children) {
    if (el instanceof HTMLElement && el.classList.contains("tab")) {
      byId.set(idOf(el), el);
    }
  }
  return order.flatMap((id) => byId.get(id) ?? []);
}

/**
 * A press on a tab: a drag once it travels past `START`, else left to be the
 * click it is. Called from the tab's `pointerdown`.
 */
export function pressTab(event: PointerEvent, drag: TabDrag): void {
  if (
    event.button !== 0 ||
    !event.isPrimary ||
    event.pointerType === "touch" ||
    coarse()
  ) {
    return;
  }
  const tab = event.currentTarget as HTMLElement;
  const x0 = event.clientX;
  const y0 = event.clientY;
  const pointer = event.pointerId;
  const armed = new AbortController();
  window.addEventListener(
    "pointermove",
    (e) => {
      if (
        e.pointerId === pointer &&
        Math.hypot(e.clientX - x0, e.clientY - y0) > START
      ) {
        armed.abort();
        carry(tab, drag, pointer, x0, e);
      }
    },
    { signal: armed.signal }
  );
  const disarm = (e: PointerEvent) => {
    if (e.pointerId === pointer) {
      armed.abort();
    }
  };
  window.addEventListener("pointerup", disarm, { signal: armed.signal });
  window.addEventListener("pointercancel", disarm, { signal: armed.signal });
}

/** The tab is a drag: it lifts and follows the pointer until let go. */
function carry(
  tab: HTMLElement,
  drag: TabDrag,
  pointer: number,
  x0: number,
  first: PointerEvent
): void {
  const track = tab.closest<HTMLElement>(".ff-tabs-list");
  const strip = tab.closest<HTMLElement>("[data-strip]");
  const order = workspace.leaf(drag.leafId)?.tabs ?? [];
  if (!(track && strip && order.includes(drag.sessionId))) {
    return;
  }
  const tabs = tabsOf(track, order);
  // A slide still playing lands now, so every tab is measured where it rests.
  for (const el of tabs) {
    for (const run of el.getAnimations()) {
      if (run.id === "tab-slide") {
        run.finish();
      }
    }
  }
  const scroll0 = track.scrollLeft;
  const ids = tabs.map(idOf);
  const from = ids.indexOf(drag.sessionId);
  /** Each tab's left edge and width at rest, in the track's content. */
  const rest = new Map(
    tabs.map((el) => {
      const r = el.getBoundingClientRect();
      return [idOf(el), { left: r.left + scroll0, width: r.width }] as const;
    })
  );
  const overlap =
    Number.parseFloat(getComputedStyle(track).getPropertyValue("--overlap")) ||
    0;
  const at = (id: string) => rest.get(id) ?? { left: 0, width: 0 };
  const own = at(drag.sessionId);
  const firstLeft = at(ids[0] ?? "").left;
  const last = at(ids.at(-1) ?? "");
  /** How far the tab may move each way, so it stays within the strip's ends. */
  const least = firstLeft - own.left;
  const most = last.left + last.width - (own.left + own.width);
  const others = ids.filter((id) => id !== drag.sessionId);
  /**
   * Each other tab's middle at rest: the line the dragged tab's middle
   * crosses. Clamped at the strip's ends, a tab wider than the end tab
   * beside it would never bring its middle past that tab's: there the line
   * stands just inside where its middle can go, so every slot is reachable.
   */
  const centre = own.left + own.width / 2;
  const middles = others.map((id) =>
    Math.min(
      centre + most - 0.5,
      Math.max(centre + least + 0.5, at(id).left + at(id).width / 2)
    )
  );

  /** Each tab's left edge with the dragged one at `slot` among the rest. */
  const layout = (slot: number) => {
    const next = [...others];
    next.splice(slot, 0, drag.sessionId);
    const lefts = new Map<string, number>();
    let x = firstLeft;
    for (const id of next) {
      lefts.set(id, x);
      x += at(id).width - overlap;
    }
    return lefts;
  };

  let offset = 0;
  let index = from;
  let target: Target = { kind: "strip" };
  let px = first.clientX;
  let py = first.clientY;
  let frame = 0;

  drag.onlift();
  tab.setPointerCapture(pointer);
  tab.toggleAttribute("data-lifted", true);
  tab.toggleAttribute("data-following", true);
  track.toggleAttribute("data-reordering", true);

  /** The other tabs stand where the dragged one at `to` puts them. */
  const arrange = (to: number) => {
    const lefts = layout(to);
    tabs.forEach((el, i) => {
      const id = ids[i] as string;
      if (id === drag.sessionId) {
        return;
      }
      const shift = (lefts.get(id) ?? 0) - at(id).left;
      el.style.translate = Math.abs(shift) < 0.5 ? "" : `${shift}px 0`;
    });
  };

  /** What lies under the pointer, off the strip. */
  const targetAt = (x: number, y: number): Target => {
    const s = strip.getBoundingClientRect();
    if (x >= s.left && x <= s.right && y >= s.top && y <= s.bottom) {
      return { kind: "strip" };
    }
    const hit = document.elementFromPoint(x, y);
    const other = hit?.closest<HTMLElement>("[data-strip]");
    const otherId = other?.dataset.strip;
    if (other && otherId && otherId !== drag.leafId) {
      const otherTrack = other.querySelector(".ff-tabs-list");
      const otherTabs = otherTrack
        ? tabsOf(otherTrack, workspace.leaf(otherId)?.tabs ?? [])
        : [];
      return {
        kind: "group",
        leafId: otherId,
        index: stripIndexAt(otherTabs, x),
      };
    }
    const pane = hit?.closest<HTMLElement>("[data-drop-leaf]");
    const paneId = pane?.dataset.dropLeaf;
    if (pane && paneId) {
      return {
        kind: "pane",
        leafId: paneId,
        edge: paneEdgeAt(paneId, pane, { clientX: x, clientY: y }, drag.leafId),
      };
    }
    return { kind: "none" };
  };

  const place = () => {
    offset = Math.min(
      most,
      Math.max(least, px - x0 + track.scrollLeft - scroll0)
    );
    tab.style.translate = `${offset}px 0`;
    target = targetAt(px, py);
    const middle = centre + offset;
    const to =
      target.kind === "strip"
        ? middles.filter((line) => line < middle).length
        : from;
    if (to !== index) {
      index = to;
      arrange(index);
    }
    if (target.kind === "pane") {
      showPaneHint(target.leafId, target.edge);
    } else if (target.kind === "group") {
      showTabHint(target.leafId, target.index);
    } else {
      clearHints();
    }
  };

  /** Near a scrolling strip's end, the strip scrolls under the pointer. */
  const scroll = () => {
    frame = requestAnimationFrame(scroll);
    if (target.kind !== "strip" || track.scrollWidth <= track.clientWidth) {
      return;
    }
    const t = track.getBoundingClientRect();
    const into = Math.max(t.left + EDGE - px, px - (t.right - EDGE));
    if (into <= 0) {
      return;
    }
    const step = SCROLL_MAX * Math.min(1, into / EDGE);
    const was = track.scrollLeft;
    track.scrollLeft = was + (px < t.left + t.width / 2 ? -step : step);
    if (track.scrollLeft !== was) {
      place();
    }
  };

  const listening = new AbortController();
  const { signal } = listening;
  const end = () => {
    listening.abort();
    cancelAnimationFrame(frame);
    clearHints();
  };

  /** Everything back to rest, every tab with its translate gone. */
  const rested = () => {
    track.removeAttribute("data-reordering");
    for (const el of tabs) {
      el.style.removeProperty("translate");
    }
    tab.removeAttribute("data-following");
  };

  /** The lift lets go once the tab's own settle has landed. */
  const setDown = () => {
    requestAnimationFrame(() => {
      const runs = tab.getAnimations().filter((run) => run.id === "tab-slide");
      Promise.all(runs.map((run) => run.finished.catch(() => undefined))).then(
        () => tab.removeAttribute("data-lifted")
      );
    });
  };

  /** Escape, a lost press, a drop on nothing: every tab goes back. */
  const goBack = () => {
    end();
    // The tab takes the neighbours' transition for its way home.
    tab.removeAttribute("data-following");
    for (const el of tabs) {
      el.style.translate = "";
    }
    const runs = motionOk.current
      ? tabs.flatMap((el) =>
          el
            .getAnimations()
            .filter(
              (run) =>
                run instanceof CSSTransition &&
                run.transitionProperty === "translate"
            )
        )
      : [];
    Promise.all(runs.map((run) => run.finished.catch(() => undefined))).then(
      () => {
        rested();
        tab.removeAttribute("data-lifted");
      }
    );
  };

  /** Let go: the order is written once, or the drop goes where it points. */
  const release = () => {
    end();
    swallowClick(tab);
    if (target.kind === "strip") {
      if (index === from) {
        goBack();
        return;
      }
      // Written with every tab still drawn where it stands, so the strip's
      // FLIP reads those places and slides each one on from there; the
      // translates go in the same task, before anything paints.
      flushSync(() => dropInStrip(drag.leafId, index, drag.sessionId, tab));
      rested();
      setDown();
      return;
    }
    if (target.kind === "none") {
      goBack();
      return;
    }
    // Off to another group: the flight starts where the tab is drawn now.
    flushSync(() => {
      if (target.kind === "pane") {
        dropOnPane(
          target.leafId,
          target.edge,
          drag.sessionId,
          drag.leafId,
          tab
        );
      } else if (target.kind === "group") {
        dropInStrip(target.leafId, target.index, drag.sessionId, tab);
      }
    });
    if (workspace.leaf(drag.leafId)?.tabs.includes(drag.sessionId)) {
      // The group refused it (a split past the layout's limit): it goes back.
      goBack();
      return;
    }
    // The tab leaves from where it is drawn; the rest close up from theirs.
    track.removeAttribute("data-reordering");
    for (const el of tabs) {
      if (el !== tab) {
        el.style.removeProperty("translate");
      }
    }
  };

  window.addEventListener(
    "pointermove",
    (e) => {
      if (e.pointerId === pointer) {
        px = e.clientX;
        py = e.clientY;
        place();
      }
    },
    { signal }
  );
  window.addEventListener(
    "pointerup",
    (e) => {
      if (e.pointerId === pointer) {
        release();
      }
    },
    { signal }
  );
  window.addEventListener(
    "pointercancel",
    (e) => {
      if (e.pointerId === pointer) {
        goBack();
      }
    },
    { signal }
  );
  tab.addEventListener("lostpointercapture", goBack, { signal });
  window.addEventListener(
    "keydown",
    (e) => {
      if (e.key === "Escape") {
        e.preventDefault();
        e.stopPropagation();
        goBack();
        // The button still held lands on the tab as a click: it is not one.
        window.addEventListener("pointerup", () => swallowClick(tab), {
          once: true,
        });
      }
    },
    { capture: true, signal }
  );
  place();
  frame = requestAnimationFrame(scroll);
}

/** The click a drag's release would send the tab is not one. */
function swallowClick(node: HTMLElement) {
  const swallow = (event: MouseEvent) => {
    event.preventDefault();
    event.stopPropagation();
  };
  node.addEventListener("click", swallow, { capture: true, once: true });
  setTimeout(() => node.removeEventListener("click", swallow, true), 400);
}
