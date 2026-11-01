/**
 * Lengths read off the tokens where a script needs them as numbers (a
 * graph's layout): each token's computed inline size, from a probe put in
 * `root` and taken out again, so a token the scheme, pointer or density
 * changes reads as it stands there.
 */
export function tokenLengths<T extends string>(
  root: HTMLElement,
  tokens: Record<T, `--${string}`>
): Record<T, number> {
  const read = {} as Record<T, number>;
  for (const [name, token] of Object.entries(tokens) as [T, string][]) {
    const probe = document.createElement("div");
    probe.style.position = "absolute";
    probe.style.inlineSize = `var(${token})`;
    root.append(probe);
    read[name] = probe.getBoundingClientRect().width;
    probe.remove();
  }
  return read;
}
