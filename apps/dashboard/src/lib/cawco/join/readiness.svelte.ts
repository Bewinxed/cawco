/**
 * Whether a machine that just joined can take agents yet, as its joined row
 * says it. A Mac needs Xcode, its terms accepted, and two automation grants
 * before agents can build on it; any other machine is ready once it joins.
 * The row names only the next thing the Mac needs, or that it is ready.
 */
import type { Component } from "svelte";
import {
  IconInfo,
  IconLock,
  IconNeedsYou,
  IconSuccess,
  IconToolQuestion,
} from "#lib/icons.js";

export type Readiness =
  | { kind: "not-mac" }
  /** `since` is when the check started; the row shows it as a wait only past --dur-wait-grace. */
  | { kind: "checking"; since: number }
  | { kind: "ready" }
  /** A permission prompt is on the Mac's screen (SSH sessions or CawCo's agent asking for Xcode). */
  | { kind: "allow" }
  /** Someone clicked Don't Allow on that prompt. */
  | { kind: "said-no" }
  /** Xcode's first-launch setup or its licence is still to accept. */
  | { kind: "xcode-terms" }
  | { kind: "locked" }
  | { kind: "offline" }
  | { kind: "no-xcode" };

export type ReadinessKind = Readiness["kind"];

/**
 * The glyph's hue, the one place a state is tinted: done only for the
 * verdict Ready, attn when the Mac needs a hand, none otherwise.
 */
export type ReadinessHue = "done" | "attn" | null;

export interface ReadinessLine {
  /** A Solar duotone glyph, or the spinner while a check outlasts its grace. */
  glyph: Component | "spinner";
  hue: ReadinessHue;
  /** What the Mac needs done there, in muted meta under the sentence. */
  instruction?: string;
  /** The sentence after the machine's name; it ends in the verdict. */
  rest: string;
}

/** The plain joined line: no verdict yet, or none to give. */
const JOINED: ReadinessLine = {
  glyph: IconSuccess,
  hue: null,
  rest: "joined the fleet.",
};

/** The row for each state; `checking` reads as JOINED until its grace has passed. */
export function readinessLine(
  readiness: Readiness,
  waited: boolean
): ReadinessLine {
  switch (readiness.kind) {
    case "not-mac":
      return JOINED;
    case "checking":
      return waited
        ? {
            glyph: "spinner",
            hue: null,
            rest: "joined. Checking it's ready for agents.",
            instruction: "It keeps checking if you close this.",
          }
        : JOINED;
    case "ready":
      return {
        glyph: IconSuccess,
        hue: "done",
        rest: "joined the fleet. Ready for agents.",
      };
    case "allow":
      return {
        glyph: IconNeedsYou,
        hue: "attn",
        rest: "joined. One thing to allow on the Mac.",
        instruction:
          "A prompt is on its screen. Click Allow; this updates by itself.",
      };
    case "said-no":
      return {
        glyph: IconNeedsYou,
        hue: "attn",
        rest: "joined. The Mac said no to Xcode.",
        instruction:
          "Allow it in Privacy & Security › Automation. This updates by itself.",
      };
    case "xcode-terms":
      return {
        glyph: IconNeedsYou,
        hue: "attn",
        rest: "joined. One thing to do on the Mac.",
        instruction:
          "Open Xcode once and accept its terms. This updates by itself.",
      };
    case "locked":
      return {
        glyph: IconLock,
        hue: null,
        rest: "joined. Its screen is locked.",
        instruction: "Unlock the Mac to see what to allow.",
      };
    case "offline":
      return {
        glyph: IconToolQuestion,
        hue: null,
        rest: "joined, but it's offline now.",
        instruction: "The check runs again when it's back.",
      };
    case "no-xcode":
      return {
        glyph: IconInfo,
        hue: null,
        rest: "joined. It has no Xcode.",
        instruction:
          "Agents can work on it now. Apple apps need Xcode from the App Store.",
      };
    default:
      return readiness satisfies never;
  }
}

const source = $state<{ staged: Readiness }>({ staged: { kind: "not-mac" } });

/**
 * Each joined machine's readiness. No daemon reports it yet, so every machine
 * reads as not a Mac and its row says only that it joined. The motion bench
 * stages a state to draw the real dialog in it.
 */
export const macReadiness = {
  of(_machineId: string | null): Readiness {
    return source.staged;
  },
  stage(readiness: Readiness): void {
    source.staged = readiness;
  },
};
