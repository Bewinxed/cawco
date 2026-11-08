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
 * (`UserQuestion`), and whether its work waits on the answer. A `permit` is
 * a harness's own permission prompt whose process went before the person
 * answered: the hub keeps it, and on yes grants that exact call once, for
 * the session to make again in the turn the answer reaches it in; the turn
 * ending without it lapses the grant (hub asks.ts `turnEnded`).
 */
import { z } from "zod";
import { clockWords, dayWords } from "./accounts";
import { canonicalJson } from "./canonical-json";
import type { UserAnswers, UserQuestion } from "./harness";
import { markerTag, readMarkerTag } from "./injected";
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

/**
 * What a `permit` ask asks: the tool call a session's harness was halted on
 * when its process went, by the harness's own tool name and input. Approved,
 * it is granted once ({@link sameCall}); nothing runs until the session
 * makes the call again, in the turn that reads the answer.
 */
const PERMIT = z.object({
  kind: z.literal("permit"),
  tool: z.string(),
  input: z.record(z.string(), z.unknown()),
});
export type AskedPermit = z.infer<typeof PERMIT>;

/**
 * Whether two tool calls are the same call, as a permit's grant matches the
 * one its session makes again: the same tool with the same input, a shell
 * command's `description` aside (the model words it afresh; it runs nothing).
 */
export const sameCall = (
  a: { tool: string; input: Record<string, unknown> },
  b: { tool: string; input: Record<string, unknown> }
): boolean => a.tool === b.tool && callKey(a) === callKey(b);

const callKey = ({
  tool,
  input,
}: {
  tool: string;
  input: Record<string, unknown>;
}): string => {
  if (tool.toLowerCase() !== "bash") {
    return canonicalJson(input);
  }
  const { description: _description, ...runs } = input;
  return canonicalJson(runs);
};

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
  via: z.enum(["page", "app", "session", "harness", "fullSend"]),
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
  /** The tool call the card is drawn at. */
  toolUseId: z.string().optional(),
  asked: z.discriminatedUnion("kind", [APPROVE, QUESTION, PERMIT]),
  /**
   * A permit whose prompt the hub routed to its session's parent (server.ts
   * `deliverDelegateAsk`): kept so, it stays that parent's to answer and off
   * the person's screens and push until the parent's process goes
   * (server.ts `escalateRoutedAsks`).
   */
  routedTo: z.literal("parent").optional(),
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
  /** An approved permit's grant, spent: the hub allowed the same call when the session's harness asked it again. */
  used: z.object({ at: z.number() }).optional(),
  /**
   * An approved permit's grant, gone unspent: the turn that read its answer
   * ended (or its process did, mid-turn) without the call, so the same call
   * asks the person again (the owner's pick, "Until the turn your answer
   * starts ends").
   */
  lapsed: z.object({ at: z.number() }).optional(),
});

export type AskRecord = z.infer<typeof ASK_STORED> & {
  /** `ask_<uuid>`: the request id on every screen, and the id the answer's message names. */
  id: string;
  instanceId: string;
  raisedAt: number;
  state: AskState;
};

/** The tool that changes a project's settings, asking the person first unless it is in Full Send. */
export const PROJECT_SETTINGS = "project_settings";

const ADMIN_WRITE_TOOL = /^admin_[a-z_]+_write$/u;

/** Whether a tool is an admin write: the hub records an approve ask before each call runs, unless its session is in Full Send (hub asks.ts). */
export const isAdminWrite = (name: string): boolean =>
  ADMIN_WRITE_TOOL.test(name);

/**
 * Full Send's answer: an approval or a harness's prompt its session held
 * open as it entered Full Send, approved by it (hub asks.ts
 * `fullSendFiled`, the agent's harnesses as the mode is set).
 */
export const FULL_SEND_ANSWER = {
  behavior: "allow",
  via: "fullSend",
} as const satisfies AskAnswer;

/** A new ask's id. */
export const newAskId = (): string => `ask_${crypto.randomUUID()}`;

/** What an approve ask's call answers at once, in one paragraph. */
export const askRecordedWords = (ask: { id: string; link: string }): string =>
  `Recorded as ${ask.link}: it waits on the person. Carry on with work that doesn't depend on it; the answer arrives as a message that names it. Don't ask it again, and don't do it another way. With nothing else to do, end your turn: the answer wakes you.`;

/** What an ask is called where its link names it: "approval of admin_hooks_write", "question: Keep /v1?". */
const askLabel = (asked: AskRecord["asked"]): string =>
  asked.kind === "question"
    ? `question: ${asked.questions[0]?.question ?? ""}`
    : `approval of ${asked.tool}`;

/** An ask's link, in the session that asked it. */
export const askLink = (ask: Pick<AskRecord, "asked" | "instanceId">): string =>
  sessionLink(ask.instanceId, askLabel(ask.asked));

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
 * ask's call ran, failed, was declined or cut short; a permit was granted,
 * and lapsed if its turn ended unspent; a question was answered or
 * dismissed.
 */
export type AskOutcome =
  | "ran"
  | "failed"
  | "declined"
  | "cut"
  | "granted"
  | "lapsed"
  | "answered"
  | "dismissed";

/** Why a carried call has no end of its own: the hub that ran it went. */
export const HUB_RESTARTED =
  "the hub restarted while running it; not run again";

/** How an answered ask went, as its record says it now. */
export const askOutcome = (ask: AskRecord): AskOutcome => {
  if (ask.asked.kind === "question") {
    return ask.answer?.result.behavior === "allow" ? "answered" : "dismissed";
  }
  if (ask.answer?.result.behavior !== "allow") {
    return "declined";
  }
  if (ask.asked.kind === "permit") {
    return ask.lapsed ? "lapsed" : "granted";
  }
  if (ask.carried?.said !== undefined) {
    return "ran";
  }
  return ask.carried?.failed === HUB_RESTARTED ? "cut" : "failed";
};

/**
 * Who answered an ask, as its answer's message opens: the person, or the
 * session that answered for them (a delegate's parent, or its project's
 * conversation), by its title, or Full Send.
 */
const answeredBy = (ask: AskRecord): string => {
  const by = ask.answer?.by;
  if (by?.via === "fullSend") {
    return "Full Send";
  }
  if (by?.via !== "session") {
    return "The person";
  }
  return by.name ? `Your parent session "${by.name}"` : "Your parent session";
};

const MARKER = "ask-answered";

/**
 * The message an answered ask arrives as: a marker carrying its id, kind and
 * outcome, read back by {@link parseAskAnswered}, then the outcome in words.
 */
export const askAnsweredText = (ask: AskRecord): string => {
  const outcome = askOutcome(ask);
  const tag = markerTag(MARKER, { id: ask.id, kind: ask.asked.kind, outcome });
  const { asked } = ask;
  if (asked.kind === "question") {
    return `${tag}${questionAnsweredText(ask, asked)}`;
  }
  if (asked.kind === "permit") {
    return `${tag}${permitAnsweredText(ask, asked)}`;
  }
  const { tool } = asked;
  switch (outcome) {
    case "ran":
      return `${tag}${answeredBy(ask)} approved ${tool}. The hub ran it once with the arguments shown; it said:\n\n${ask.carried?.said ?? ""}`;
    case "failed":
      return `${tag}${answeredBy(ask)} approved ${tool}, and it failed when the hub ran it: ${ask.carried?.failed ?? ""}`;
    case "cut":
      return `${tag}${answeredBy(ask)} approved ${tool}, but ${HUB_RESTARTED}. Check whether it took effect before you ask again.`;
    case "declined": {
      const reason =
        ask.answer?.result.behavior === "deny"
          ? ask.answer.result.message.trim()
          : "";
      return `${tag}The person declined ${tool}${reason ? `: ${reason}` : ""}. Nothing ran; don't do it another way.`;
    }
    case "granted":
    case "lapsed":
    case "answered":
    case "dismissed":
      throw new Error(`An approve ask has no ${outcome} outcome.`);
    default:
      return outcome satisfies never;
  }
};

/** The longest input a permit's answer quotes; a longer one is the call in the session's own conversation. */
const PERMIT_INPUT_MAX = 2000;

/** A permit's answer, in words: the call granted once, or declined. */
const permitAnsweredText = (ask: AskRecord, asked: AskedPermit): string => {
  const { tool } = asked;
  const result = ask.answer?.result;
  if (result?.behavior !== "allow") {
    const reason = result?.message.trim() ?? "";
    return `${answeredBy(ask)} declined the ${tool} call your harness asked to make before your last process ended${reason ? `: ${reason}` : ""}. Don't make it, and don't do it another way.`;
  }
  const input = JSON.stringify(asked.input, null, 2);
  const shown =
    input.length <= PERMIT_INPUT_MAX
      ? `\n\n${input}`
      : " (its input is the cut call's in your conversation).";
  return `${answeredBy(ask)} approved the ${tool} call your harness asked to make before your last process ended. Make that call again with the same input in this turn and it runs without asking, once; when this turn ends, the approval lapses and the call asks again${shown}`;
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
    return `${answeredBy(ask)} dismissed ${link} without answering:\n${questionLines(asked.questions)}\nDon't ask it again in the same words; decide what you can and say what you assumed.`;
  }
  const differs = asked.blocks
    ? ""
    : "\nIf this differs from what you went ahead with, change course.";
  return `${answeredBy(ask)} answered ${link}:\n${questionLines(asked.questions, result.answers ?? {})}${differs}`;
};

const OUTCOMES: ReadonlySet<string> = new Set<AskOutcome>([
  "ran",
  "failed",
  "declined",
  "cut",
  "granted",
  "lapsed",
  "answered",
  "dismissed",
]);

/**
 * The answers an answered question's message gives (`questionAnsweredText`),
 * in the order asked: each `- <question>: <answer>` line's answer.
 */
export const answersOf = (text: string): string[] =>
  text
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .flatMap((line) => {
      const at = line.lastIndexOf(": ");
      return at < 0 ? [] : [line.slice(at + 2)];
    });

/**
 * The questions a dismissed question's message names (`questionAnsweredText`),
 * in the order asked: each `- <question>` line, whole.
 */
export const dismissedOf = (text: string): string[] =>
  text
    .split("\n")
    .filter((line) => line.startsWith("- "))
    .map((line) => line.slice(2));

/** An answered ask's message read back: its id, kind and outcome; null for any other text. */
export const parseAskAnswered = (
  text: string
): {
  id: string;
  kind: AskRecord["asked"]["kind"];
  outcome: AskOutcome;
} | null => {
  const tag = readMarkerTag(text);
  const { id, kind, outcome } = tag?.fields ?? {};
  return tag?.kind === MARKER &&
    id &&
    (kind === "approve" || kind === "question" || kind === "permit") &&
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
    case "fullSend":
      return "Full Send";
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

/**
 * An answered ask's answer as the hub took it, and where it came from, so a
 * screen that held the ask and did not answer it says what won and where
 * (JOURNEY.md Flow 2: "the answer row resolves to the answer that won,
 * naming where it came from").
 */
export interface AskAnswer {
  /** Approve or deny; absent when the harness settled the ask itself and did not say. */
  behavior?: "allow" | "deny";
  /**
   * The paired device that answered (a page or the app), or the session that
   * did (a delegate's parent, its project's conversation), by name; absent when the
   * hub knows no name (a page or app it trusts by its network).
   */
  name?: string;
  /**
   * Where it was answered: a dashboard page; the app (a client that is no
   * page: the iOS and Mac app); another session; the harness itself, in
   * its own interface; or Full Send, the mode the person put its session
   * in, which approves an approval the session had open as it entered it
   * (hub asks.ts `fullSendFiled`).
   */
  via: "page" | "app" | "session" | "harness" | "fullSend";
}

/**
 * Where an install fetches from, as the hub read it when the call was
 * proposed (hub source-facts.ts): a skill's source, a marketplace's.
 */
export interface SourceFacts {
  /** The source as read: `github.com/owner/repo`, `npm package`, `/path on machine`. */
  at: string;
  /** When it first came out: the repository's creation, the package's first publish (ISO). */
  since?: string;
  /**
   * A skill read from a folder on a machine before the person is asked: what
   * its SKILL.md declares and every file the install carries, by path.
   */
  skill?: {
    description: string;
    /** Every file, by path, with the hash of its content. */
    files: { hash: string; path: string }[];
    /** The hash of every file together: what the approval pins. */
    hash: string;
    name: string;
  };
  /** The repository's GitHub stars. */
  stars?: number;
  /** Why there are no facts: a source that carries none, or the registry's answer. */
  unknown?: string;
  /** The package's npm downloads in the last week. */
  weeklyDownloads?: number;
}
