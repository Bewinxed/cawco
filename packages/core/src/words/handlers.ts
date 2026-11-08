/**
 * The words of a handler (core handlers.ts): the fresh session the hub
 * starts for one thing of a project when something happens to it and no
 * live, warm session is on it. What the handler reads (its brief, each
 * later trigger) and what the person reads of it (the thing's list of who
 * handled it).
 */

/** A markdown link, its label kept. */
const MARKDOWN_LINK = /\[([^\]]*)\]\([^)]*\)/gu;
/** A work item's title, at most (hub work-items.ts). */
const TITLE_MAX = 48;

/** The sentence every handler's message ends with: where the rest of the project is read. */
const READ_THE_REST =
  "Read the rest with task_read, artifact_read, folder_read and find; the project's decisions are in decisions/<page>/log.md.";

/** One trigger as a handler reads it: what happened, where, by whom and when, and the change itself. */
export interface HandlerTrigger {
  /** When it happened, ISO. */
  at: string;
  /** What happened, one line with the thing's link: "The person commented on [Price the worktops](cawco:task/…/tsk-1) in todo." */
  context: string;
  /** The change itself, verbatim: the comment, the pin's text and anchor, the event as data. */
  delta: string;
  /** The skill for its kind. */
  skill: string;
  /** Who did it: "you", a session's link, "the hub". */
  who: string;
}

const triggerLines = (trigger: HandlerTrigger): string =>
  [
    `${trigger.context}`,
    `By ${trigger.who}, at ${trigger.at}.`,
    "",
    trigger.delta,
    "",
    `For how to handle it, use the ${trigger.skill} skill.`,
  ].join("\n");

export const handlerWords = {
  /**
   * The item's and its session's title: what it handles, a link's label in
   * its place, cut to the 48 characters a work item's title holds.
   */
  title: (thing: string) => {
    const said = `Handle ${thing.replace(MARKDOWN_LINK, "$1")}`;
    return said.length > TITLE_MAX ? `${said.slice(0, TITLE_MAX - 1)}…` : said;
  },
  /**
   * A handler's brief, its first message: who it is, the trigger that
   * started it, how it ends, and where the rest is read (last).
   */
  brief: (
    project: string,
    folder: string,
    thing: string,
    idleMinutes: number,
    trigger: HandlerTrigger
  ) =>
    [
      `You are a handler: a fresh session the hub started in ${project} (in ${folder}) for ${thing}, because something happened to it and no session working on it could take it. You know nothing of the project but what you read.`,
      "",
      triggerLines(trigger),
      "",
      "Tell the person with send_to_user, ask or a decision card; answer where the change was written (a pin's thread with comment_reply, a task's comments with task_comment); delegate what needs work done. Never message, hand off to or continue another session to have it act for you.",
      `While you live, whatever else happens to ${thing} comes to you. You end once you have been idle ${idleMinutes} minutes with no ask of yours open, no delegate of yours live and no attempt you started running; call finish_item yourself only when you are done before that, its headline what you did.`,
      READ_THE_REST,
    ].join("\n"),
  /** A later trigger on its thing, to a handler that lives. */
  again: (trigger: HandlerTrigger) =>
    [`[CawCo] ${triggerLines(trigger)}`, "", READ_THE_REST].join("\n"),
  /** The headline the hub writes on a handler it ended idle that wrote none. */
  endedIdle: (idleMinutes: number) =>
    `Ended after ${idleMinutes} idle minutes with nothing of its own open.`,
  /** Why the hub ended a handler (its item's `stoppedBy`). */
  idleWhy: (idleMinutes: number) =>
    `it was idle ${idleMinutes} minutes with nothing of its own open`,
  /** Why a standing session is cold: its prompt cache expired (hub server.ts `standingCold`). */
  cacheCold: "cold (its prompt cache expired)",
  /** The head of why a session's context is past its token cap (core `STANDING_CONTEXT_SHARE`). */
  overCapLead: "over its token cap",
  /** Why a session's context is past its token cap, whole. */
  overCap: (tokens: number, cap: number, share: number, window: number) =>
    `over its token cap (${tokens} tokens of context, past ${cap}, ${Math.round(share * 100)}% of its ${window}-token window)`,
  /** The hub's log line for a handler it leaves live past its idle spell, once: what holds it open. */
  heldOpen: (item: string, why: string) =>
    `[handlers] ${item} stays past its idle spell: ${why}`,
  /** Why a trigger waits on its thing: Caw is off, so no handler starts. */
  cawOff:
    "Caw is off for this project, so no handler starts: it waits on its thing.",
} as const;
