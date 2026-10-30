/**
 * What `project_settings` answers a session in a project (hub
 * project-settings.ts): its project's settings as they stand, each change in
 * the card's and the project note's words, and its refusals. Agent-facing: each line names the
 * setting by the field that changes it.
 */

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

/** What the read shows: the project as the hub keeps it, and what dispatch does now. */
export interface SettingsRead {
  budget: SettingsBudget | null;
  /** Connections granted to the project. */
  connections: string[];
  dispatch: boolean;
  /** Whether the project's events reach its conversation. */
  events: boolean;
  /** The tasks dispatch would start next, in order. */
  frontier: string[];
  lands: string;
  live: number;
  maxAttempts: number;
  name: string;
  /** Why dispatch starts nothing now; null when it would. */
  paused: string | null;
  /** Its repository, like github.com/owner/name; null when none is linked. */
  remote: string | null;
  review: boolean;
  /** Tasks waiting in review now. */
  reviewing: number;
  reviewLimit: number;
  runsOn: string | null;
}

export const projectSettingsWords = {
  /** `project_settings` with no changes: every setting, by the field that changes it, then what dispatch does now. */
  read: (now: SettingsRead): string =>
    [
      `${now.name}'s settings, each with the change that sets it:`,
      `- Events reach the project's conversation: ${onOff(now.events)} (set_events)`,
      `- Start attempts at ready tasks on their own: ${onOff(now.dispatch)} (set_dispatch)`,
      `- Attempts at once: at most ${now.maxAttempts} (set_max_attempts)`,
      `- Dispatch pauses at ${now.reviewLimit} tasks waiting for review (set_review_limit)`,
      `- Each attempt may spend: ${budgetText(now.budget)} (set_budget)`,
      `- Work lands on: ${now.lands} (set_lands)`,
      `- Attempts run on: ${now.runsOn ?? "any machine with a checkout"} (set_runs_on)`,
      `- Review before done: ${onOff(now.review)} (set_review)`,
      `- Repository: ${now.remote ?? "none linked"} (link_repo, create_repo)`,
      `- Connections granted: ${now.connections.length > 0 ? now.connections.join(", ") : "none"} (grant_connection)`,
      "",
      `Now: ${now.live} ${now.live === 1 ? "attempt is" : "attempts are"} live and ${now.reviewing} ${now.reviewing === 1 ? "task waits" : "tasks wait"} for review. ${
        now.paused === null
          ? `Next to start: ${now.frontier.length > 0 ? now.frontier.join(", ") : "nothing is ready"}.`
          : `Dispatch starts nothing: ${now.paused}`
      }`,
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
    runsOn: (to: string | null) =>
      `This project's attempts run on ${to ?? "any machine"} already.`,
  },
  needs: {
    dispatch: "set_dispatch says on (dispatch: true) or off (false).",
    maxAttempts: "set_max_attempts names max_attempts, a whole number.",
    reviewLimit: "set_review_limit names review_limit, a whole number.",
    budget:
      "set_budget names budget: usd, turns or minutes, or null for no limit.",
    events: "set_events says on (events: true) or off (false).",
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
