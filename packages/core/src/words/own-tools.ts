/**
 * Configure › Helpers & step lists and its two first-run steps (core
 * own-tools.ts): whether sessions use CawCo's delegates and plan list, or
 * their agent's own subagents, to-do list and plan mode.
 */
import type { HarnessKind } from "../harness/kinds";
import type { Helpers, StepLists } from "../own-tools";

/** One side of a switch: its name and what it gets the person. */
export interface OwnToolOption<T extends string> {
  line: string;
  name: string;
  value: T;
}

/** What a switch's pick means on one agent: it keeps its own tool, is denied it, or has none. */
export type OwnToolState = "allowed" | "denied" | "none";

/** One agent's line beside a switch: its own tools by their names, and what the pick does to them. */
export interface OwnToolLine {
  harness: HarnessKind;
  state: OwnToolState;
  tools: string;
}

const HELPER_OPTIONS = [
  {
    value: "delegates",
    name: "CawCo's delegates",
    line: "Each is a separate session on the board, with its own workspace and branch, on any agent or model. Its commits land. It reads the code again before it starts work.",
  },
  {
    value: "subagents",
    name: "The agent's own subagents",
    line: "Quick helpers inside the session, sharing its workspace and shown in its transcript. They end with the session, and work that lands still goes to a delegate.",
  },
] as const satisfies readonly OwnToolOption<Helpers>[];

const STEP_LIST_OPTIONS = [
  {
    value: "cawco",
    name: "CawCo's plan list",
    line: "The session's steps, on the board and the phone. Your edits reach the session at its next step.",
  },
  {
    value: "agent",
    name: "The agent's own to-do list and plan mode",
    line: "The agent keeps its own list, and CawCo shows it only as tool calls in the transcript. Claude Code asks you before it leaves plan mode.",
  },
] as const satisfies readonly OwnToolOption<StepLists>[];

/** An option name's leading "The", lowercased mid-line. */
const LEADING_THE = /^The /u;

const nameOf = <T extends string>(
  options: readonly OwnToolOption<T>[],
  value: T
): string =>
  // Mid-line after a colon, so "The agent's own …" reads "the agent's own …".
  (options.find((option) => option.value === value)?.name ?? value).replace(
    LEADING_THE,
    "the "
  );

export const ownToolsWords = {
  recommended: "Recommended",
  saving: "Saving…",
  saved: "Saved",
  notSaved: "Not saved",

  helpers: {
    heading: "Helpers",
    options: HELPER_OPTIONS,
    /** Each agent's own subagent tools, by the names it calls them. */
    lines: (picked: Helpers): OwnToolLine[] => {
      const state: OwnToolState = picked === "subagents" ? "allowed" : "denied";
      return [
        { harness: "claude", tools: "Agent and Task", state },
        { harness: "opencode", tools: "subagent", state },
        {
          harness: "codex",
          tools: "spawn_agent and its other collaboration tools",
          state,
        },
        {
          harness: "pi",
          tools: "Always uses CawCo's delegates",
          state: "none",
        },
      ];
    },
  },

  stepLists: {
    heading: "Step lists",
    options: STEP_LIST_OPTIONS,
    lines: (picked: StepLists): OwnToolLine[] => {
      const state: OwnToolState = picked === "agent" ? "allowed" : "denied";
      return [
        {
          harness: "claude",
          tools: "TodoWrite, the Task list and plan mode",
          state,
        },
        { harness: "opencode", tools: "The plan agent", state },
        { harness: "codex", tools: "Its goal tools", state },
        {
          harness: "pi",
          tools: "Always uses CawCo's plan list",
          state: "none",
        },
      ];
    },
  },

  /** The column beside the options. */
  onEachAgent: "On each agent",
  states: {
    allowed: "Allowed",
    denied: "Denied",
    none: "Has none",
  } satisfies Record<OwnToolState, string>,
  /** At the page's foot, while sessions run (none says nothing). */
  stillRunning: (running: number) =>
    running === 1
      ? "1 running session keeps what it started with until it restarts."
      : `${running} running sessions keep what they started with until they restart.`,
  untouched: "Only the sessions CawCo starts take these two settings.",

  /** A save the hub refused, in its words, with what still holds. */
  refused: (said: string) => `${said}. The earlier setting stays.`,
  /** A save that never reached the hub: why, as a sentence of its own. */
  unsent: (why: string) => `${why} The earlier setting stays.`,
  /** The settings couldn't be read. */
  unread: (clause: string) =>
    `Could not read the helpers and step lists settings — ${clause}.`,

  /** First-run steps. */
  stepHelpers: "Choose a session's helpers",
  stepHelpersDone: (picked: Helpers) =>
    `Helpers: ${nameOf(HELPER_OPTIONS, picked)}`,
  stepStepLists: "Choose where a session keeps its steps",
  stepStepListsDone: (picked: StepLists) =>
    `Step lists: ${nameOf(STEP_LIST_OPTIONS, picked)}`,
  /** Under the last of the two steps done. */
  stepNote: "Change it in Configure › Helpers & step lists.",

  /** Configure › Subagents, while helpers are CawCo's delegates. */
  subagentsUncalled:
    "Sessions can't call these while their helpers are CawCo's delegates.",
  subagentsSwitch: "Change it in Helpers & step lists",
};
