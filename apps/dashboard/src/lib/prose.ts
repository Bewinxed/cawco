/**
 * The markdown surface every rendered document shares — chat messages and the
 * project home's docs rail — so a README reads exactly like an assistant reply.
 *
 * Inline code is its chip, not its markdown: Typography's backticks around it
 * are off, and a long token breaks only where it cannot fit (`anywhere`,
 * not `break-all`, which split `tsk-3` mid-id at a phone's width).
 */
export const PROSE =
  "prose prose-sm max-w-none break-words [&_pre]:bg-muted [&_pre]:text-foreground [&_pre]:border [&_pre]:border-border [&_pre]:rounded-[var(--radius-sm)] [&_pre]:overflow-x-auto [&_code]:text-meta [&_code]:bg-muted [&_code]:text-foreground [&_code]:px-1 [&_code]:py-0.5 [&_code]:rounded-[var(--radius-xs)] [&_code]:[overflow-wrap:anywhere] [&_code]:before:content-none [&_code]:after:content-none";
