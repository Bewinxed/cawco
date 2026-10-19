/**
 * The markdown surface every rendered document shares — chat messages and the
 * project home's docs rail — so a README reads exactly like an assistant reply.
 *
 * Its `pre` and `code` dressing goes through Typography's own element
 * modifiers (`prose-pre:`, `prose-code:`) and the theme's `prose-chip:` for
 * inline code, written in the same form, so a `.not-prose` subtree (a fence's
 * code well) is left alone, as Typography leaves it.
 *
 * Inline code is its chip, not its markdown: Typography's backticks around it
 * are off. The chip is one box on the line (inline-block, capped at the
 * line): a token that fits moves to the next line whole, never split at a
 * hyphen, and only one longer than a whole line wraps inside it.
 */
export const PROSE =
  "prose prose-sm max-w-none wrap-break-word prose-pre:overflow-x-auto prose-pre:rounded-sm prose-pre:border prose-pre:border-border prose-pre:bg-neutral-2 prose-pre:text-ink-strong prose-code:text-meta prose-code:text-ink-strong prose-code:before:content-none prose-code:after:content-none prose-chip:inline-block prose-chip:max-w-full prose-chip:rounded-xs prose-chip:bg-code-bg prose-chip:px-(--c-code-chip-pad-x) prose-chip:wrap-anywhere prose-chip:inset-ring prose-chip:inset-ring-border-hairline";
