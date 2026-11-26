/**
 * What a project's rules say (hub memory.ts, memory-lessons.ts): the line
 * AGENTS.md opens with, what a session reads over the rules it launches
 * with, and what `memory_rule` says and answers. The person reads the
 * index's head; agents read the rest.
 */
export const projectRulesWords = {
  /** The index's line under its title, for the person who opens it. */
  indexIntro: "Rules change only when you ask.",
  /** The index's pointer to a skill's lessons. */
  skillPointer: (skill: string, path: string) =>
    `- Before \`${skill}\`: read ${path} with folder_read.`,
  /** The instruction a session launches with: its project's index, under this. */
  indexInstruction: (index: string) =>
    `## This project's rules\n\nWhat the person asked of agents working in this project. Each holds until the person changes it.\n\n${index.trim()}`,
  /** What the index's instruction is named in a session's instructions. */
  indexInstructionPath: "project memory: AGENTS.md",
  /** A brief's files its task names, over them. */
  briefContext: (files: string) =>
    `## Files this task names\n\nFrom the project's folder, as the task's context names them.\n\n${files}`,

  /** `memory_rule`'s description. */
  ruleTool:
    "Adds, rewords or removes one of this project's rules in AGENTS.md. Use it when the person asks for a rule to change. A rule a tool can check (a banned pattern, a required name, a file that must exist) becomes that check instead: a lint rule, a hook rule or a hub refusal.",
  /** `memory_rule`'s answers: what changed. */
  ruleRemoved: (id: string, path: string, text: string) =>
    `Removed ${id} from ${path} (it said: ${text}). Sessions that start from now on no longer load it.`,
  ruleReworded: (id: string, path: string) => `Reworded ${id} in ${path}.`,
  ruleAdded: (id: string, path: string) => `Added ${id} to ${path}.`,
  /** What a rule change through memory_rule is committed as. */
  ruleCommit: (said: string) => `${said}, through memory_rule`,
  /** A memory_rule commit's body: the session that made the change at the person's word. */
  ruleBy: (title: string, session: string) =>
    `By session ${session} (${title}), at the person's word.`,
  ruleRemoveSaid: (id: string) => `remove ${id}`,
  ruleAddSaid: (id: string, path: string) => `add ${id} to ${path}`,
  ruleRewordSaid: (id: string, path: string) => `reword ${id} in ${path}`,
  /** `memory_rule`'s refusals, each one sentence saying what to do next. */
  ruleNoProject:
    "This session is in no project, so it has no rules to change: memory_rule changes the rules of the session's project.",
  ruleAskUnfit: (action: string, missing: string) =>
    `${action} needs ${missing}: remove takes rule; reword takes rule and text; add takes text, like {"action":"add","text":"Run the checks before finishing."}.`,
  ruleIdUnfit: (id: string) =>
    `${id} is not a rule id: L- and six hex characters, as AGENTS.md shows each rule, like L-28939a.`,
  ruleUnknown: (id: string) =>
    `${id} is no rule of this project: the ids are at the end of each line in AGENTS.md and the lessons/ and knowledge/ files.`,
  ruleSame: (id: string) => `${id} says this already, word for word.`,
  ruleOneLine: "A rule is one line: say it in one sentence.",
  ruleSecret: "The rule holds what reads as a secret: leave it out.",
  /** A change whose rule left, or whose new id was taken, since it was checked. */
  noLongerThere: (id: string) =>
    `${id} is no longer there: the rules changed since this was checked. Read AGENTS.md again and decide on it as it stands.`,
  /** A change that would take a file past its character budget. */
  overBudget: ({
    budget,
    chars,
    path,
  }: {
    budget: number;
    chars: number;
    path: string;
  }) =>
    `${path} would hold ${chars} characters, past its budget of ${budget}: merge or remove one of its rules first.`,
} as const;
