/**
 * A skill named in a message, drawn as its chip (SkillChip): in the
 * composer while it is written (MentionField) and in the transcript once it
 * is sent (the markdown's code spans).
 *
 * A skill is named by `/name`, a whole word, as core skill-words.ts reads
 * it: the rule each harness's delivery marks the named skills by.
 */
import type { AvailableCommand } from "@cawco/core/fleet";
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

/**
 * Words of the person's (outside code, core outside-code.ts) with each `/name`
 * of a skill the session has set as a code span (`` `/name` ``), so the
 * markdown draws it as the skill's chip as it draws an agent's.
 */
export const markSkills = (words: string, skills: RegExp | null): string =>
  skills ? words.replace(skills, (whole) => `\`${whole}\``) : words;

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
