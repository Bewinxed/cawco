/**
 * A command's description as a reader wants it: the `(plugin-name)` prefix
 * plugin descriptions lead with is dropped, since the source is shown
 * elsewhere. Falls back to the argument hint when there is no prose.
 */
export function cleanDetail(
  description?: string,
  argumentHint?: string,
  source?: string
): string | undefined {
  const prose = description?.trim();
  if (prose) {
    if (source && prose.startsWith(`(${source})`)) {
      return prose.slice(source.length + 2).trim();
    }
    return prose;
  }
  return argumentHint || undefined;
}
