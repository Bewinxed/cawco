import type {
  PermissionUpdate,
  PermissionUpdateDestination,
} from "@cawco/core";
import { questionsOf } from "@cawco/core";

/**
 * One line naming what a parked tool call would do. The permission card and the
 * fleet view's "needs attention" rail have to read identically — the rail is how
 * you decide which session to open, the card is what you approve there.
 */
export function permissionSummary(
  toolName: string,
  input: Record<string, unknown>
): string {
  // A question names itself: "AskUserQuestion operation" tells the rail's reader
  // nothing about which of their sessions is worth opening.
  const questions = questionsOf(toolName, input);
  if (questions) {
    return questions.map((question) => question.question).join(" · ");
  }

  switch (toolName) {
    case "Edit":
    case "Write":
    case "Read":
      return `${toolName} ${input.file_path ?? "unknown"}`;
    // opencode parks its asks under its own lowercase names, keyed `filepath`.
    case "edit":
    case "write":
    case "read":
      return `${toolName} ${input.filepath ?? input.filePath ?? "unknown"}`;
    case "Bash":
    case "bash": {
      const command = String(input.command ?? "");
      return `Run: ${command.length > 80 ? `${command.slice(0, 79)}…` : command}`;
    }
    case "webfetch":
      return `webfetch ${input.url ?? "unknown"}`;
    case "Glob":
    case "Grep":
      return `${toolName} ${input.pattern ?? "unknown"}`;
    default:
      return `${toolName} operation`;
  }
}

/** How much of a rule the card's "always allow" label carries before it is cut. */
const RULE_LABEL_MAX = 30;

/** One suggestion as a rule, written the way the SDK writes them: `Bash(git status:*)`. */
function ruleText(update: PermissionUpdate): string | null {
  if ("rules" in update) {
    const [rule] = update.rules;
    if (!rule) {
      return null;
    }
    return rule.ruleContent
      ? `${rule.toolName}(${rule.ruleContent})`
      : rule.toolName;
  }
  if (update.type === "addDirectories") {
    return update.directories[0] ?? null;
  }
  return null;
}

/**
 * How long a grant lasts, in the card's words. The SDK picks the destination
 * and the card only reports it: `localSettings` writes the rule into the
 * checkout's `.claude/settings.local.json`, which is not a session's promise.
 */
const SCOPE: Record<PermissionUpdateDestination, string> = {
  session: "session",
  cliArg: "session",
  localSettings: "this project",
  projectSettings: "this project",
  userSettings: "everywhere",
};

/**
 * What granting the SDK's suggestions would allow from now on, for the card's
 * "always allow" action: `short` fits on a button, `full` is what it titles
 * itself with — a rule you cannot read is a rule you cannot decide on.
 */
export function suggestedRule(
  suggestions: PermissionUpdate[]
): { short: string; full: string; scope: string } | null {
  for (const update of suggestions) {
    const full = ruleText(update);
    if (!full) {
      continue;
    }
    const short =
      full.length > RULE_LABEL_MAX
        ? `${full.slice(0, RULE_LABEL_MAX - 1)}…`
        : full;
    return { short, full, scope: SCOPE[update.destination] };
  }
  return null;
}
