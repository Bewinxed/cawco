/**
 * The tab's icon says whether the operator is needed, since it is what they
 * see of CawCo while another tab is in front (favicon.now/guides/
 * animated-favicon: "Short-lived progress, recording, or urgent-state
 * indicators can be useful when the tab is backgrounded"). It is Caw's head
 * on a rounded butter tile, and it moves only for what the operator has to
 * look at (owner: "it shouldn't animate if there's nothing the USER has to
 * pay attention to"):
 *
 * - something needs the operator (the home's Needs you): Caw waves a wing at
 *   them beside his head (owner: "like hey pay attention"), the one state
 *   that moves;
 * - else something is working: his head, awake, still;
 * - else his head asleep, still: the icon the page is served with.
 *
 * Every picture is drawn ahead from Caw's own files by `bun run tab-icon`,
 * so the page draws nothing and loads no Rive for its icon. A still runs
 * nothing at all: no clock, no canvas ("always restore the canonical
 * favicon", same guide). Under Reduced Motion every state is its still.
 *
 * Moving is swapping the icon's href between the wave's drawings ("JavaScript
 * can swap icon URLs", same guide; css-tricks.com/the-making-of-an-animated-
 * favicon assigns a PNG data URL as the href), 12 times a second: the pace
 * his loops are held at, on twos, so no drawing of his is skipped and none is
 * shown twice ("Keep frames and updates infrequent"). Each beat shows the
 * drawing the time gone by asks for, so he keeps his pace however late a beat
 * lands (css-tricks, same page: "detect how much time has actually passed
 * between each frame").
 */
import { untrack } from "svelte";
import needsYouStill from "#lib/assets/brand/tab-icon-needs-you.png";
import needsYouWave from "#lib/assets/brand/tab-icon-needs-you-wave.png";
import sleepingStill from "#lib/assets/brand/tab-icon-sleeping.png";
import workingStill from "#lib/assets/brand/tab-icon-working.png";
import { home } from "../home/home-state.svelte";
import { motionOk } from "../motion/curves.svelte";

/** Drawings a second: Caw's loops are held on twos of 24. */
const PACE = 12;

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

/**
 * The wave's drawings, each a PNG data URL: its strip of square drawings cut
 * up once, the first time something needs the operator.
 */
let wave: Promise<string[]> | undefined;
function waveDrawings(): Promise<string[]> {
  wave ??= (async () => {
    const strip = new Image();
    strip.src = needsYouWave;
    await strip.decode();
    const side = strip.height;
    const canvas = document.createElement("canvas");
    canvas.width = side;
    canvas.height = side;
    const context = canvas.getContext("2d");
    if (!context) {
      throw new Error("The tab icon has no 2D canvas");
    }
    return Array.from({ length: strip.width / side }, (_, i) => {
      context.clearRect(0, 0, side, side);
      context.drawImage(strip, -i * side, 0);
      return canvas.toDataURL("image/png");
    });
  })();
  // A strip that did not load is asked for again next time.
  wave.catch(() => {
    wave = undefined;
  });
  return wave;
}

/** An attachment for the page's `<link rel="icon">`. */
export function tabIcon(link: HTMLLinkElement) {
  let asked = 0;
  let clock: Worker | undefined;

  // The home's lists move often; the icon hears only a change of state.
  const status = $derived(doing());

  /** Shows a state's still, and with it stops his wave. */
  function still(state: Doing) {
    asked += 1;
    clock?.terminate();
    clock = undefined;
    link.href = STILL[state];
  }

  /** Waves on a worker's clock; his still stands until the strip is in. */
  async function hail() {
    still("needs-you");
    const mine = asked;
    const drawings = await waveDrawings();
    if (mine !== asked) {
      return;
    }
    const began = performance.now();
    let beat = -1;
    clock = new Worker(new URL("./ticker.ts", import.meta.url), {
      type: "module",
    });
    clock.addEventListener("message", () => {
      const now =
        Math.floor(((performance.now() - began) / 1000) * PACE) %
        drawings.length;
      // Beats that queued behind a busy page are one drawing, not a burst.
      if (now === beat) {
        return;
      }
      beat = now;
      link.href = drawings[beat];
    });
    clock.postMessage(1000 / PACE);
  }

  $effect(() => {
    const state = status;
    if (state === "needs-you" && motionOk.current) {
      untrack(() => {
        hail().catch((error: unknown) => {
          console.error("[cawco] the tab icon did not move:", error);
        });
      });
      return;
    }
    untrack(() => still(state));
  });

  return () => still("sleeping");
}
