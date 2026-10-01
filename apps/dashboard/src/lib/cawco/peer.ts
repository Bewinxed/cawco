import type { InstanceRow } from "./client.svelte";

/**
 * One session the composer can hand work to, as the rail names it.
 *
 * The rail's own label is the project leaf, so `@keeboard` in the composer and
 * "keeboard" in the sidebar are the same word for the same thing — the point of
 * addressing by name rather than by the id the wire uses.
 */
export interface PeerTarget {
  busy: boolean;
  hostname: string;
  id: string;
  label: string;
  machineId: string;
}

/** The last path segment, which is what the rail shows for a session. */
export const leafOf = (path: string): string =>
  path.split("/").filter(Boolean).pop() ?? path;

/**
 * Matches a partial `@name` against the offered sessions. Case-insensitive and
 * unanchored, so `@keeb` and `@board` both find `keeboard` — the reader is
 * remembering a project, not typing an identifier.
 */
export function matchPeers(peers: PeerTarget[], term: string): PeerTarget[] {
  const needle = term.trim().toLowerCase();
  if (!needle) {
    return peers;
  }
  return peers.filter(
    (peer) =>
      peer.label.toLowerCase().includes(needle) ||
      peer.hostname.toLowerCase().includes(needle)
  );
}

/**
 * The `@token` being typed at the caret, or `null`.
 *
 * A mention is only live while the caret sits inside it, and only when the `@`
 * opens a word — an email address or a `foo@bar` in a path is not an address
 * for us, and popping a menu over one would fight the reader mid-sentence.
 */
const WHITESPACE = /\s/;

export function mentionAt(
  text: string,
  caret: number
): { term: string; start: number } | null {
  const before = text.slice(0, caret);
  const at = before.lastIndexOf("@");
  if (at === -1) {
    return null;
  }
  // Opening a word: start of input, or preceded by whitespace.
  if (at > 0 && !WHITESPACE.test(before[at - 1])) {
    return null;
  }
  const term = before.slice(at + 1);
  // Still one word — a space ends the mention.
  if (WHITESPACE.test(term)) {
    return null;
  }
  return { term, start: at };
}

/** How the rail's rows become addressable targets, minus the session itself. */
export function targetsFrom(
  rows: InstanceRow[],
  hostnameOf: (machineId: string) => string,
  busyOf: (instanceId: string) => boolean
): PeerTarget[] {
  return rows.map((row) => ({
    id: row.id,
    machineId: row.machineId,
    label: leafOf(row.cwd),
    hostname: hostnameOf(row.machineId),
    busy: busyOf(row.id),
  }));
}
