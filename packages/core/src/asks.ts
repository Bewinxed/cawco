/**
 * The ask: one record the hub owns of what a session asked the person, who
 * answered, and what the hub did with the answer. The asking call answers
 * at once ({@link askRecordedWords}); nothing on the session's side waits.
 * The answer reaches the session as one send under {@link ASK_ORIGIN}, owed
 * until delivered, so neither an agent, gateway or hub restart nor the
 * session being at rest loses it.
 *
 * An `approve` ask is a CawCo call the hub runs itself on yes, once, with
 * the arguments the person was shown (hub asks.ts): an `admin_*_write`,
 * `project_settings`, opening a relay, installing a build. A `question` is
 * the session's own `ask` call: questions in the house shape
 * (`UserQuestion`), and whether its work waits on the answer.
 */
import { z } from "zod";
import { clockWords, dayWords } from "./accounts";
import type { AskAnswer } from "./frames";
import type { UserAnswers, UserQuestion } from "./harness";
import { markerTag, readMarkerTag } from "./injected";
import type { SourceFacts } from "./permission-presentation";
import { sessionLink } from "./references";

export type AskState = "open" | "answered" | "withdrawn";

const SOURCE_FACTS = z.object({
  at: z.string(),
  since: z.string().optional(),
  stars: z.number().optional(),
  unknown: z.string().optional(),
  weeklyDownloads: z.number().optional(),
  skill: z
    .object({
      description: z.string(),
      files: z.array(z.object({ hash: z.string(), path: z.string() })),
      hash: z.string(),
      name: z.string(),
    })
    .optional(),
}) satisfies z.ZodType<SourceFacts>;

/** Who runs an approved call: the hub, as the asker, through admin-tools `run`. */
const CARRY = z.object({ by: z.literal("hub"), tool: z.string() });

/**
 * What an `approve` ask asks: the CawCo call the hub runs on yes, by the
 * tool's own name and the input the card shows, and what its source is (an
 * install's or a link's, hub source-facts.ts) as read when it was asked.
 */
const APPROVE = z.object({
  kind: z.literal("approve"),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
  carry: CARRY,
  source: SOURCE_FACTS.optional(),
});

/** The house question shape (core harness.ts `UserQuestion`), as zod: every card, push and answer reads it. */
export const UserQuestionShape = z.object({
  header: z.string(),
  multiSelect: z.boolean(),
  options: z.array(z.object({ label: z.string(), description: z.string() })),
  question: z.string(),
});

/** A question's answers, keyed by question text (core harness.ts `UserAnswers`). */
const UserAnswersShape = z.record(
  z.string(),
  z.union([z.string(), z.array(z.string())])
);

/**
 * What a `question` ask asks: its questions, and whether the session's work
 * waits on them. Blocking, `waiting` names what is paused until the answer;
 * going on, `meanwhile` says what the session goes ahead with, its
 * assumption. Either way the asking call answers at once.
 */
const QUESTION = z.object({
  kind: z.literal("question"),
  questions: z.array(UserQuestionShape).min(1),
  blocks: z.boolean(),
  waiting: z.string().optional(),
  meanwhile: z.string().optional(),
});
export type AskedQuestion = z.infer<typeof QUESTION>;

const ANSWER_BY = z.object({
  behavior: z.enum(["allow", "deny"]).optional(),
  name: z.string().optional(),
  via: z.enum(["page", "app", "session", "harness"]),
}) satisfies z.ZodType<AskAnswer>;

const RESULT = z.discriminatedUnion("behavior", [
  /** `answers`: a question's, keyed by the question's text. */
  z.object({
    behavior: z.literal("allow"),
    answers: UserAnswersShape.optional(),
  }),
  z.object({ behavior: z.literal("deny"), message: z.string() }),
]);
export type AskResult = z.infer<typeof RESULT>;

/**
 * An ask as the hub stores it beside its row's columns (hub db/asks.ts):
 * the asker's id, its state and when it was raised are columns, so a
 * session's fold or a query reads them without the record.
 */
export const ASK_STORED = z.object({
  /** Caw's: drawn and answered in his thread. */
  threadId: z.string().optional(),
  /** The tool call the card is drawn at. */
  toolUseId: z.string().optional(),
  asked: z.discriminatedUnion("kind", [APPROVE, QUESTION]),
  answer: z
    .object({ at: z.number(), by: ANSWER_BY, result: RESULT })
    .optional(),
  /** The approved call as the hub ran it: started in the answer's own write, so it runs at most once. */
  carried: z
    .object({
      startedAt: z.number(),
      endedAt: z.number().optional(),
      said: z.string().optional(),
      failed: z.string().optional(),
    })
    .optional(),
  withdrawn: z
    .object({ at: z.number(), by: z.literal("hub"), why: z.string() })
    .optional(),
});

export type AskRecord = z.infer<typeof ASK_STORED> & {
  /** `ask_<uuid>`: the request id on every screen, and the id the answer's message names. */
  id: string;
  instanceId: string;
  raisedAt: number;
  state: AskState;
};

/**
 * The `system` origin the answer is delivered under: the person's act (core
 * harness.ts `byPerson`), so it reaches the session as their words do, into
 * a running turn at its next step, starting one in a session at rest.
 */
export const ASK_ORIGIN = "ask";

/** The tool that changes a project's settings, asking the person first unless it is in Full Send. */
export const PROJECT_SETTINGS = "project_settings";

const ADMIN_WRITE_TOOL = /^admin_[a-z_]+_write$/u;

/** Whether a tool is an admin write: the hub records an approve ask before each call runs, unless its session is in Full Send (hub asks.ts). */
export const isAdminWrite = (name: string): boolean =>
  ADMIN_WRITE_TOOL.test(name);

/** A new ask's id. */
export const newAskId = (): string => `ask_${crypto.randomUUID()}`;

/** What an approve ask's call answers at once, in one paragraph. */
export const askRecordedWords = (ask: { id: string; link: string }): string =>
  `Recorded as ${ask.link}: it waits on the person. Carry on with work that doesn't depend on it; the answer arrives as a message that names it. Don't ask it again, and don't do it another way. With nothing else to do, end your turn: the answer wakes you.`;

/** What an ask is called where its link names it: "approval of admin_hooks_write", "question: Keep /v1?". */
const askLabel = (asked: AskRecord["asked"]): string =>
  asked.kind === "approve"
    ? `approval of ${asked.tool}`
    : `question: ${asked.questions[0]?.question ?? ""}`;

/** An ask's link, in the session (or Caw's thread) that asked it. */
export const askLink = (
  ask: Pick<AskRecord, "asked" | "instanceId" | "threadId">
): string => sessionLink(ask.threadId ?? ask.instanceId, askLabel(ask.asked));

/** What a question's `ask` call answers at once: what waits on the answer, or what goes ahead. */
export const askQuestionWords = (link: string, asked: AskedQuestion): string =>
  asked.blocks
    ? `Asked as ${link}; ${asked.waiting ?? ""} waits on the person's answer. Don't do that work or anything that rests on it until the answer arrives as a message naming it. Do only work independent of it; with none left, end your turn: the answer wakes you.`
    : `Asked as ${link}. Go ahead with ${asked.meanwhile ?? ""}; if their answer differs, it arrives as a message naming it and you change course.`;

/** The line a question's card and push carry: whether work waits on it. */
export const askStanceLine = (asked: {
  blocks: boolean;
  meanwhile?: string;
  waiting?: string;
}): string =>
  asked.blocks
    ? `Blocks work · ${asked.waiting ?? ""} is paused until you answer`
    : `Work goes on · ${asked.meanwhile ?? ""}`;

/**
 * How an answered ask went, as its message's marker says it: an approve
 * ask's call ran, failed, was declined or cut short; a question was
 * answered or dismissed.
 */
export type AskOutcome =
  "ran" | "failed" | "declined" | "cut" | "answered" | "dismissed";

/** Why a carried call has no end of its own: the hub that ran it went. */
export const HUB_RESTARTED =
  "the hub restarted while running it; not run again";

const outcomeOf = (ask: AskRecord): AskOutcome => {
  if (ask.asked.kind === "question") {
    return ask.answer?.result.behavior === "allow" ? "answered" : "dismissed";
  }
  if (ask.answer?.result.behavior !== "allow") {
    return "declined";
  }
  if (ask.carried?.said !== undefined) {
    return "ran";
  }
  return ask.carried?.failed === HUB_RESTARTED ? "cut" : "failed";
};

const MARKER = "ask-answered";

/**
 * The message an answered ask arrives as: a marker carrying its id, kind and
 * outcome, read back by {@link parseAskAnswered}, then the outcome in words.
 */
export const askAnsweredText = (ask: AskRecord): string => {
  const outcome = outcomeOf(ask);
  const tag = markerTag(MARKER, { id: ask.id, kind: ask.asked.kind, outcome });
  const { asked } = ask;
  if (asked.kind === "question") {
    return `${tag}${questionAnsweredText(ask, asked)}`;
  }
  const { tool } = asked;
  switch (outcome) {
    case "ran":
      return `${tag}The person approved ${tool}. The hub ran it once with the arguments shown; it said:\n\n${ask.carried?.said ?? ""}`;
    case "failed":
      return `${tag}The person approved ${tool}, and it failed when the hub ran it: ${ask.carried?.failed ?? ""}`;
    case "cut":
      return `${tag}The person approved ${tool}, but ${HUB_RESTARTED}. Check whether it took effect before you ask again.`;
    case "declined": {
      const reason =
        ask.answer?.result.behavior === "deny"
          ? ask.answer.result.message.trim()
          : "";
      return `${tag}The person declined ${tool}${reason ? `: ${reason}` : ""}. Nothing ran; don't do it another way.`;
    }
    case "answered":
    case "dismissed":
      throw new Error(`An approve ask has no ${outcome} outcome.`);
    default:
      return outcome satisfies never;
  }
};

/** One answer as its line reads: the labels chosen, joined, or the words typed. */
const answerWords = (answer: string | string[] | undefined): string => {
  if (answer === undefined) {
    return "(no answer)";
  }
  return Array.isArray(answer) ? answer.join(", ") : answer;
};

/** A question's questions, each with its answer when it has one. */
const questionLines = (
  questions: readonly UserQuestion[],
  answers?: UserAnswers
): string =>
  questions
    .map((one) =>
      answers
        ? `- ${one.question}: ${answerWords(answers[one.question])}`
        : `- ${one.question}`
    )
    .join("\n");

/** A question's answer, in words: the questions and the answers, or the dismissal. */
const questionAnsweredText = (ask: AskRecord, asked: AskedQuestion): string => {
  const link = askLink(ask);
  const result = ask.answer?.result;
  if (result?.behavior !== "allow") {
    return `The person dismissed ${link} without answering:\n${questionLines(asked.questions)}\nDon't ask it again in the same words; decide what you can and say what you assumed.`;
  }
  const differs = asked.blocks
    ? ""
    : "\nIf this differs from what you went ahead with, change course.";
  return `The person answered ${link}:\n${questionLines(asked.questions, result.answers ?? {})}${differs}`;
};

const OUTCOMES: ReadonlySet<string> = new Set<AskOutcome>([
  "ran",
  "failed",
  "declined",
  "cut",
  "answered",
  "dismissed",
]);

/** An answered ask's message read back: its id, kind and outcome; null for any other text. */
export const parseAskAnswered = (
  text: string
): { id: string; kind: "approve" | "question"; outcome: AskOutcome } | null => {
  const tag = readMarkerTag(text);
  const { id, kind, outcome } = tag?.fields ?? {};
  return tag?.kind === MARKER &&
    id &&
    (kind === "approve" || kind === "question") &&
    outcome &&
    OUTCOMES.has(outcome)
    ? { id, kind, outcome: outcome as AskOutcome }
    : null;
};

/** Who gave an answer, as a refusal names them. */
const answererWords = (by: AskAnswer): string => {
  if (by.name) {
    return by.name;
  }
  switch (by.via) {
    case "page":
      return "a dashboard";
    case "app":
      return "the app";
    case "session":
      return "a session";
    case "harness":
      return "the harness";
    default:
      return by.via satisfies never;
  }
};

/** Why a second answer to an ask is refused. */
export const askClosedWords = (ask: AskRecord): string => {
  if (ask.answer) {
    const { at, by } = ask.answer;
    return `That ask was already answered by ${answererWords(by)} at ${dayWords(at)} ${clockWords(at)}.`;
  }
  return `That ask was withdrawn: ${ask.withdrawn?.why ?? "its session ended"}.`;
};
