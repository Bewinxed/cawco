/**
 * The glyph each kind of entry stands on in the record's lead column, and
 * the glyph and tone of each liveness word (DESIGN.md, The Glyph, Word, Hue
 * Rule: glyph, then word, then hue). Solar bold duotone through the house
 * barrel; a state that changes changes its shape as well as its colour.
 */
import type { StatusPair } from "@cawco/core/views";
import type { Component } from "svelte";
import type { SVGAttributes } from "svelte/elements";
import {
  IconArchive,
  IconArrowRight,
  IconAsk,
  IconChat,
  IconError,
  IconFolderGit,
  IconHourglass,
  IconNeedsYou,
  IconNotYet,
  IconPause,
  IconPen,
  IconPlay,
  IconPlus,
  IconResult,
  IconShield,
  IconStopped,
  IconTick,
  IconWorking,
} from "#lib/icons.js";
import type { Entry, TaskView } from "./model";

type Glyph = Component<SVGAttributes<SVGSVGElement>>;
/** A glyph's ink: a status pair's, or the muted ink. */
export type Tone = StatusPair | "muted";

/** An entry's glyph, and the tone it is drawn in. */
export const entryGlyph = (entry: Entry): { glyph: Glyph; tone: Tone } => {
  switch (entry.kind) {
    case "filed":
      return { glyph: IconPlus, tone: "muted" };
    case "changed":
      return { glyph: IconPen, tone: "muted" };
    case "moved":
      return { glyph: IconArrowRight, tone: "muted" };
    case "attempt":
      return entry.endedAt === null
        ? { glyph: IconWorking, tone: "live" }
        : { glyph: IconPlay, tone: "muted" };
    case "ask":
      return entry.answer === null
        ? { glyph: IconNeedsYou, tone: "attn" }
        : { glyph: IconAsk, tone: "muted" };
    case "ended":
      return entry.how === "failed"
        ? { glyph: IconError, tone: "fail" }
        : { glyph: IconStopped, tone: "muted" };
    case "handed":
      return { glyph: IconResult, tone: "muted" };
    case "refused":
      return { glyph: IconError, tone: "fail" };
    case "comment":
      return { glyph: IconChat, tone: "muted" };
    case "landed":
      return { glyph: IconFolderGit, tone: "done" };
    case "dropped":
      return { glyph: IconArchive, tone: "muted" };
    default:
      return { glyph: IconShield, tone: "muted" };
  }
};

/** A liveness word's glyph and tone. */
export const liveGlyph = (
  live: TaskView["live"]
): { glyph: Glyph; tone: Tone } => {
  switch (live) {
    case "needsYou":
    case "asking":
      return { glyph: IconNeedsYou, tone: "attn" };
    case "working":
    case "landing":
      return { glyph: IconWorking, tone: "live" };
    case "queued":
      return { glyph: IconHourglass, tone: "muted" };
    case "blocked":
      return { glyph: IconNotYet, tone: "muted" };
    case "ready":
      return { glyph: IconPlay, tone: "muted" };
    case "failed":
      return { glyph: IconError, tone: "fail" };
    case "stopped":
      return { glyph: IconStopped, tone: "muted" };
    case "landed":
      return { glyph: IconTick, tone: "done" };
    case "dropped":
      return { glyph: IconArchive, tone: "muted" };
    case "idle":
      return { glyph: IconPause, tone: "muted" };
    default:
      return { glyph: IconPause, tone: "muted" };
  }
};

/** A check's glyph by its state. */
export const checkGlyph = (
  state: "passed" | "notShown" | "toCheck" | "notRun"
): { glyph: Glyph; tone: Tone } => {
  switch (state) {
    case "passed":
      return { glyph: IconTick, tone: "done" };
    case "notShown":
      return { glyph: IconError, tone: "fail" };
    case "toCheck":
    case "notRun":
      return { glyph: IconNotYet, tone: "muted" };
    default:
      return { glyph: IconNotYet, tone: "muted" };
  }
};

/** The ink class of a tone. */
export const TONE_INK: Record<Tone, string> = {
  muted: "text-ink-muted",
  attn: "text-status-attn-glyph",
  fail: "text-status-fail-glyph",
  done: "text-status-done-glyph",
  live: "text-status-live-glyph",
};
