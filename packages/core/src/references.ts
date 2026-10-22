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

/**
 * The kinds a reference can name. A new kind is added here and to the
 * dashboard's registry. A pin is named by its artifact and its number
 * (`<artifact>/<number>`: the number its pill shows, never reused), a
 * decision card by its artifact and its id (`<artifact>/<card>`), an
 * artifact by its id.
 */
export const REFERENCE_KINDS = [
  "session",
  "pin",
  "decision",
  "artifact",
] as const;
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

/** Pin `number` of artifact `artifact`, labelled by what it stands on: its chip opens the artifact at that pin's thread. */
export const pinLink = (
  artifact: string,
  number: number,
  label: string
): string => referenceLink("pin", `${artifact}/${number}`, label);

/** Decision card `card` of artifact `artifact`, labelled by its question: its chip opens the page at that card. */
export const decisionLink = (
  artifact: string,
  card: string,
  label: string
): string => referenceLink("decision", `${artifact}/${card}`, label);

/** Artifact `id`, labelled by its name: its chip brings it to the front of the panel. */
export const artifactLink = (id: string, name: string): string =>
  referenceLink("artifact", id, name);

/** A pin reference's id, `<artifact>/<number>`, read; null when it is not one. */
export function pinReference(
  id: string
): { artifact: string; number: number } | null {
  const slash = id.lastIndexOf("/");
  const number = Number(id.slice(slash + 1));
  return slash > 0 && Number.isInteger(number) && number > 0
    ? { artifact: id.slice(0, slash), number }
    : null;
}

/** A decision reference's id, `<artifact>/<card>`, read; null when it is not one. */
export function decisionReference(
  id: string
): { artifact: string; card: string } | null {
  const slash = id.indexOf("/");
  return slash > 0 && slash < id.length - 1
    ? { artifact: id.slice(0, slash), card: id.slice(slash + 1) }
    : null;
}

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
  "To mention a session, delegate or Caw thread in anything you write, link it by the handle CawCo's tools name it by, or its id: `[its title](cawco:session/cockpit#5a167bde)`. CawCo shows the link as that session's chip; a bare id or handle stays plain text. CawCo's own tool results and reports name sessions this way. " +
  "To point at a pin, a decision card or an artifact, write the link CawCo gave you for it: a pin's from its delivery or comment_reply (`[When](cawco:pin/<artifact>/12)`), a card's or an artifact's from artifact_create or artifact_update. CawCo draws each as a chip that opens it in the panel at that place; a bare number (\"pin 12\") stays plain text.";
