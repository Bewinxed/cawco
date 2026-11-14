/**
 * What `project_settings` answers a session in a project (hub
 * project-settings.ts): its project's settings as they stand, each change in
 * the card's and the project note's words, and its refusals. Agent-facing: each line names the
 * setting by the field that changes it.
 */

import type { StartingSet } from "../delegate-types";
import { areaWords } from "./areas";
import { projectAccountWords } from "./project-account";

/** A setting in effect as the read says it: its value in words, and where it came from in words. */
interface SettingRead {
  /** `its own`, `from its area Acme`, `the fleet's` (areas.ts `source`). */
  from: string;
  value: string;
}

/** A budget as a project's dispatch keeps it: what one attempt may spend. */
export interface SettingsBudget {
  minutes?: number;
  turns?: number;
  usd?: number;
}

/** `$5, 40 turns, 60 minutes`; null or empty: no limit. */
const budgetText = (budget: SettingsBudget | null): string => {
  const parts = [
    ...(budget?.usd === undefined ? [] : [`$${budget.usd}`]),
    ...(budget?.turns === undefined ? [] : [`${budget.turns} turns`]),
    ...(budget?.minutes === undefined ? [] : [`${budget.minutes} minutes`]),
  ];
  return parts.length > 0 ? parts.join(", ") : "no limit";
};

const onOff = (on: boolean): string => (on ? "on" : "off");

/** `skills a, b and servers c`: a set's two lists, each `none` when empty. */
const setText = (set: StartingSet): string =>
  `skills ${set.skills.join(", ") || "none"} and servers ${set.servers.join(", ") || "none"}`;

/** What the read shows: the project as the hub keeps it, and what dispatch does now. */
export interface SettingsRead {
  /** The account its sessions start on, by name; null: the fleet's routing. */
  account: string | null;
  /** What its sessions on that account do at its limit. */
  accountAtLimit: "wait" | "move";
  /** Where the account and its at-limit came from. */
  accountFrom: string;
  /** The area it sits in, by name; null: none. */
  area: string | null;
  /** The person's comment on a task reaches its attempt. */
  attemptsHearComments: boolean;
  budget: SettingsBudget | null;
  /** What it may spend in a period, in effect. */
  cap: SettingRead;
  /** The permission mode its conversation starts in, in effect. */
  cawMode: SettingRead;
  /** Connections granted to the project, each with where its grant came from. */
  connections: string[];
  /** Each kind's member, in effect: `look: you (its own)`. */
  decides: string[];
  dispatch: boolean;
  /** Whether the project's events reach its conversation. */
  events: boolean;
  /** The tasks dispatch would start next, in order. */
  frontier: string[];
  /** The conversation reads what the person writes on tasks. */
  hearsTasks: boolean;
  /** Ready tasks dispatch does not start, each with why. */
  held: { task: string; why: string }[];
  lands: string;
  /** Its links, one per repository, like github.com/owner/name. */
  links: string[];
  live: number;
  maxAttempts: number;
  name: string;
  /** What reaching the cap does, in effect. */
  onCap: SettingRead;
  /** Why dispatch starts nothing now; null when it would. */
  paused: string | null;
  review: boolean;
  /** Tasks waiting in review now. */
  reviewing: number;
  reviewLimit: number;
  runsOn: string | null;
  /**
   * Its starting set (hub project-starting-set.ts): the set, or none, or
   * what keeps its file from reading.
   */
  startingSet: StartingSet | { problems: string[] } | null;
  /** Its delegate types and where each came from: `writer (from its area Acme)`. */
  types: string[];
}

export const projectSettingsWords = {
  /** `project_settings` with no changes: every setting, by the field that changes it, then what dispatch does now. */
  read: (now: SettingsRead): string =>
    [
      `${now.name}'s settings, each with the change that sets it:`,
      `- Events reach the project's conversation: ${onOff(now.events)} (set_events)`,
      `- The conversation reads what the person writes on tasks: ${onOff(now.hearsTasks)} (set_hears_tasks)`,
      `- The person's comment on a task reaches its attempt: ${onOff(now.attemptsHearComments)} (set_attempts_hear_comments)`,
      `- Start attempts at ready tasks on their own: ${onOff(now.dispatch)} (set_dispatch)`,
      `- Attempts at once: at most ${now.maxAttempts} (set_max_attempts)`,
      `- Dispatch pauses at ${now.reviewLimit} tasks waiting for review (set_review_limit)`,
      `- Each attempt may spend: ${budgetText(now.budget)} (set_budget)`,
      `- Work lands on: ${now.lands} (set_lands)`,
      `- Attempts run on: ${now.runsOn ?? "any machine with a checkout"} (set_runs_on)`,
      `- Review before done: ${onOff(now.review)} (set_review)`,
      `- Repositories: ${now.links.length > 0 ? now.links.join(", ") : "none linked"} (link_repo, create_repo with folder)`,
      `- Connections granted: ${now.connections.length > 0 ? now.connections.join(", ") : "none"} (grant_connection)`,
      `- ${projectSettingsWords.startingSetRead(now.startingSet)} (set_starting_set)`,
      areaWords.read(now.area),
      `${projectAccountWords.read(now.account)}, ${now.accountFrom}`,
      `${projectAccountWords.atLimit.read(now.accountAtLimit)}, ${now.accountFrom}`,
      "",
      "In effect from its area or the fleet where it sets none, each with where it came from (the person changes these in Configure):",
      `- Caw's permission mode: ${now.cawMode.value} (${now.cawMode.from})`,
      `- Budget: ${now.cap.value} (${now.cap.from})`,
      `- At the budget: ${now.onCap.value} (${now.onCap.from})`,
      `- Who decides: ${now.decides.join("; ") || "none"}`,
      `- Delegate types: ${now.types.join(", ") || "none"}`,
      "",
      `Now: ${now.live} ${now.live === 1 ? "attempt is" : "attempts are"} live and ${now.reviewing} ${now.reviewing === 1 ? "task waits" : "tasks wait"} for review. ${
        now.paused === null
          ? `Next to start: ${now.frontier.length > 0 ? now.frontier.join(", ") : "nothing is ready"}.`
          : `Dispatch starts nothing: ${now.paused}`
      }${now.held.map(({ task, why }) => `\n- ${task} does not start: ${why}`).join("")}`,
    ].join("\n"),

  /** Each dispatch change, in the card's and the project note's words. */
  dispatchOn: (on: boolean): string =>
    on
      ? "Start attempts at ready tasks on their own"
      : "Stop starting attempts on their own: a person or a session starts each",
  maxAttempts: (count: number): string =>
    `Run at most ${count} ${count === 1 ? "attempt" : "attempts"} at once`,
  reviewLimit: (count: number): string =>
    `Pause dispatch at ${count} ${count === 1 ? "task" : "tasks"} waiting for review`,
  budget: (budget: SettingsBudget | null): string =>
    budgetText(budget) === "no limit"
      ? "Let each attempt spend with no project limit"
      : `Let each attempt spend at most ${budgetText(budget)}`,
  eventsOn: (on: boolean): string =>
    on
      ? "Turn events on: routines and events reach the project's conversation"
      : "Turn events off: what the conversation started finishes, and only the person's words reach it",
  hearsTasks: (on: boolean): string =>
    on
      ? "Have the project's conversation read your comments, to-dos and new tasks, and fold them into the task"
      : "Stop the project's conversation reading your comments, to-dos and new tasks",
  attemptsHearComments: (on: boolean): string =>
    on
      ? "Send your comment on a task to its attempt"
      : "Keep your comments on a task from its attempt",

  /** A starting set as the read says it. */
  startingSetRead: (
    set: StartingSet | { problems: string[] } | null
  ): string => {
    if (set === null) {
      return "Starting set: none, so its sessions start with everything installed";
    }
    if ("problems" in set) {
      return `Starting set: starting-set.md does not read, so no session starts in this project until it does, but one whose delegate type names a set: ${set.problems.join(" ")}`;
    }
    return `Starting set: its sessions start with ${setText(set)}, besides CawCo's own and its template's starter skills, unless their delegate type names a set`;
  },
  startingSet: (set: StartingSet | null): string =>
    set
      ? `Start this project's sessions with ${setText(set)}, besides CawCo's own`
      : "Start this project's sessions with everything installed",

  /** Refusals, each naming the field and how to fix it. */
  already: {
    dispatch: (on: boolean) =>
      `Starting attempts on their own is ${onOff(on)} for this project already.`,
    maxAttempts: (count: number) =>
      `This project runs at most ${count} attempts at once already.`,
    reviewLimit: (count: number) =>
      `Dispatch pauses at ${count} tasks waiting for review already.`,
    budget: "Each attempt may spend that already.",
    events: (on: boolean) =>
      `Events are ${onOff(on)} for this project already.`,
    hearsTasks: (on: boolean) =>
      `The conversation reading what you write on tasks is ${onOff(on)} for this project already.`,
    attemptsHearComments: (on: boolean) =>
      `Comments reaching their task's attempt is ${onOff(on)} for this project already.`,
    runsOn: (to: string | null) =>
      `This project's attempts run on ${to ?? "any machine"} already.`,
    startingSet: "This project's sessions start with that set already.",
  },
  needs: {
    dispatch: "set_dispatch says on (dispatch: true) or off (false).",
    maxAttempts: "set_max_attempts names max_attempts, a whole number.",
    reviewLimit: "set_review_limit names review_limit, a whole number.",
    budget:
      "set_budget names budget: usd, turns or minutes, or null for no limit.",
    events: "set_events says on (events: true) or off (false).",
    hearsTasks: "set_hears_tasks says on (hears_tasks: true) or off (false).",
    attemptsHearComments:
      "set_attempts_hear_comments says on (attempts_hear_comments: true) or off (false).",
    startingSet:
      "set_starting_set names starting_set: { skills: [...], servers: [...] }, or null for everything.",
  },
  /** A grant of a connection the hub has none of: what it can grant instead. */
  noConnection: (name: string, grantable: string[]): string =>
    grantable.length > 0
      ? `There is no connection ${name}. This project can be granted: ${grantable.join(", ")}.`
      : `There is no connection ${name}, and every connection is granted to this project already. The person adds one in Settings › Connections.`,
  /** A project named that is not the caller's. */
  notYours: (asked: string, name: string): string =>
    `${asked} is not your project: project_settings changes only “${name}”.`,
};
