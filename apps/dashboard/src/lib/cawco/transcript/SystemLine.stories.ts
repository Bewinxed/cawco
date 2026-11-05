/**
 * The hub's lines about a session's context in its transcript (Component
 * Story Format 3, the live component): its filing at the threshold as it
 * runs, once filed with what it wrote, once stopped, and its harness
 * compacting it on its own, with or without a filing first. Each is built
 * as the transcript builds it: core `contextWords.line` over the stored
 * line (core context-filing.ts), its title the folded line and its detail
 * what opens under it, drawn open.
 */
import type { ContextLine, FilingWrote } from "@cawco/core/context-filing";
import { CONTEXT_LINE } from "@cawco/core/harness";
import { contextWords } from "@cawco/core/words/context";
import type { Message } from "../types";
import SystemLine from "./SystemLine.svelte";

/** A 200K Claude session at 137,000 tokens, Claude Code compacting it at 167,000. */
const FILL = { tokens: 137_000, compactsAt: 167_000 };
const WROTE_NOTHING: FilingWrote = {
  notes: 0,
  spec: false,
  steps: 0,
  tasks: 0,
  todos: 0,
};

/** `line` as the transcript draws it (core transcript-rules.ts `CONTEXT_LINE`). */
const said = (line: ContextLine): { message: Message } => {
  const { title, detail } = contextWords.line(line);
  return {
    message: {
      id: `context-${title}`,
      instanceId: "session",
      type: "ui.system_note",
      content: detail,
      metadata: {
        subtype: CONTEXT_LINE,
        noteKind: contextWords.noteKind,
        noteTitle: title,
      },
    },
  };
};

export default {
  title: "Transcript/Context lines",
  component: SystemLine,
  args: {
    disclosed: { get: () => true, set: () => undefined },
    ...said({
      kind: "filing",
      fill: FILL,
      harness: "claude",
      stage: "filed",
      wrote: { ...WROTE_NOTHING, steps: 4, spec: true, tasks: 1, notes: 1 },
    }),
  },
};

/** Its open items filed, and what its filing turn wrote. */
export const Filed = {};

/** Filing its open items: what is sent to it waits for that turn. */
export const Filing = {
  args: said({
    kind: "filing",
    fill: FILL,
    harness: "claude",
    stage: "filing",
  }),
};

/** Filed, its turn writing nothing new. */
export const FiledNothingNew = {
  args: said({
    kind: "filing",
    fill: { tokens: 60_000, compactsAt: 83_616 },
    harness: "pi",
    stage: "filed",
    wrote: WROTE_NOTHING,
  }),
};

/** Its filing stopped before its turn ended. */
export const FilingStopped = {
  args: said({
    kind: "filing",
    fill: { tokens: 60_000, compactsAt: 84_000 },
    harness: "opencode",
    stage: "stopped",
  }),
};

/** Its harness compacted it on its own, its open items filed first. */
export const CompactedFiledFirst = {
  args: said({
    kind: "compacted",
    filed: "filed",
    harness: "claude",
    tokens: 970_000,
    trigger: "auto",
  }),
};

/** Its harness compacted it on its own with nothing filed first. */
export const CompactedNothingFiled = {
  args: said({
    kind: "compacted",
    filed: null,
    harness: "claude",
    tokens: 199_000,
    trigger: "auto",
  }),
};
