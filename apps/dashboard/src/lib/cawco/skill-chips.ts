/**
 * A skill named in a message, drawn as its chip (SkillChip): in the
 * composer while it is written (MentionField) and in the transcript once it
 * is sent (the markdown's code spans).
 *
 * A skill is named by `/name`, a whole word: at the start of the text or
 * after whitespace, and ending at whitespace or the text's end, so a path
 * (`src/clean-copy`) or a word glued to punctuation stays as written. Only a
 * skill the session has is one; any other `/word` is plain text.
 */
import type { AvailableCommand } from "@cawco/core";
import { getContext, setContext } from "svelte";

export interface Skill {
  description?: string;
  /** Without the leading slash. */
  name: string;
  /** Where it came from, when known: a plugin, a marketplace. */
  source?: string;
}

/** The session's skills by name, from its `/` menu. */
export const skillsOf = (
  commands: readonly AvailableCommand[]
): ReadonlyMap<string, Skill> =>
  new Map(
    commands
      .filter((command) => command.type === "skill")
      .map((command) => [
        command.name,
        {
          name: command.name,
          description: command.description,
          source: command.source,
        },
      ])
  );

const SPECIAL = /[.*+?^${}()|[\]\\/]/g;

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
  return new RegExp(`(?<=^|\\s)/(${list.join("|")})${after}`, "g");
}

/** A fence's opening or closing line (markdown.svelte's own). */
const FENCE = /^\s{0,3}(`{3,}|~{3,})/;
/** A line cut at its code spans: every odd part is one. */
const CODE_SPAN = /(`+[^`]*?`+)/;

/**
 * The person's words with each `/name` of a skill the session has set as a
 * code span (`` `/name` ``), so the markdown draws it as the skill's chip
 * as it draws an agent's. Fenced code and code spans stay as written.
 */
export function markSkills(source: string, words: RegExp | null): string {
  if (!words) {
    return source;
  }
  let fence: string | null = null;
  return source
    .split("\n")
    .map((line) => {
      const marker = line.match(FENCE)?.[1];
      if (marker && (fence === null || marker.startsWith(fence))) {
        fence = fence === null ? marker : null;
        return line;
      }
      if (fence !== null) {
        return line;
      }
      return line
        .split(CODE_SPAN)
        .map((part, i) =>
          i % 2 === 1 ? part : part.replace(words, (whole) => `\`${whole}\``)
        )
        .join("");
    })
    .join("\n");
}

const SKILLS = Symbol("skills");
const NONE: ReadonlyMap<string, Skill> = new Map();

/** The skills of the session whose words are drawn under this component. */
export function setSkills(skills: () => ReadonlyMap<string, Skill>): void {
  setContext(SKILLS, skills);
}

/** The skills of the session drawn here: none outside a session's pane. */
export function skillsHere(): () => ReadonlyMap<string, Skill> {
  return (
    getContext<(() => ReadonlyMap<string, Skill>) | undefined>(SKILLS) ??
    (() => NONE)
  );
}

/** The skill a code span's words name, exactly, with or without the slash. */
export const skillNamed = (
  skills: ReadonlyMap<string, Skill>,
  words: string
): Skill | undefined =>
  skills.get(words.startsWith("/") ? words.slice(1) : words);

/** What the chip's panel and tip say of its source. */
export const sourceWords = (skill: Skill): string =>
  skill.source ? `Skill from ${skill.source}` : "Skill";
