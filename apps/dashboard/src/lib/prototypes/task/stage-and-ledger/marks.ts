/**
 * The glyph, word and hue each fact on the task takes (DESIGN.md, The
 * Glyph, Word, Hue Rule): a liveness, a wait's kind, a check's state. The
 * glyph changes shape as the state changes; the hue only follows it.
 */
import type { TaskWait } from "@cawco/core/task-views";
import type { StatusPair } from "@cawco/core/views";
import { taskStageLedgerWords as words } from "@cawco/core/words/task-stage-ledger";
import type { Component } from "svelte";
import type { SVGAttributes } from "svelte/elements";
import {
  IconAsk,
  IconClose,
  IconDecisions,
  IconFolderGit,
  IconHourglass,
  IconNeedsYou,
  IconNotYet,
  IconPause,
  IconPin,
  IconPlay,
  IconTaskList,
  IconTick,
  IconTranscript,
  IconTrash,
  IconWorking,
} from "#lib/icons.js";
import type { CheckLine, Liveness } from "./records";

type Glyph = Component<SVGAttributes<SVGSVGElement>>;

/** A mark's hue: one of the status glyph inks, or the muted ink. */
type Tone = StatusPair | "muted";

export interface Mark {
  glyph: Glyph;
  /** It breathes while it stands for live work (DESIGN.md, Live work breathes). */
  live: boolean;
  tone: Tone;
  word: string;
}

export const LIVENESS: Record<Liveness, Mark> = {
  needsYou: {
    glyph: IconNeedsYou,
    tone: "attn",
    live: false,
    word: words.liveness.needsYou,
  },
  working: {
    glyph: IconWorking,
    tone: "live",
    live: true,
    word: words.liveness.working,
  },
  asking: {
    glyph: IconAsk,
    tone: "attn",
    live: false,
    word: words.liveness.asking,
  },
  queued: {
    glyph: IconHourglass,
    tone: "muted",
    live: false,
    word: words.liveness.queued,
  },
  blocked: {
    glyph: IconHourglass,
    tone: "muted",
    live: false,
    word: words.liveness.blocked,
  },
  ready: {
    glyph: IconNotYet,
    tone: "muted",
    live: false,
    word: words.liveness.ready,
  },
  idle: {
    glyph: IconPause,
    tone: "muted",
    live: false,
    word: words.liveness.idle,
  },
  stopped: {
    glyph: IconPause,
    tone: "muted",
    live: false,
    word: words.liveness.stopped,
  },
  failed: {
    glyph: IconClose,
    tone: "fail",
    live: false,
    word: words.liveness.failed,
  },
  landing: {
    glyph: IconWorking,
    tone: "live",
    live: true,
    word: words.liveness.landing,
  },
  done: {
    glyph: IconTick,
    tone: "done",
    live: false,
    word: words.liveness.done,
  },
  dropped: {
    glyph: IconTrash,
    tone: "muted",
    live: false,
    word: words.liveness.dropped,
  },
};

export const WAIT_GLYPH: Record<TaskWait["kind"], Glyph> = {
  task: IconTaskList,
  card: IconDecisions,
  pin: IconPin,
  pr: IconFolderGit,
  run: IconPlay,
  session: IconTranscript,
};

export const CHECK: Record<CheckLine["state"], Mark> = {
  passed: {
    glyph: IconTick,
    tone: "done",
    live: false,
    word: words.checkPassed,
  },
  toCheck: {
    glyph: IconNotYet,
    tone: "muted",
    live: false,
    word: words.checkToCheck,
  },
  notShown: {
    glyph: IconClose,
    tone: "fail",
    live: false,
    word: words.checkNotShown,
  },
};
