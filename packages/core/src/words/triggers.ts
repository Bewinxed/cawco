/**
 * The words of the trigger router (hub triggers.ts): what a fresh session
 * for a project's thing reads (its brief, each later trigger, the list of
 * what was held while the project's triggers were off), and the hub's own
 * lines about it.
 */

/** A markdown link, its label kept. */
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/gu;
/** A work item's title, at most (hub work-items.ts). */
const TITLE_MAX = 48;

/** Where the rest of the project is read: the last line of everything a fresh session reads. */
const READ_THE_REST =
  "Read the rest with task_read, artifact_read, folder_read and find; the project's decisions are in decisions/<page>/log.md.";

/** One trigger as a session reads it: what happened, by whom and when, what changed, and the skill for it. */
export interface TriggerLines {
  /** When it happened, ISO. */
  at: string;
  /** What changed, verbatim: the comment, the pin's text, the event as data. */
  delta: string;
  /** The skill for its kind. */
  skill: string;
  /** What happened, one line with the thing's link. */
  what: string;
  /** Who did it: "you", a session's link, "the hub". */
  who: string;
}

const linesOf = (trigger: TriggerLines): string =>
  [
    trigger.what,
    `By ${trigger.who}, at ${trigger.at}.`,
    "",
    trigger.delta,
    "",
    `For how to handle it, use the ${trigger.skill} skill.`,
  ].join("\n");

/** One held trigger in the switch-on list. */
interface HeldLine {
  at: string;
  delta: string;
  what: string;
  who: string;
}

/** A thing and what was held on it, for the switch-on list. */
export interface HeldThing {
  held: HeldLine[];
  name: string;
}

/** How each answer reaches the person, the same for every fresh session. */
const WHERE_IT_GOES =
  "Write what you did on the thing itself: a task's comments with task_comment, a pin's thread with comment_reply, a routine's run with task_result. Anything you need from the person goes to them with ask or a decision card. Never message, hand off to or continue another session, and never write to the project's Caw conversation.";

export const triggerWords = {
  /** A fresh session's title: what it handles, a link's label in its place, cut to a work item's 48 characters. */
  title: (thing: string) => {
    const said = `Handle ${thing.replace(MARKDOWN_LINK, "$1")}`;
    return said.length > TITLE_MAX ? `${said.slice(0, TITLE_MAX - 1)}…` : said;
  },
  /** A fresh session's brief: who it is, the trigger that started it, how it ends, and where the rest is read. */
  brief: (
    project: string,
    folder: string,
    thing: string,
    idleMinutes: number,
    trigger: TriggerLines
  ) =>
    [
      `You are a fresh session the hub started in ${project} (in ${folder}) for ${thing}, because something happened to it and no session working on it could take it. You know nothing of the project but what you read.`,
      "",
      linesOf(trigger),
      "",
      WHERE_IT_GOES,
      `While you live, whatever else happens to ${thing} comes to you. You end once you have been idle ${idleMinutes} minutes with no ask of yours waiting on the person and no delegate of yours still running; call finish_item yourself when you are done before that, its headline what you did.`,
      READ_THE_REST,
    ].join("\n"),
  /** A later trigger on its thing, to the session that lives on it. */
  again: (trigger: TriggerLines) =>
    [`[CawCo] ${linesOf(trigger)}`, "", READ_THE_REST].join("\n"),
  /** The brief of the session that reads what was held while the project's triggers were off. */
  held: (
    project: string,
    folder: string,
    idleMinutes: number,
    skill: string,
    things: HeldThing[]
  ) =>
    [
      `You are a fresh session the hub started in ${project} (in ${folder}): its triggers were switched back on, and these arrived while they were off. Nothing was started for any of them. Decide, thing by thing, what to act on now, what to start, and what to leave.`,
      "",
      ...things.flatMap((thing) => [
        `## ${thing.name}`,
        "",
        ...thing.held.flatMap((one) => [
          `- ${one.what} By ${one.who}, at ${one.at}.`,
          ...one.delta.split("\n").map((line) => `  ${line}`),
        ]),
        "",
      ]),
      `For how to weigh them, use the ${skill} skill.`,
      WHERE_IT_GOES,
      `You end once you have been idle ${idleMinutes} minutes with no ask of yours waiting on the person and no delegate of yours still running; call finish_item yourself when you are done before that, its headline what you did.`,
      READ_THE_REST,
    ].join("\n"),
  /** The thing the held list is about: the project itself. */
  heldThing: (project: string) => `what ${project} held while off`,
  /** What came with a trigger, sent after a fresh session's brief. */
  carried: "What came with it.",
  /** The headline the hub writes on a fresh session it ended idle that wrote none. */
  endedIdle: (idleMinutes: number) =>
    `Ended after ${idleMinutes} idle minutes with nothing of its own pending.`,
  /** Why the person's writing on a task with no session on it starts nothing: the project's switch for it is off. */
  notHeard:
    "The project doesn't have a session read what the person writes on tasks, and no session is on this one.",
  /** Why a trigger was held: the project's triggers are off. */
  heldOff:
    "The project's triggers are off, so nothing started: it waits on the project until they are on.",
  /** Why a trigger was held: the project is past its spend cap. */
  heldCapped: (why: string) =>
    `Nothing started, as the project is past its spend cap (${why}): it waits on the project until its triggers are switched on again.`,
  /** Why a session over its token cap was passed over for a trigger. */
  overCap: (tokens: number, cap: number, window: number) =>
    `over its token cap (${tokens} tokens of context, past ${cap} of its ${window}-token window)`,
  /** The hub's log line when a live owner was passed over. */
  passedOver: (session: string, why: string) =>
    `[triggers] ${session} was passed over: ${why}`,
} as const;
