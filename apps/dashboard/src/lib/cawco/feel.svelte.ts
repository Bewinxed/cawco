/**
 * What the reader hears and feels as the composer moves: Cuelume's sounds,
 * synthesized live, and web-haptics on a touch screen (the Vibration API on
 * Android; on iOS Safari, which has none, the system tick of a switch it
 * toggles out of sight).
 *
 * Sound is the reader's to turn on (`sound`, off until they do), kept in
 * this browser. Touch has no setting: it only ever answers a finger, on a
 * coarse pointer, where there is a hand to feel it.
 *
 * Both libraries load on the first press or key, never with the page, and
 * Cuelume's audio graph (its context, its noise, its room) is built while
 * idle right after, with an inaudible play: built on the first real cue it
 * cost the frame that cue landed in (the wheel's open handler, 4ms with the
 * graph warm, took 76ms cold).
 */
import { MediaQuery } from "svelte/reactivity";
import { readJson, writeJson } from "./storage";

type Cuelume = typeof import("cuelume");
type Haptics = InstanceType<typeof import("web-haptics").WebHaptics>;

const KEY = "cawco-sound";

/** The reader's sound setting, read once and kept in step with the switch. */
export const sound = $state({ on: readJson<boolean>(KEY, false) === true });

let cue: Cuelume | null = null;
let haptics: Haptics | null = null;
const touch = new MediaQuery("(pointer: coarse)");

/** Turns sound on or off, here and for every later visit. */
export function setSound(on: boolean): void {
  sound.on = on;
  writeJson(KEY, on);
  cue?.setEnabled(on);
  if (on) {
    warm();
  }
}

/** Builds Cuelume's audio graph off the critical path, inaudibly. */
function warm(): void {
  const idle = window.requestIdleCallback ?? ((run) => setTimeout(run, 0));
  idle(() => {
    if (sound.on) {
      cue?.play("select", { volume: 0.0001 });
    }
  });
}

function load(): void {
  removeEventListener("pointerdown", load, true);
  removeEventListener("keydown", load, true);
  Promise.all([import("cuelume"), import("web-haptics")]).then(
    ([sounds, touches]) => {
      cue = sounds;
      cue.setEnabled(sound.on);
      haptics = new touches.WebHaptics();
      warm();
    },
    (error: unknown) => {
      // Without them the composer is only quiet: nothing it does waits on a cue.
      console.warn("[feel] sound and touch did not load", error);
    }
  );
}

if (typeof window !== "undefined") {
  addEventListener("pointerdown", load, true);
  addEventListener("keydown", load, true);
}

/** Each moment, the sound it plays and the touch it gives. */
const CUES = {
  /** The wheel landing on another entry: a detent, toward older or newer. */
  detent: { sound: "select", touch: "selection" },
  /** A held press bringing the wheel up under the finger. */
  hold: { sound: "open", touch: "medium" },
  open: { sound: "open", touch: null },
  close: { sound: "close", touch: null },
  /** A queued message's words lifted into the composer. */
  take: { sound: "select", touch: "light" },
  /** And given back to their bubble. */
  "give back": { sound: "close", touch: "light" },
} as const;

/**
 * Plays one moment, always subtle: these accompany a gesture, they never
 * announce one. `toward` shapes a detent's pitch, rising toward older.
 */
export function felt(
  moment: keyof typeof CUES,
  toward?: "older" | "newer"
): void {
  const { sound: name, touch: tap } = CUES[moment];
  try {
    cue?.play(name, {
      emphasis: "subtle",
      ...(toward ? { direction: toward === "older" ? "forward" : "back" } : {}),
    });
    if (tap && touch.current) {
      // biome-ignore lint/complexity/noVoid: a tap is fire-and-forget; its promise only says the pattern ended
      void haptics?.trigger(tap);
    }
  } catch {
    // A cue that cannot play is silence, never a broken gesture.
  }
}
