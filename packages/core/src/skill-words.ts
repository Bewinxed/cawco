/**
 * A skill named in a message: `/name`, a whole word, at any position. The
 * dashboard draws each as its chip (skill-chips.ts, MentionField), and each
 * harness's delivery has each one invoked as the harness itself runs a skill
 * a person asks for, so the model gets its contents whether or not the model
 * could load it itself (agent harnesses/*: `skillsNamed`).
 *
 * A name is a whole word: at the start of the text or after whitespace, and
 * ending at whitespace or the text's end, so a path (`src/clean-copy`) or a
 * word glued to punctuation stays as written. Only a skill the session has
 * is one; any other `/word` is plain text.
 */
import { codeBlanked } from "./outside-code";

const SPECIAL = /[.*+?^${}()|[\]\\/]/gu;

/**
 * Every `/name` of these skills, whole, in a text: the name is the match's
 * first group. `ends` says what may follow it: whitespace or the text's end
 * (`"end"`), or whitespace alone (`"space"`, a word still being typed at the
 * end is not one yet). Null with no skills.
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
  const after = ends === "end" ? "(?=\\s|$)" : "(?=\\s)";
  return new RegExp(`(?<=^|\\s)/(${list.join("|")})${after}`, "gu");
}

/** One time a message names a skill: its name, and where `/name` stands in the text. */
export interface SkillNamed {
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
export function skillsNamed(
  text: string,
  skills: Iterable<string>
): SkillNamed[] {
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
 */
export const opensWith = (text: string, named: SkillNamed): boolean =>
  named.start === text.length - text.trimStart().length;
