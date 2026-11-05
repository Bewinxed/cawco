import { toolWords } from "@cawco/core/words/tools";

/**
 * A tool sign-in's words split where they turn to quoting the tool's own
 * screen (core words/tools `screenOf`): CawCo's sentence, and the screen's
 * lines, one per line, or null where they quote none. Every reader draws the
 * two apart: the sentence in meta, the lines in the code face, muted
 * (ToolMatrix's cell and Unknown popover, SigninPanel's refusal).
 */
export function quotedScreen(words: string): {
  sentence: string;
  lines: string | null;
} {
  const lead = ` ${toolWords.signinScreen}`;
  const at = words.indexOf(lead);
  return at < 0
    ? { sentence: words, lines: null }
    : {
        sentence: words.slice(0, at),
        lines: words.slice(at + lead.length).trim(),
      };
}
