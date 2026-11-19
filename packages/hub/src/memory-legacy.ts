/**
 * The memory files as they were before the nightly run (the dated fact
 * lines of `knowledge/` and AGENTS.md's curated sections), read once for
 * the cutover (memory-run.ts `cutover`): pure. A fact line read this way is
 * `- <fact> (since <date>, from <note ids>, used <date>)`, with at most one
 * indented `Why:` line under it; `## Formerly` and `## Conflict` hold the
 * lines that no longer stand alone.
 */
import { renderLesson } from "./memory-lessons";

/** A fact's sources as its line names them: note ids, and a file's prose from before fact lines. */
const NOTE = /n-\d{8}-\d{6}-[0-9a-f]{6}/gu;
const BEFORE_FACTS = /\(before facts\)/u;
const WHY = /^\s+Why:\s*(.*\S)\s*$/u;
const HEADING = /^(#{1,6})\s+(.*\S)\s*$/u;
const FIELDS =
  /^(since|until|from|used|ruling|replaced by)\b|^(since|ruling) \d{4}-\d{2}-\d{2}/u;

/** One fact line from before the nightly run: its words, its `Why:`, and what it rested on. */
export interface OldFact {
  /** Rested on a file's prose from before fact lines, which the person approved. */
  approved: boolean;
  /** The note ids it rested on. */
  notes: string[];
  text: string;
  why: string | null;
}

/** A line of an old memory file, read: a fact (its section's kind), or any other line. */
export type OldLine =
  | { fact: OldFact; kind: "fact"; raw: string[]; section: "current" | "past" }
  | { kind: "text"; raw: string };

/**
 * A line's words and its parenthesis of fields: the last parenthesis whose
 * brackets close at the line's end and whose first word is a field, so
 * words may hold parentheses of their own.
 */
const splitFact = (
  line: string
): { inside: string; text: string } | undefined => {
  const trimmed = line.trimEnd();
  if (!(trimmed.startsWith("- ") && trimmed.endsWith(")"))) {
    return;
  }
  let depth = 0;
  for (let at = trimmed.length - 1; at >= 2; at -= 1) {
    depth += trimmed[at] === ")" ? 1 : 0;
    depth -= trimmed[at] === "(" ? 1 : 0;
    if (depth === 0) {
      const inside = trimmed.slice(at + 1, -1);
      const text = trimmed.slice(2, at).trim();
      return text && FIELDS.test(inside.trim()) ? { text, inside } : undefined;
    }
  }
};

/** Each line of an old memory file, its fact lines with their `Why:` read whole. */
const oldLines = (content: string): OldLine[] => {
  const lines = content.split("\n");
  const out: OldLine[] = [];
  let section: "current" | "past" = "current";
  for (let at = 0; at < lines.length; at += 1) {
    const raw = lines[at] ?? "";
    const heading = HEADING.exec(raw);
    if (heading?.[2]) {
      const name = heading[2].trim().toLowerCase();
      section = name === "formerly" || name === "conflict" ? "past" : "current";
      out.push({ kind: "text", raw });
      continue;
    }
    const fact = splitFact(raw);
    if (!fact) {
      out.push({ kind: "text", raw });
      continue;
    }
    const why = WHY.exec(lines[at + 1] ?? "")?.[1] ?? null;
    out.push({
      kind: "fact",
      section,
      raw: why ? [raw, lines[at + 1] ?? ""] : [raw],
      fact: {
        text: fact.text,
        why,
        notes: [...fact.inside.matchAll(NOTE)].map((match) => match[0]),
        approved: BEFORE_FACTS.test(fact.inside),
      },
    });
    if (why) {
      at += 1;
    }
  }
  return out;
};

/** A converted line's lesson: its id, words and `Why:`. */
interface Converted {
  id: string;
  text: string;
  why: string | null;
}

/**
 * An old memory file with each current fact line put through `convert`: a
 * lesson takes its place, `null` takes it out (placed elsewhere), and
 * nothing takes it out (left for the recovery run). The past lines
 * (Formerly, Conflict) are taken out and answered, for the archive; every
 * other line stays as it stands.
 */
export const convertFile = (
  content: string,
  convert: (fact: OldFact) => Converted | null | undefined
): { content: string; past: string[] } => {
  const out: string[] = [];
  const past: string[] = [];
  for (const line of oldLines(content)) {
    if (line.kind === "text") {
      out.push(line.raw);
    } else if (line.section === "past") {
      past.push(...line.raw);
    } else {
      const lesson = convert(line.fact);
      if (lesson) {
        out.push(renderLesson(lesson));
      }
    }
  }
  return {
    content: `${out
      .join("\n")
      .replace(/\n{3,}/gu, "\n\n")
      .trimEnd()}\n`,
    past,
  };
};
