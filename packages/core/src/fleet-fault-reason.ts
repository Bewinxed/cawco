/**
 * A machine's raw words for why a fleet item did not set up, read down to
 * what a person is told: which harnesses it failed on and one short reason.
 * A harness's reply can be a whole HTTP error page; none of it is kept or
 * shown but its status code, or a word for the cause.
 *
 * The agent keeps each reading through {@link shortDetail} as it reports,
 * and the dashboard reads every stored one through {@link readFault}, so
 * rows stored before that read the same.
 */
import { HARNESSES, type HarnessKind } from "./harness/kinds";

/** A reason's longest plain text: past it, the words are a body, not a sentence. */
const PLAIN_MAX = 160;

/** What went wrong, as short as it can be said. */
export type FaultReason =
  { status: number } | { word: "timeout" | "refused" } | { text: string };

/** The harness names a converge's failure lines begin with (session.ts). */
const HARNESS_LINE = new RegExp(
  `^(${HARNESSES.join("|")}): (?:(applied|failed|removed|needs-auth|disabled|unsupported|pending)(?: — |$)|(?:Error: )*)`,
  "gmu"
);

const STATUS = /\b(?:status|http|error)\W{0,4}([45]\d\d)\b/iu;
const TIMEOUT = /timed? ?out|ETIMEDOUT/iu;
const REFUSED = /ECONNREFUSED|connection refused/iu;
const MARKUP = /[{}<>]|https?:\/\//u;

/** The reason a run of raw words gives; none when they are a body with no code in it. */
function faultReason(raw: string): FaultReason | undefined {
  const status = STATUS.exec(raw);
  if (status?.[1]) {
    return { status: Number(status[1]) };
  }
  if (TIMEOUT.test(raw)) {
    return { word: "timeout" };
  }
  if (REFUSED.test(raw)) {
    return { word: "refused" };
  }
  const text = raw.replace(/\s+/gu, " ").trim();
  return text && text.length <= PLAIN_MAX && !MARKUP.test(text)
    ? { text }
    : undefined;
}

/** A reason as the agent keeps it and the dashboard reads it back. */
const reasonText = (reason: FaultReason): string => {
  if ("status" in reason) {
    return `status ${reason.status}`;
  }
  return "word" in reason ? reason.word : reason.text;
};

/** A detail kept in short: its reason alone, or nothing where it is a body with none. */
export function shortDetail(raw: string): string | undefined {
  const reason = faultReason(raw);
  return reason ? reasonText(reason) : undefined;
}

/**
 * One line per harness for an item it reported on, `<harness>: <state> — <short reason>`:
 * what the agent keeps as the item's error, and {@link readFault} reads.
 */
export function readingLines(
  readings: readonly {
    kind: string;
    item: { detail?: string; state: string };
  }[]
): string {
  return readings
    .map(({ kind, item }) => {
      const why = shortDetail(item.detail ?? "");
      return `${kind}: ${item.state}${why ? ` — ${why}` : ""}`;
    })
    .join("\n");
}

/** What a failed item's words say: the harnesses it failed on, and why. */
export interface ReadFault {
  harnesses: HarnessKind[];
  reason: FaultReason | undefined;
}

/**
 * An item's raw error read: one line per harness (`claude: failed — …`, or
 * a thrown `opencode: Error: …`) or one unnamed reason. A harness that
 * applied it, or has it disabled or waiting, is not part of the fault.
 */
export function readFault(raw: string): ReadFault {
  const heads = [...raw.matchAll(HARNESS_LINE)];
  if (heads.length === 0) {
    return { harnesses: [], reason: faultReason(raw) };
  }
  const harnesses: HarnessKind[] = [];
  let reason: FaultReason | undefined;
  for (const [index, head] of heads.entries()) {
    const [whole, harness, state] = head;
    if (state && state !== "failed") {
      continue;
    }
    harnesses.push(harness as HarnessKind);
    const end = heads[index + 1]?.index ?? raw.length;
    const said = raw.slice((head.index ?? 0) + whole.length, end);
    reason ??= faultReason(said);
  }
  return { harnesses, reason };
}
