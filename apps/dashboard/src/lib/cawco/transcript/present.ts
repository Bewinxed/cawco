/**
 * How the hub's blocks read on screen: an ask's one-line and expanded forms,
 * a delegate's live line, which tools draw a picture. Formatting only — every
 * block was built by the hub (`TranscriptBuilder`, @cawco/core).
 */
import { getToolGlance } from "@cawco/core";
import type { SubagentState } from "$lib/utils/flow-types";
import type { JsonValue, Message } from "../types";

export const SHOW_IMAGE_TOOLS = new Set([
  "mcp__cawco__show_image",
  "cawco_show_image",
  "show_image",
]);

export const SHOW_PREVIEW_TOOLS = new Set([
  "mcp__cawco__show_preview",
  "cawco_show_preview",
  "show_preview",
]);

/**
 * Whether a parked ask was routed to its parent session rather than to the
 * user's attention queue. The hub tags such a frame's payload with
 * `routedTo: 'parent'`; the attention queue reads this back to keep it out
 * while the delegate's own transcript still shows the ask.
 */
export function routedToParent(request: { routedTo?: string }): boolean {
  return request.routedTo === "parent";
}

/**
 * The asks a session's own composer parks: every pending ask but the ones
 * routed to its parent. The composer's stack draws exactly these, and the
 * transcript leaves out the rows of the calls they gate, so a parked ask is
 * drawn once, on the composer, until it settles into its row.
 */
export function parkedAsks<T extends { routedTo?: string }>(pending: T[]): T[] {
  return pending.filter((request) => !routedToParent(request));
}

/**
 * A subagent branch as something to WATCH rather than a string to print: what it
 * is doing right now, what it finally reported, and how many steps that took.
 */
export interface SubagentView {
  /** Present tense, what it is doing NOW. Empty once the branch has settled. */
  currentStep: string;
  /** Its final report: the Task result, or the last thing it said. */
  report: string;
  /** Whether the branch is still working. */
  running: boolean;
  /** Tool calls it has made — what the status pill counts. */
  steps: number;
}

/**
 * Present-tense verbs for the tools a delegate's live line names. Anything not
 * listed says its own name, which reads as a step already (`WebSearch cawco`).
 */
const STEP_VERB: Record<string, string> = {
  Read: "Reading",
  Write: "Writing",
  Edit: "Editing",
  NotebookEdit: "Editing",
  Bash: "Running",
  Grep: "Searching",
  Glob: "Globbing",
  WebFetch: "Fetching",
  WebSearch: "Searching the web",
  Task: "Delegating",
  TodoWrite: "Updating its plan",
};

/** An MCP tool's own name, out of the `mcp__<server>__<tool>` it is called by. */
const stepVerb = (name: string): string => {
  const tool = name.split("__").pop() ?? name;
  return STEP_VERB[tool] ?? tool;
};

const stepLine = (message: Message): string => {
  const verb = stepVerb(message.metadata?.toolName ?? message.content);
  const glance = getToolGlance(message.metadata?.toolInput);
  return glance ? `${verb} ${glance}` : verb;
};

/**
 * What the delegate is doing at this instant. The call still in flight is the
 * truest answer — it is literally what it is inside — and the progress summary,
 * the text it is writing, and the last call it made are what is left when there
 * is none.
 */
function currentStep(branch: SubagentState, tools: Message[]): string {
  const inFlight = [...tools]
    .reverse()
    .find((m) => m.metadata?.toolStatus === "pending");
  if (inFlight) {
    return stepLine(inFlight);
  }
  if (branch.summary) {
    return branch.summary;
  }
  const writing = branch.streaming.trim().split("\n").filter(Boolean).pop();
  if (writing) {
    return writing;
  }
  const last = tools.at(-1);
  if (last) {
    return stepLine(last);
  }
  if (branch.lastToolName) {
    return stepVerb(branch.lastToolName);
  }
  return branch.description ?? "Working";
}

/** {@link SubagentView} for a branch, recomputed as its blocks arrive. */
export function subagentView(branch: SubagentState): SubagentView {
  const running = branch.status === "starting" || branch.status === "running";
  const tools = branch.messages.filter((m) => m.type === "tool.use");
  const said = [...branch.messages]
    .reverse()
    .find((m) => m.type === "assistant" && m.content.trim());
  return {
    running,
    steps: tools.length,
    currentStep: running ? currentStep(branch, tools) : "",
    report: branch.result?.trim() || said?.content.trim() || "",
  };
}

/**
 * Whether a message's `peerSession` names this session. A live copy carries the
 * full id; a stored report carries only its 8-char prefix — so the match is
 * exact or by prefix, and never on anything shorter than 8 characters.
 */
export function matchesSession(
  peerSession: string | undefined,
  id: string
): boolean {
  if (!peerSession) {
    return false;
  }
  return (
    peerSession === id ||
    (peerSession.length >= 8 && id.startsWith(peerSession))
  );
}

/**
 * A routed ask's body as the hub serialises it: `<tool> — <input JSON>`
 * (`renderDelegateAsk`, packages/hub). Question-form bodies (`Q1: …`) and
 * anything that does not parse return null and render as plain text.
 */
const ASK_BODY_PATTERN = /^([A-Za-z_][\w-]*) — (\{.*\})$/s;

function askBodyParts(
  body: string
): { tool: string; input: Record<string, JsonValue> } | null {
  const match = ASK_BODY_PATTERN.exec(body);
  if (!match) {
    return null;
  }
  try {
    const parsed: unknown = JSON.parse(match[2]);
    if (
      typeof parsed !== "object" ||
      parsed === null ||
      Array.isArray(parsed)
    ) {
      return null;
    }
    return { tool: match[1], input: parsed as Record<string, JsonValue> };
  } catch {
    return null;
  }
}

/**
 * A question ask's input as the hub words it (`renderDelegateAsk`): one block
 * per question, its options listed under it. Empty for anything else, which is
 * how the callers below tell a question ask from a tool ask.
 */
function questionBlocks(input: Record<string, unknown>): string[] {
  // It came over the wire, so it is JSON.
  const { questions } = input as Record<string, JsonValue>;
  if (!Array.isArray(questions)) {
    return [];
  }
  return questions.map((entry, index) => {
    const question =
      typeof entry === "object" && entry !== null && !Array.isArray(entry)
        ? entry
        : {};
    const text = typeof question.question === "string" ? question.question : "";
    const options = Array.isArray(question.options)
      ? question.options
          .map((option) =>
            typeof option === "object" &&
            option !== null &&
            !Array.isArray(option)
              ? option.label
              : null
          )
          .filter((label): label is string => typeof label === "string")
          .map((label) => `- ${label}`)
          .join("\n")
      : "";
    return `Q${index + 1}: ${text}${options ? `\n${options}` : ""}`;
  });
}

/**
 * An ask's one-line form: the tool plus its most telling argument, never raw
 * JSON — the first question where the ask is a question. The tool name is what
 * the hub recorded, and an ask that never named one still reads as an ask.
 */
export function askShortOf(
  toolName: string | null,
  input: Record<string, unknown>
): string {
  const questions = questionBlocks(input);
  if (questions.length > 0) {
    return questions[0].split("\n")[0];
  }
  const tool = toolName ?? "ask";
  const filepath = input.filepath ?? input.filePath ?? input.path;
  if (typeof filepath === "string") {
    return `${tool} ${filepath.split("/").filter(Boolean).pop() ?? filepath}`;
  }
  if (typeof input.command === "string") {
    return `${tool} ${input.command.slice(0, 80)}`;
  }
  return tool;
}

/**
 * An ask's expanded detail: a diff shown as the diff (file path above), a
 * command as the command, a question ask as its questions and their options,
 * anything else as formatted JSON.
 */
export function askDetailOf(
  _toolName: string | null,
  input: Record<string, unknown>
): string {
  const questions = questionBlocks(input);
  if (questions.length > 0) {
    return questions.join("\n");
  }
  if (typeof input.diff === "string") {
    const filepath = input.filepath ?? input.filePath ?? input.path;
    return (typeof filepath === "string" ? `${filepath}\n\n` : "") + input.diff;
  }
  if (typeof input.command === "string") {
    return input.command;
  }
  return JSON.stringify(input, null, 2);
}

/**
 * {@link askShortOf} for a transcript-derived ask: the body is parsed first,
 * and one that never parsed (a question list) keeps its own first line.
 */
export function askShort(body: string): string {
  const parts = askBodyParts(body);
  if (!parts) {
    return body.split("\n")[0];
  }
  return askShortOf(parts.tool, parts.input);
}

/** {@link askDetailOf} for a transcript-derived ask; an unparsed body is itself. */
export function askDetail(body: string): string {
  const parts = askBodyParts(body);
  if (!parts) {
    return body;
  }
  return askDetailOf(parts.tool, parts.input);
}
