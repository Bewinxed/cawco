/**
 * An id as the product shows it: its first 8 characters (`5a167bde` for a
 * session, a workspace, an item, a pin). Every log line, tool answer, label
 * and path that names a thing by a short id writes it here, and every tool
 * that takes an id takes this form back (hub handles.ts reads a prefix of 6
 * or more).
 */

/** The short form of `id`. */
export const shortId = (id: string): string =>
  // @limit external: CawCo shows an id as its first 8 hex characters, the first group of a UUID (RFC 9562 section 4), the form every tool, log line and path names a thing by
  id.slice(0, 8);
