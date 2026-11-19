/**
 * Words no skill an agent loads may hold, each with the rule it breaks: the
 * design graph's routing (the `show` skill) said one way everywhere. Read by
 * both doors a skill comes in by: `bun run skills:check` over the skills
 * CawCo ships (scripts/skills-check.ts), and a fleet skill installed from a
 * folder (skills.ts `readCheckedFolder`), which is refused in these words.
 */

/** One banned phrase and the rule it breaks, said to whoever wrote it. */
interface SkillTextBan {
  pattern: RegExp;
  rule: string;
}

const SKILL_TEXT_BANS: readonly SkillTextBan[] = [
  {
    pattern: /component canvas|live canvas|canvas's own switcher/iu,
    rule: 'the panel kind "component" opens is the design graph, its View holds the widths and the scheme',
  },
  {
    pattern: /verdict card/iu,
    rule: "one design is judged on its design graph, where pins are the answer, and a go-ahead is an ask",
  },
  {
    pattern: /\bto: "parent"/u,
    rule: "artifact_create has no `to`: a session's artifacts go to the session it reports to, unopened",
  },
  {
    pattern: /\b(?:2529|680)\b/u,
    rule: "a width a frame is read at is one of the design graph's own (artifact_read's state.width)",
  },
  {
    pattern:
      /\b(?:frames?|stor(?:y|ies)|canvas(?:es)?|previews?) (?:per|for each|for a) (?:TOM )?width/iu,
    rule: "one state is one story, and the design graph draws it at each width",
  },
  {
    pattern: /animated mockup/iu,
    rule: "motion to judge is a move on the design graph, played on the real component",
  },
  {
    pattern: /over\W{0,3}budget|250 modules/iu,
    rule: "a states file's weight is reported, never held to a budget",
  },
];

/** Each banned phrase `text` holds, as one line naming its line number and the rule it breaks. */
export const skillTextProblems = (text: string): string[] =>
  text.split("\n").flatMap((line, index) =>
    SKILL_TEXT_BANS.flatMap(({ pattern, rule }) => {
      const found = pattern.exec(line);
      return found ? [`line ${index + 1} says "${found[0]}": ${rule}`] : [];
    })
  );
