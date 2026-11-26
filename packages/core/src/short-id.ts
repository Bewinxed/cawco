/**
 * An id as the product shows it: its first 8 characters (`5a167bde` for a
 * session, a workspace, an item, a pin). Every log line, tool answer, label
 * and path that names a thing by a short id writes it here, and every tool
 * that takes an id takes this form back (hub handles.ts reads a prefix of 6
 * or more).
 */

/** The short form of a git commit or tree `sha` where no repository is at hand to ask: 12 characters. Where one is, ask git (`gitShort`, core git-short.ts), which writes the length it finds unique there. */
export const shortSha = (sha: string): string =>
  // @limit measured: 12 hex characters are 48 bits of an object's name, two more than the 10 git writes for this repository (`git rev-parse --short HEAD`); git reads any unique prefix of 4 or more ("The minimum length is 4", git-rev-parse --short, https://git-scm.com/docs/git-rev-parse)
  sha.slice(0, 12);

/** The short form of `id`. */
export const shortId = (id: string): string =>
  // @limit external: CawCo shows an id as its first 8 hex characters, the first group of a UUID (RFC 9562 section 4), the form every tool, log line and path names a thing by
  id.slice(0, 8);

/** A key as the product shows it: its last 4 characters. */
export const keyTail = (key: string): string =>
  // @limit measured: a key's last 4 characters name it among the keys one machine holds (62^4, about 14.8 million, tails) and give away about 24 of its bits
  key.slice(-4);
