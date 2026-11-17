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
    line: "Each is a session of its own on the board: its own workspace and branch, any agent or model, its commits landed and a report back. It starts cold and reads the code again.",
  },
  {
    value: "subagents",
    name: "The agent's own subagents",
    line: "Quick helpers inside the session, sharing its workspace and folded into its transcript. They can't land work or outlive the session, so work that lands still goes to a delegate.",
  },
] as const satisfies readonly OwnToolOption<Helpers>[];

const STEP_LIST_OPTIONS = [
  {
    value: "cawco",
    name: "CawCo's plan list",
    line: "The session's steps on the board and the phone. Your edits reach it at its next step, and it recaps them when you're back.",
  },
  {
    value: "agent",
    name: "The agent's own to-do list and plan mode",
    line: "Claude Code keeps its own list and asks you to leave plan mode. CawCo shows them only as tool calls in the transcript.",
  },
] as const satisfies readonly OwnToolOption<StepLists>[];

const nameOf = <T extends string>(
  options: readonly OwnToolOption<T>[],
  value: T
): string => options.find((option) => option.value === value)?.name ?? value;

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
        { harness: "pi", tools: "Hands off to delegates", state: "none" },
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
        { harness: "pi", tools: "Keeps CawCo's plan list", state: "none" },
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
  /** Under the options. */
  whenItApplies: (running: number) =>
    running === 0
      ? "Set as each session starts."
      : `Set as each session starts: ${running} running ${running === 1 ? "session keeps" : "sessions keep"} what it started with until it restarts.`,
  untouched:
    "Your own Claude Code, OpenCode and Codex settings stay as they are: CawCo passes this to the sessions it starts.",

  /** A save the hub refused, in its words, with what still holds. */
  refused: (said: string) => `${said}. Sessions keep the setting before it.`,
  /** A save that never reached the hub: why, as a sentence of its own. */
  unsent: (why: string) => `${why} Sessions keep the setting before it.`,
  /** The settings couldn't be read. */
  unread: (clause: string) =>
    `Could not read the helpers and step lists — ${clause}.`,

  /** First-run steps. */
  stepHelpers: "Choose a session's helpers",
  stepHelpersDone: (picked: Helpers) =>
    `Helpers: ${nameOf(HELPER_OPTIONS, picked)}`,
  stepStepLists: "Choose where a session keeps its step list",
  stepStepListsDone: (picked: StepLists) =>
    `Step lists: ${nameOf(STEP_LIST_OPTIONS, picked)}`,
  stepNote: "Change it any time in Configure › Helpers & step lists.",

  /** Configure › Subagents, while helpers are CawCo's delegates. */
  subagentsUncalled:
    "Sessions can't call these while their helpers are CawCo's delegates.",
  subagentsSwitch: "Change it in Helpers & step lists",
};
