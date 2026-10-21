/**
 * A rich reference: something CawCo knows, named in written words as a
 * markdown link whose destination is a `cawco:` URL, `[label](cawco:<kind>/<id>)`.
 * The dashboard draws each kind it knows as that kind's element (a session
 * as its chip); any other renderer draws it as a link with its label, and an
 * unknown kind or id reads as the label alone. CommonMark takes any URI
 * scheme as a link's destination (spec 0.31.2, Links).
 *
 * Agents are told to write it (the cawco MCP server's instructions), and
 * CawCo's own tool results and reports write it wherever they name a
 * session, so the form is the one they copy.
 */

/** The kinds a reference can name. A new kind is added here and to the dashboard's registry. */
export const REFERENCE_KINDS = ["session"] as const;
export type ReferenceKind = (typeof REFERENCE_KINDS)[number];

const SCHEME = "cawco:";
/** `cawco:<kind>/<id>`: the kind a word, the id the rest. */
const REFERENCE = /^cawco:([a-z][a-z-]*)\/(.+)$/;
/** What would end a link's label early. */
const LABEL_SYNTAX = /[\\[\]]/g;
/** What would end a link's destination early, past what `encodeURI` escapes. */
const DESTINATION_SYNTAX = /[()]/g;

/** A reference's markdown: `[label](cawco:<kind>/<id>)`. */
export const referenceLink = (
  kind: ReferenceKind,
  id: string,
  label: string
): string =>
  `[${label.replace(/\s+/g, " ").trim().replace(LABEL_SYNTAX, "\\$&") || id}](${SCHEME}${kind}/${encodeURI(id).replace(DESTINATION_SYNTAX, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`)})`;

/**
 * A session, delegate or Caw thread named by its full id (or, as the
 * dashboard writes a mention, its handle `<dir>#<id8>`): its chip in the
 * dashboard.
 */
export const sessionLink = (id: string, title: string): string =>
  referenceLink("session", id, title);

/**
 * The kind and id a link's destination names, when it is a `cawco:` URL;
 * null for any other destination. The kind is returned as written: whether
 * it is one the reader knows is the reader's to say.
 */
export function parseReference(
  href: string
): { id: string; kind: string } | null {
  const match = REFERENCE.exec(href);
  if (!match) {
    return null;
  }
  try {
    return { kind: match[1] as string, id: decodeURI(match[2] as string) };
  } catch {
    return null;
  }
}

/**
 * The line every session's CawCo guidance carries: how to name a session in
 * what it writes, so the person sees the session itself and not its id.
 */
export const REFERENCE_GUIDANCE =
  "To mention a session, delegate or Caw thread in anything you write, link it by its full id: `[its title](cawco:session/<id>)`. CawCo shows the link as that session's chip; a bare id or handle stays plain text. CawCo's own tool results and reports name sessions this way.";
