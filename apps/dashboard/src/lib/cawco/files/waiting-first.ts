/**
 * Files' artifacts with the ones waiting on the person first (92c966798:
 * their cards wear the needs-you dot), each part in the order it came: the
 * waiting ones are the ones the session's needs-you mark is raised for
 * (stores/needs.svelte.ts `artifactNeedsOpen`, core `waitingOnYou`), so they are
 * in sight as Files opens, never folded under "N more". Kept out of the
 * runes modules so a probe can call it.
 */
export const waitingFirst = <T extends { id: string }>(
  artifacts: readonly T[],
  waiting: ReadonlySet<string>
): T[] => [
  ...artifacts.filter((artifact) => waiting.has(artifact.id)),
  ...artifacts.filter((artifact) => !waiting.has(artifact.id)),
];
