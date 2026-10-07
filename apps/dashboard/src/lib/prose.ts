/**
 * The markdown surface every rendered document shares — chat messages and the
 * project home's docs rail — so a README reads exactly like an assistant reply.
 *
 * Inline code is its chip, not its markdown: Typography's backticks around it
 * are off. The chip is one box on the line (inline-block, capped at the
 * line): a token that fits moves to the next line whole, never split at a
 * hyphen, and only one longer than a whole line wraps inside it.
 */
export const PROSE =
  "prose prose-sm max-w-none break-words [&_pre]:bg-muted [&_pre]:text-foreground [&_pre]:border [&_pre]:border-border [&_pre]:rounded-[var(--radius-sm)] [&_pre]:overflow-x-auto [&_code]:text-meta [&_code]:text-foreground [&_:not(pre)>code]:inline-block [&_:not(pre)>code]:max-w-full [&_:not(pre)>code]:bg-[var(--code-bg)] [&_:not(pre)>code]:shadow-[inset_0_0_0_1px_var(--border-hairline)] [&_:not(pre)>code]:px-1 [&_:not(pre)>code]:rounded-[var(--radius-xs)] [&_:not(pre)>code]:[overflow-wrap:anywhere] [&_code]:before:content-none [&_code]:after:content-none";
