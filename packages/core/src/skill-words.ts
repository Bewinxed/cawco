/**
 * A skill named in a message: `/name`, a whole word, at any position. The
 * dashboard draws each as its chip (skill-chips.ts, MentionField), and each
 * harness's delivery hands the model each one with a marker after it that
 * tells the agent to load that skill now ({@link withSkillMarkers}); what
 * reads the harness's transcript back drops the markers.
 *
 * A name is a whole word: at the start of the text or after whitespace, and
 * ending at whitespace, the text's end, or closing punctuation before either
 * (`/clean-copy,` `(see /clean-copy).`), so a path
 * (`src/clean-copy`, `/clean-copy/x`) or a longer name (`/clean-copy-old`)
 * never reads as a shorter skill. Only a skill the session has is one; any
 * other `/word` is plain text.
 */
import { codeBlanked } from "./outside-code";

const SPECIAL = /[.*+?^${}()|[\]\\/]/gu;

/** What may close a name before the whitespace or end after it: a sentence's or a bracket's or a quote's end. */
const CLOSING = "[,.;:!?)\\]}\"'’”»›]*";

const WHITESPACE = /\s/u;

/** The closing punctuation right after a name, which its marker follows ({@link withSkillMarkers}). */
const CLOSED = new RegExp(`^${CLOSING}`, "u");

/**
 * Every `/name` of these skills, whole, in a text: the name is the match's
 * first group, and the match is `/name` alone. `ends` says what may follow
 * it, past any closing punctuation ({@link CLOSING}): whitespace or the
 * text's end (`"end"`), or whitespace alone (`"space"`, a word still being
 * typed at the end is not one yet). Null with no skills.
 */
export function skillWords(
  names: Iterable<string>,
  ends: "end" | "space" = "end"
): RegExp | null {
  const list = [...names]
    .sort((a, b) => b.length - a.length)
    .map((name) => name.replace(SPECIAL, "\\$&"));
  if (list.length === 0) {
    return null;
  }
  const after =
    ends === "end" ? `(?=${CLOSING}(?:\\s|$))` : `(?=${CLOSING}\\s)`;
  return new RegExp(`(?<=^|\\s)/(${list.join("|")})${after}`, "gu");
}

/** One time a message names a skill: its name, and where `/name` stands in the text. */
interface SkillNamed {
  /** Past the name's last character. */
  end: number;
  /** Without the leading slash. */
  name: string;
  start: number;
}

/** CawCo's word to the agent after a send's text (injected.ts `withReminder`): never the sender's. */
const REMINDER = /<system-reminder>[\s\S]*?<\/system-reminder>/gu;

/**
 * Each time `text` names one of `skills`, in order: a skill named twice is
 * there twice. Its code and CawCo's reminder blocks name none, as the
 * transcript draws no chip in them.
 */
function skillsNamed(text: string, skills: Iterable<string>): SkillNamed[] {
  const pattern = skillWords(skills);
  if (!pattern) {
    return [];
  }
  const words = codeBlanked(text).replace(REMINDER, (block) =>
    " ".repeat(block.length)
  );
  return [...words.matchAll(pattern)].map((match) => ({
    name: match[1] ?? "",
    start: match.index,
    end: match.index + match[0].length,
  }));
}

/**
 * Whether `named` is the command the text opens with: the one a harness
 * that runs a message's opening `/name` (Claude Code, OpenCode) runs itself.
 * Those read the command's name up to the first whitespace, so a name with
 * punctuation after it (`/clean-copy, then …`) is no command of theirs: it
 * reaches the model marked, as any other name does.
 */
const opensWith = (text: string, named: SkillNamed): boolean =>
  named.start === text.length - text.trimStart().length &&
  (named.end === text.length || WHITESPACE.test(text.charAt(named.end)));

/**
 * `text` as a harness hands it to the model: each skill of `skills` it
 * names followed by its marker ({@link skillMarker}), past any closing
 * punctuation, which tells the agent to load that skill now with its own
 * skill tool, or read its SKILL.md at the path `skills` gives for it, the
 * way for a skill the tool refuses. `runsOpening`: the harness runs the
 * text's opening `/name` itself ({@link opensWith}), which keeps no marker;
 * an opening `/name,` stays no command of its, the marker after its comma.
 */
export function withSkillMarkers(
  text: string,
  skills: ReadonlyMap<string, string | undefined>,
  runsOpening: boolean
): string {
  if (!text.includes("/")) {
    return text;
  }
  let marked = text;
  for (const named of skillsNamed(text, skills.keys()).reverse()) {
    if (runsOpening && opensWith(text, named)) {
      continue;
    }
    const at =
      named.end + (CLOSED.exec(text.slice(named.end))?.[0].length ?? 0);
    marked =
      marked.slice(0, at) +
      skillMarker(named.name, skills.get(named.name)) +
      marked.slice(at);
  }
  return marked;
}

/** The marker's wording, between the brackets after the name: the instruction, then the file for a skill the skill tool refuses. */
const MARKER_LEAD = "load skill";
const MARKER_TOOL = "now with your skill tool";
const MARKER_READ = "; if the tool refuses it, read";

/**
 * The marker for skill `name`, whose SKILL.md is at `path` on the machine
 * the session runs on (none when the harness names no file for it): the
 * words written after its `/name`, as
 * `/clean-copy [load skill clean-copy now with your skill tool; if the tool refuses it, read /…/clean-copy/SKILL.md]`.
 */
const skillMarker = (name: string, path: string | undefined): string =>
  ` [${MARKER_LEAD} ${name} ${MARKER_TOOL}${path ? `${MARKER_READ} ${path}` : ""}]`;

/**
 * A marker after the `/name` it belongs to and the name's closing
 * punctuation: those are the first group, the name alone the second. The
 * transcript index reads it back by its own copy (jsonl-parser text.ts
 * `SKILL_MARKER`): keep the two in step.
 */
const MARKED = new RegExp(
  `(/(\\S+?)${CLOSING}) \\[${MARKER_LEAD} \\2 ${MARKER_TOOL}(?:${MARKER_READ} [^\\]\\n]+)?\\]`,
  "gu"
);

/**
 * `text` with each skill marker dropped, its `/name` left as it stood:
 * a message as it was written, from the words its harness handed the model
 * ({@link withSkillMarkers}).
 */
export const withoutSkillMarkers = (text: string): string =>
  text.includes(` [${MARKER_LEAD} `) ? text.replace(MARKED, "$1") : text;
