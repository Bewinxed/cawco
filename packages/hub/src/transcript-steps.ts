/**
 * A session's steps as its transcript holds them: each tool call of its main
 * loop (`tool.use`, `tool.handoff` blocks, the hub's own fold of every
 * harness's frames, transcripts.ts), in words by the same reading the
 * dashboard draws a call's row from (core `describeTool`), and its latest
 * assistant text. What `delegate_list` with a `target` says a delegate is
 * doing (delegation-tree.ts `peek`).
 */

import { describeTool, type ToolStatus } from "@cawco/core/tool-presentation";
import type {
  TranscriptBlock,
  TranscriptPage,
} from "@cawco/core/transcript-types";

/** One tool call: the tool in words, what it was about, when, and how it ended. */
export interface Step {
  /** When the harness stored the call, ISO; absent when it gives no clock. */
  at?: string;
  status: ToolStatus;
  /** The file's path, the command, the query, the URL: what the call was about. */
  target?: string;
  /** The tool in words: "Read", "Searched the web", a Bash call's description. */
  tool: string;
}

/** What a run of transcript pages says of the session's steps. */
export interface StepsRead {
  /** A turn is in flight, as the newest page's tail says. */
  busy: boolean;
  /** The latest assistant text of its main loop, and when. */
  lastWords?: { at?: string; text: string };
  /** Every step the pages hold, newest first. */
  steps: Step[];
  /** The pages reach the conversation's start: no step is older than these. */
  whole: boolean;
}

/** The input fields that name a file, which a call's row shortens to its leaf: read whole here. */
const PATH_FIELDS = ["file_path", "filePath", "filename"] as const;

/** One call block as a step. */
const stepOf = (block: TranscriptBlock): Step => {
  const meta = block.metadata ?? {};
  const status = meta.toolStatus ?? "pending";
  const input = meta.toolInput ?? {};
  const sentence = describeTool(meta.toolName, input, undefined, status);
  const path = PATH_FIELDS.map((field) => input[field]).find(
    (value): value is string => typeof value === "string" && value.length > 0
  );
  const target = path ?? sentence.object;
  const tool = sentence.chip
    ? `${sentence.label} (${sentence.chip})`
    : sentence.label;
  return {
    tool: tool || meta.toolName || "a tool",
    status,
    ...(target && target !== sentence.label ? { target } : {}),
    ...(block.timestamp ? { at: block.timestamp } : {}),
  };
};

const isCall = (block: TranscriptBlock): boolean =>
  (block.type === "tool.use" || block.type === "tool.handoff") &&
  !block.parentToolUseId;

/** What `pages` (newest first, as they are read back) say of the session's steps. */
export const stepsOf = (pages: readonly TranscriptPage[]): StepsRead => {
  const blocks = pages.toReversed().flatMap((page) => page.blocks);
  const said = blocks.findLast(
    (block) =>
      block.type === "assistant" &&
      !block.parentToolUseId &&
      block.content.trim().length > 0
  );
  return {
    busy: pages[0]?.tail?.busy ?? false,
    steps: blocks.filter(isCall).map(stepOf).reverse(),
    ...(said
      ? {
          lastWords: {
            text: said.content.trim(),
            ...(said.timestamp ? { at: said.timestamp } : {}),
          },
        }
      : {}),
    whole: pages.at(-1)?.cursor === null,
  };
};

/** Whether `pages` already answer for `steps` steps and the last words: no older page is read. */
export const stepsEnough =
  (steps: number) =>
  (pages: readonly TranscriptPage[]): boolean => {
    const read = stepsOf(pages);
    return read.steps.length > steps && read.lastWords !== undefined;
  };
