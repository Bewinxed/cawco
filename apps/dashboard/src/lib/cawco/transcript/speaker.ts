/**
 * Who a session's transcript says is speaking: its harness by name (DESIGN.md,
 * Voice: "name the harness or 'the agent'"),
 * as the app's TranscriptView names it, wherever the transcript stands (the
 * session's pane, a task attempt's).
 */
import { harnessName, harnessNamed } from "@cawco/core/harness/kinds";

/** A stored listing's older name for opencode. */
const ALIASES: Record<string, string> = { code: "opencode" };

export const speakerName = (harness: string | null | undefined): string => {
  const kind = harnessNamed(ALIASES[harness ?? ""] ?? harness);
  return kind ? harnessName(kind) : (harness ?? "Agent");
};
