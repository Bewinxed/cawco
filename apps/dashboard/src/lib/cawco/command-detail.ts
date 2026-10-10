/**
 * The scope Claude Code appends to a skill's or command's description,
 * `… (project)` or `… (user)`: where it is defined, which the row's section
 * already says, and which would spend the one line it has.
 */
const SCOPE_SUFFIX = /\s*\((?:project|user)\)$/;

/**
 * A command's description as a reader wants it: the `(plugin-name)` prefix
 * plugin descriptions lead with, and the `(project)` / `(user)` scope Claude
 * Code ends them with, are dropped, since the source is shown elsewhere.
 * Falls back to the argument hint when there is no prose.
 */
export function cleanDetail(
  description?: string,
  argumentHint?: string,
  source?: string
): string | undefined {
  let prose = description?.trim().replace(SCOPE_SUFFIX, "");
  if (prose && source && prose.startsWith(`(${source})`)) {
    prose = prose.slice(source.length + 2).trim();
  }
  return prose || argumentHint || undefined;
}
