/**
 * The tab's icon says what the fleet is doing, since it is what the operator
 * sees of CawCo while another tab is in front (favicon.now/guides/
 * animated-favicon: "Short-lived progress, recording, or urgent-state
 * indicators can be useful when the tab is backgrounded"):
 *
 * - something needs the operator (the home's Needs you): Caw's needs-you
 *   loops on a vermilion tile;
 * - else something is working: his working loops on a butter tile;
 * - else the icon the page was served with, and nothing runs: no clock, no
 *   canvas, no Rive ("always restore the canonical favicon", same guide).
 *
 * Under Reduced Motion each state is one drawing, his status's still on the
 * same tile, and no clock runs either.
 *
 * Caw is drawn 12 times a second, the pace his loops are held at (on twos),
 * so no drawing of his is skipped and none is made twice ("Keep frames and
 * updates infrequent", same guide).
 */
import { untrack } from "svelte";
import { fileBytes, riveRuntime } from "../home/Caw.svelte";
import { home } from "../home/home-state.svelte";
import { motionOk } from "../motion/curves.svelte";
import { openTile, type Tile } from "./tile";

/** The bitmap's side: the 16 px a tab draws, up to a 4x screen. */
const SIDE = 64;
/** Between two drawings, in ms: Caw's loops are held on twos of 24. */
const BEAT = 1000 / 12;

/** What the fleet is doing, as the icon tells it; `null` is nothing at all. */
type Doing = "needs-you" | "working" | null;

/** The token each state's tile is filled with. */
const TILE = { "needs-you": "--vermilion", working: "--spark" } as const;

function doing(): Doing {
  if (home.needs.length > 0) {
    return "needs-you";
  }
  return home.working.length > 0 ? "working" : null;
}

/** An attachment for the page's `<link rel="icon">`. */
export function tabIcon(link: HTMLLinkElement) {
  const resting = link.href;
  let asked = 0;
  let shown: { tile: Tile; clock?: Worker } | undefined;

  // The home's lists move often; the icon hears only a change of state.
  const status = $derived(doing());

  function drop() {
    shown?.clock?.terminate();
    shown?.tile.close();
    shown = undefined;
  }

  /** Draws `tile` on every beat of a worker's clock, by the time gone by. */
  function play(tile: Tile, first: string): Worker {
    let drawn = first;
    let last = performance.now();
    const clock = new Worker(new URL("./ticker.ts", import.meta.url), {
      type: "module",
    });
    clock.addEventListener("message", () => {
      const now = performance.now();
      // Beats that queued behind a busy page are one drawing, not a burst.
      if (now - last < BEAT / 2) {
        return;
      }
      const url = tile.draw((now - last) / 1000);
      last = now;
      if (url !== drawn) {
        drawn = url;
        link.href = url;
      }
    });
    clock.postMessage(BEAT);
    return clock;
  }

  /** Puts a state on the icon; what is shown stays until the new one is drawn. */
  async function show(next: Exclude<Doing, null>, moving: boolean) {
    asked += 1;
    const mine = asked;
    const tokens = getComputedStyle(document.documentElement);
    const [{ RuntimeLoader }, bytes] = await Promise.all([
      riveRuntime(),
      fileBytes(next),
    ]);
    const tile = await openTile(await RuntimeLoader.awaitInstance(), {
      bytes,
      colour: tokens.getPropertyValue(TILE[next]).trim(),
      radius: Number.parseFloat(tokens.getPropertyValue("--tab-icon-r")),
      side: SIDE,
      still: !moving,
    });
    if (mine !== asked) {
      tile.close();
      return;
    }
    drop();
    const first = tile.draw(0);
    link.href = first;
    shown = { tile, clock: moving ? play(tile, first) : undefined };
    if (next === "working") {
      // An ask is the likeliest change from here; its file waits in memory.
      fileBytes("needs-you").catch(() => {
        // Fetched again when something needs the operator.
      });
    }
  }

  function rest() {
    asked += 1;
    drop();
    link.href = resting;
  }

  $effect(() => {
    const next = status;
    if (!next) {
      untrack(rest);
      return;
    }
    const moving = motionOk.current;
    untrack(() => {
      show(next, moving).catch((error: unknown) => {
        console.error("[cawco] the tab icon was not drawn:", error);
      });
    });
  });

  return rest;
}
