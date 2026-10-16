/**
 * Who a session's transcript says is speaking: its harness by name (WORDS.md:
 * "when a harness identity is needed, name it ('Claude Code', 'the agent')"),
 * as the app's TranscriptView names it, wherever the transcript stands (the
 * session's pane, a task attempt's).
 */
const HARNESS_LABEL: Record<string, string> = {
  claude: "Claude Code",
  opencode: "opencode",
  code: "opencode",
  pi: "pi",
};

export const speakerName = (harness: string | null | undefined): string =>
  HARNESS_LABEL[harness ?? ""] ?? harness ?? "Agent";
