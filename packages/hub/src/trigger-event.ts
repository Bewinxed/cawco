/**
 * The one shape every trigger on a project's thing takes (tsk-310; the
 * router is triggers.ts), with the kinds of trigger and the skill each
 * names. Below both caw.ts and triggers.ts, which each read it.
 */
import type { InstanceRow, SendPayload } from "@cawco/core/protocol";
import type { Thing } from "@cawco/core/triggers";

/** What a send carries besides its words: pictures (base64) and attachments. */
export type Carried = Pick<SendPayload, "attachments" | "images">;

/** The system origin's name of the hub's word to a session about its project's thing (core `NeutralOrigin`, triggers.ts). */
export const PROJECT_ORIGIN = "project";

/**
 * The skill each kind of event names in its send's context line: the how-to
 * for that kind (packages/hub/skills/), which the conversation loads when it
 * reads it.
 */
export const EVENT_SKILLS = {
  "routine-run": "project-routine-run",
  "routine-report": "project-routine-report",
  "delegate-report": "project-delegate-report",
  "attempt-judgement": "project-attempt-judgement",
  "task-move": "project-task-move",
  "inbound-event": "project-inbound-event",
  "person-request": "project-person-request",
  "task-input": "project-task-input",
  "fleet-watch": "project-fleet-watch",
  connection: "project-connection",
  decision: "project-decision",
  "project-setup": "project-setup",
  "view-request": "project-view",
  "held-triggers": "project-held-triggers",
} as const;

/** What kind of event a send to the project's conversation is ({@link EVENT_SKILLS}). */
export type EventKind = keyof typeof EVENT_SKILLS;

/**
 * One trigger on a thing of a project: what happened, to which thing, what
 * changed, who did it, when, and its kind.
 */
export interface TriggerEvent {
  /** When it happened; now when left out. */
  at?: Date;
  /** The session that did it, when one did: it is never told of its own act. */
  by?: string;
  /** Pictures and files that came with it. */
  carried?: Carried;
  /**
   * How it is said to the thing's own session when its kind says it its own
   * way (the person's marks on an artifact, folded with what is still
   * unread there): whether the session took it. Left out, it is sent as
   * the person's words when `who` is "you", else as the hub's word.
   */
  deliver?: (owner: InstanceRow) => Promise<boolean>;
  /** What changed, verbatim: the comment, the pin's text, the event as data. */
  delta: string;
  /**
   * The delegate whose report it is (a `delegate-report`): the session that
   * started it owns it first, while it hears input, whatever its context's
   * size, as any delegate's report reaches its parent.
   */
  from?: string;
  /** Its kind: the skill it names (caw.ts `EVENT_SKILLS`). */
  kind: EventKind;
  /** The event route that delivered it: its mode wins. */
  route?: string;
  /** The routine whose run or report it is: its mode wins, and a send names it (its origin). */
  routine?: string;
  /** The thing, and how a reader names it, its link included. */
  thing: Thing & { name: string };
  /** What happened, one line with the thing's link. */
  what: string;
  /** Who did it: "you", a session's link, "the hub". */
  who: string;
}
