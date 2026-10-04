/**
 * The tab's icon says whether the operator is needed, since it is what they
 * see of CawCo while another tab is in front (favicon.now/guides/
 * animated-favicon: "Short-lived progress, recording, or urgent-state
 * indicators can be useful when the tab is backgrounded"). It is Caw's head
 * on a rounded tile, and it moves only for what the operator has to look at
 * (owner: "it shouldn't animate if there's nothing the USER has to pay
 * attention to"):
 *
 * - something needs the operator (the home's Needs you): his pleading head
 *   bobs on a vermilion tile, the one state that moves;
 * - else something is working: his head, awake, still on butter;
 * - else his head asleep, still on butter: the icon the page is served with.
 *
 * A still is a picture drawn ahead by `bun run tab-icon`, so showing one
 * runs nothing: no clock, no canvas, no Rive ("always restore the canonical
 * favicon", same guide). Under Reduced Motion every state is its still.
 *
 * Moving, Caw is drawn 12 times a second, the pace his loops are held at (on
 * twos), so no drawing of his is skipped and none is made twice ("Keep
 * frames and updates infrequent", same guide), and each beat shows the
 * drawing the time gone by asks for, so he keeps his pace however late a
 * beat lands (css-tricks.com/the-making-of-an-animated-favicon: "detect how
 * much time has actually passed between each frame").
 */
import { untrack } from "svelte";
import needsYouStill from "#lib/assets/brand/tab-icon-needs-you.png";
import sleepingStill from "#lib/assets/brand/tab-icon-sleeping.png";
import workingStill from "#lib/assets/brand/tab-icon-working.png";
import { fileBytes, riveRuntime } from "../home/Caw.svelte";
import { home } from "../home/home-state.svelte";
import { motionOk } from "../motion/curves.svelte";
import { NEEDS_YOU } from "./shots";
import { openTile, type Tile } from "./tile";

/** The bitmap's side: the 16 px a tab draws, up to a 4x screen. */
const SIDE = 64;
/** Drawings a second: Caw's loops are held on twos of 24. */
const PACE = 12;
/** The drawings in the needs-you bob. */
const BEATS = (NEEDS_YOU.to - NEEDS_YOU.from) / 2;

/** What the fleet is doing, as the icon tells it. */
type Doing = "needs-you" | "working" | "sleeping";

/** Each state's still. */
const STILL: Record<Doing, string> = {
  "needs-you": needsYouStill,
  working: workingStill,
  sleeping: sleepingStill,
};

/** The icon every page is served with: nothing going on. */
export const RESTING_TAB_ICON = sleepingStill;

function doing(): Doing {
  if (home.needs.length > 0) {
    return "needs-you";
  }
  return home.working.length > 0 ? "working" : "sleeping";
}

/** An attachment for the page's `<link rel="icon">`. */
export function tabIcon(link: HTMLLinkElement) {
  let asked = 0;
  let moving: { tile: Tile; clock: Worker } | undefined;

  // The home's lists move often; the icon hears only a change of state.
  const status = $derived(doing());

  /** Shows a state's still, and with it stops whatever was moving. */
  function still(state: Doing) {
    asked += 1;
    moving?.clock.terminate();
    moving?.tile.close();
    moving = undefined;
    link.href = STILL[state];
  }

  /** Bobs his head on a worker's clock; his still stands until he is drawn. */
  async function plead() {
    still("needs-you");
    const mine = asked;
    const tokens = getComputedStyle(document.documentElement);
    const [{ RuntimeLoader }, bytes] = await Promise.all([
      riveRuntime(),
      fileBytes("needs-you"),
    ]);
    const tile = await openTile(await RuntimeLoader.awaitInstance(), {
      bytes,
      colour: tokens.getPropertyValue(`--${NEEDS_YOU.tile}`).trim(),
      radius: Number.parseFloat(tokens.getPropertyValue("--tab-icon-r")),
      shot: NEEDS_YOU,
      side: SIDE,
    });
    if (mine !== asked) {
      tile.close();
      return;
    }
    const began = performance.now();
    let beat = -1;
    const clock = new Worker(new URL("./ticker.ts", import.meta.url), {
      type: "module",
    });
    clock.addEventListener("message", () => {
      const now =
        Math.floor(((performance.now() - began) / 1000) * PACE) % BEATS;
      // Beats that queued behind a busy page are one drawing, not a burst.
      if (now === beat) {
        return;
      }
      beat = now;
      link.href = tile.draw(NEEDS_YOU.from + beat * 2);
    });
    clock.postMessage(1000 / PACE);
    moving = { tile, clock };
  }

  $effect(() => {
    const state = status;
    if (state === "needs-you" && motionOk.current) {
      untrack(() => {
        plead().catch((error: unknown) => {
          console.error("[cawco] the tab icon did not move:", error);
        });
      });
      return;
    }
    untrack(() => still(state));
  });

  return () => still("sleeping");
}
