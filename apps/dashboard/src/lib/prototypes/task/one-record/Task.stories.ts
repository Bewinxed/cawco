/**
 * The task, one record (Component Story Format 3, live components): a task
 * of Cawco-Dev opened from its board, told as every change once, oldest to
 * newest, the person's acts inside the entries they answer. Each state at
 * 1440 (what an entry opened standing beside the record) and at 390 (the
 * record alone, its own scroller), and at 900, where the desk layout
 * begins. The records are the hub's (fixtures.ts). The meta's args are
 * every story's; a story's own args are what it changes.
 */
import {
  READ_AT,
  T15_STOPPED_AT,
  T142_RUNNING_AT,
  T218_FILED_AT,
  t15Failed,
  t15Retried,
  t15Stopped,
  t112Dropped,
  t135Partial,
  t142Answered,
  t142AnswerNotCarried,
  t142Asking,
  t142Review,
  t142Working,
  t218Commented,
  t218Filed,
  t218Passed,
  t218Refused,
  t218Review,
  t218SentBack,
  t233Landed,
  t239LongTitle,
} from "./fixtures";
import { answered, type Play, press, screenArgs, typeIn } from "./plays";
import TaskRecordSheet from "./TaskRecordSheet.svelte";

const desk = { viewport: 1440 };
const phone = { viewport: 390 };

const resultOf = (entry: string) => ({ what: "result", entry }) as const;
const sessionOf = (entry: string) => ({ what: "session", entry }) as const;

export default {
  title: "Task/One record",
  component: TaskRecordSheet,
  args: {
    ...screenArgs,
    view: t142Review,
    now: READ_AT,
    opened: null,
  },
};

/** Waits on you: the second attempt handed in, its result whole beside the record, the first attempt folded to one line. */
export const WaitsOnYou = {
  args: { opened: resultOf("r-fd8fbee7") },
  parameters: desk,
};

/** Waits on you at 900, where the result first stands beside the record. */
export const WaitsOnYouAt900 = {
  args: { opened: resultOf("r-fd8fbee7") },
  parameters: { viewport: 900 },
};

/** Waits on you on a phone: the record alone, the hand-in with its two moves at the foot. */
export const WaitsOnYouPhone = { parameters: phone };

/** One attempt handed in and waiting on you, its result beside. */
export const OneAttempt = {
  args: { view: t218Review, opened: resultOf("r-67533cef") },
  parameters: desk,
};

/** One attempt waiting on you, on a phone: its two moves at the hand-in's foot. */
export const OneAttemptPhone = {
  args: { view: t218Review },
  parameters: phone,
};

/** Pass on pressed: the hub is taking the move. */
export const PassingOn = {
  args: {
    view: t218Review,
    opened: resultOf("r-67533cef"),
    pending: "passOn",
  },
  parameters: desk,
};

/** Passed on: the move is an entry by you, and the task is landing. */
export const PassedOn = {
  args: { view: t218Passed, opened: null },
  parameters: desk,
  from: "OneAttempt",
  play: async (context: Play) => {
    await press(context, '[data-entry="r-67533cef"]', "Pass on to done");
    await answered(context, "passOn", { view: t218Passed, opened: null });
  },
};

/** Passed on from a phone: the move is the newest entry. */
export const PassedOnPhone = {
  args: { view: t218Passed },
  parameters: phone,
  from: "OneAttemptPhone",
  play: async (context: Play) => {
    await press(context, '[data-entry="r-67533cef"]', "Pass on to done");
    await answered(context, "passOn", { view: t218Passed });
  },
};

/** Pass on pressed and the hub didn't answer (502): the refusal stands as an entry under the hand-in. */
export const PassRefused = {
  args: { view: t218Refused, opened: resultOf("r-67533cef") },
  parameters: desk,
  tags: ["failure"],
  from: "OneAttempt",
  play: async (context: Play) => {
    await press(context, '[data-entry="r-67533cef"]', "Pass on to done");
    await answered(context, "passOn", { view: t218Refused });
  },
};

/** The hub didn't answer the move, on a phone: its words stand under the hand-in. */
export const PassRefusedPhone = {
  args: { view: t218Refused },
  parameters: phone,
  tags: ["failure"],
};

/** Send back pressed: the question unfolds under it, with who takes the task up there and a note. */
export const SendBackAsked = {
  args: {
    view: t218Review,
    opened: resultOf("r-67533cef"),
    asking: { what: "sendBack" },
  },
  parameters: desk,
  from: "OneAttempt",
  play: async (context: Play) => {
    await press(context, '[data-entry="r-67533cef"]', "Send back to ready");
    await context.update({ asking: { what: "sendBack" } });
  },
};

/** Send back asked on a phone: the question and its note under the pair. */
export const SendBackAskedPhone = {
  args: { view: t218Review, asking: { what: "sendBack" } },
  parameters: phone,
  from: "OneAttemptPhone",
  play: async (context: Play) => {
    await press(context, '[data-entry="r-67533cef"]', "Send back to ready");
    await context.update({ asking: { what: "sendBack" } });
  },
};

/** Sent back with a note: the note is a comment waiting in the file, and the task is back in ready. */
export const SentBack = {
  args: { view: t218SentBack, opened: null },
  parameters: desk,
  from: "SendBackAsked",
  play: async (context: Play) => {
    await typeIn(
      context,
      "[data-ask]",
      "Run tsk-207's pi check from start_session."
    );
    await press(context, "[data-ask]", "Send back to ready");
    await answered(context, "sendBack", {
      view: t218SentBack,
      asking: null,
      opened: null,
    });
  },
};

/** Working: the attempt's session at work, its to-dos only offered, the session beside the record. */
export const Working = {
  args: {
    view: t142Working,
    now: T142_RUNNING_AT,
    opened: sessionOf("w-5b80ecec"),
  },
  parameters: desk,
};

/** Working, on a phone: the attempt's entry with its session live. */
export const WorkingPhone = {
  args: { view: t142Working, now: T142_RUNNING_AT },
  parameters: phone,
};

/** The session asks: its words and the command itself, Approve and Deny at the row's two ends. */
export const SessionAsks = {
  args: {
    view: t142Asking,
    now: T142_RUNNING_AT,
    opened: sessionOf("w-5b80ecec"),
  },
  parameters: desk,
};

/** The session asks, on a phone: Approve and Deny at the row's two ends. */
export const SessionAsksPhone = {
  args: { view: t142Asking, now: T142_RUNNING_AT },
  parameters: phone,
};

/** Approved: the ask says who answered and when, and the session is working again. */
export const AskApproved = {
  args: {
    view: t142Answered,
    now: T142_RUNNING_AT,
    opened: sessionOf("w-5b80ecec"),
  },
  parameters: desk,
  from: "SessionAsks",
  play: async (context: Play) => {
    await press(context, '[data-entry="a-60612449"]', "Approve");
    await answered(context, "approve", { view: t142Answered });
  },
};

/** Approved from a phone: the ask says who answered. */
export const AskApprovedPhone = {
  args: { view: t142Answered, now: T142_RUNNING_AT },
  parameters: phone,
  from: "SessionAsksPhone",
  play: async (context: Play) => {
    await press(context, '[data-entry="a-60612449"]', "Approve");
    await answered(context, "approve", { view: t142Answered });
  },
};

/** Approved, and the hub could not carry the answer: its words stand in the ask, the pair still there. */
export const AnswerNotCarried = {
  args: {
    view: t142AnswerNotCarried,
    now: T142_RUNNING_AT,
    opened: sessionOf("w-5b80ecec"),
  },
  parameters: desk,
  tags: ["failure"],
};

/** The attempt was stopped by the session that started it; Retry starts a fresh one. */
export const AttemptStopped = {
  args: {
    view: t15Stopped,
    now: T15_STOPPED_AT,
    opened: sessionOf("w-1b2685e5"),
  },
  parameters: desk,
};

/** The attempt stopped, on a phone, Retry in its entry. */
export const AttemptStoppedPhone = {
  args: { view: t15Stopped, now: T15_STOPPED_AT },
  parameters: phone,
};

/** The attempt failed, in the hub's words, reported to its starter; Retry in its entry. */
export const AttemptFailed = {
  args: {
    view: t15Failed,
    now: T15_STOPPED_AT,
    opened: sessionOf("w-1b2685e5"),
  },
  parameters: desk,
  tags: ["failure"],
};

/** The attempt failed, on a phone, Retry in its entry. */
export const AttemptFailedPhone = {
  args: { view: t15Failed, now: T15_STOPPED_AT },
  parameters: phone,
  tags: ["failure"],
};

/** Retried: a fresh attempt in the same workspace is running, the failure above it. */
export const Retried = {
  args: {
    view: t15Retried,
    now: T15_STOPPED_AT,
    opened: sessionOf("w-retry"),
  },
  parameters: desk,
  from: "AttemptFailed",
  play: async (context: Play) => {
    await press(context, '[data-entry="e-1b2685e5"]', "Retry attempt");
    await answered(context, "retry", {
      view: t15Retried,
      opened: sessionOf("w-retry"),
    });
  },
};

/** Retried from a phone: the fresh attempt is the newest entry. */
export const RetriedPhone = {
  args: { view: t15Retried, now: T15_STOPPED_AT },
  parameters: phone,
  from: "AttemptFailedPhone",
  play: async (context: Play) => {
    await press(context, '[data-entry="e-1b2685e5"]', "Retry attempt");
    await answered(context, "retry", { view: t15Retried });
  },
};

/** Just filed: one entry and its triage; the state line says it is ready and waits for dispatch. */
export const JustFiled = {
  args: { view: t218Filed, now: T218_FILED_AT, opened: { what: "file" } },
  parameters: desk,
};

/** Just filed, on a phone: one entry and its triage. */
export const JustFiledPhone = {
  args: { view: t218Filed, now: T218_FILED_AT },
  parameters: phone,
};

/** Said something with no session on it: the words are one entry, waiting in the file. */
export const CommentWaitsInFile = {
  args: { view: t218Commented, now: T218_FILED_AT, opened: { what: "file" } },
  parameters: desk,
  from: "JustFiled",
  play: async (context: Play) => {
    await typeIn(
      context,
      '[data-slot="say-something"]',
      "Resolve the harness the same way delegate does; no second rule."
    );
    await press(context, '[data-slot="say-something"]', "Send comment");
    await answered(context, "comment", { view: t218Commented });
  },
};

/** Said something from a phone: the words wait in the file. */
export const CommentWaitsInFilePhone = {
  args: { view: t218Commented, now: T218_FILED_AT },
  parameters: phone,
};

/** Drop asked from More: the question unfolds at the record's foot, with a reason to give. */
export const DropAsked = {
  args: {
    view: t218Filed,
    now: T218_FILED_AT,
    opened: { what: "file" },
    asking: { what: "drop" },
  },
  parameters: desk,
  from: "JustFiled",
  play: async ({ update }: Play) => {
    await update({ asking: { what: "drop" } });
  },
};

/** Dropped as a duplicate, by whom and why; Reopen puts it back in ready. */
export const Dropped = {
  args: { view: t112Dropped, opened: { what: "file" } },
  parameters: desk,
};

/** Dropped, on a phone, Reopen in its entry. */
export const DroppedPhone = { args: { view: t112Dropped }, parameters: phone };

/** Reopen pressed: the question unfolds under it. */
export const ReopenAsked = {
  args: {
    view: t112Dropped,
    opened: { what: "file" },
    asking: { what: "reopen" },
  },
  parameters: desk,
  from: "Dropped",
  play: async (context: Play) => {
    await press(context, '[data-entry="c-ef7649a"]', "Reopen into ready");
    await context.update({ asking: { what: "reopen" } });
  },
};

/** Landed on main: the hand-in, Jev's judgement in the move's reason, and the landing commit. */
export const Landed = {
  args: { view: t233Landed, opened: resultOf("r-ca1fc588") },
  parameters: desk,
};

/** Landed, on a phone: the landing commit is the newest entry. */
export const LandedPhone = { args: { view: t233Landed }, parameters: phone };

/** No attempt handed a result in: a session's comment names the commit that landed the work, and is its source. */
export const ResultByComment = {
  args: { view: t135Partial, opened: { what: "file" } },
  parameters: desk,
};

/** A result known only by a comment, on a phone. */
export const ResultByCommentPhone = {
  args: { view: t135Partial },
  parameters: phone,
};

/** The first read on its way: the state line and three entries at their real size. */
export const Reading = { args: { view: null }, parameters: desk };

/** The first read on its way, on a phone. */
export const ReadingPhone = { args: { view: null }, parameters: phone };

/** The hub isn't answering: the last read stays, said stale, its acts waiting for the hub. */
export const HubNotAnswering = {
  args: { opened: resultOf("r-fd8fbee7"), stale: "10:41" },
  parameters: desk,
  tags: ["failure"],
};

/** The hub isn't answering, on a phone: the last read stays, said stale. */
export const HubNotAnsweringPhone = {
  args: { stale: "10:41" },
  parameters: phone,
  tags: ["failure"],
};

/** The board's longest title, at the phone's width: it wraps to two lines in the head. */
export const LongestTitlePhone = {
  args: { view: t239LongTitle },
  parameters: phone,
};
