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
 * session, a pin, a decision card or an artifact, so the form is the one
 * they copy.
 *
 * A place in an artifact is named by the artifact and the place, joined by
 * a slash: a pin by its number (`pin/<artifact>/12`, the number its disc
 * shows, never reused), a decision card by its id
 * (`decision/<artifact>/<card>`). The artifact itself is `artifact/<id>`.
 */
import type { ArtifactKind } from "./index";

/** The kinds a reference can name. A new kind is added here and to the dashboard's registry. */
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

/** A reference's markdown: `[label](cawco:<kind>/<id>)`. */
export const referenceLink = (
  kind: ReferenceKind,
  id: string,
  label: string
): string =>
  `[${label.replace(/\s+/g, " ").trim().replace(LABEL_SYNTAX, "\\$&") || id}](${SCHEME}${kind}/${encodeURI(id)})`;

/** A session, delegate or Caw thread named by its full id: its chip in the dashboard. */
export const sessionLink = (id: string, title: string): string =>
  referenceLink("session", id, title);

/** Pin `number` on artifact `artifact`, labelled with what it stands on: its chip opens the artifact at that pin. */
export const pinLink = (
  artifact: string,
  number: number,
  label: string
): string => referenceLink("pin", `${artifact}/${number}`, label);

/** Decision card `card` on page `artifact`, labelled with its question: its chip opens the page at that card. */
export const decisionLink = (
  artifact: string,
  card: string,
  label: string
): string => referenceLink("decision", `${artifact}/${card}`, label);

/** An artifact, labelled with its name: its chip brings it to the front of the panel. */
export const artifactLink = (id: string, name: string): string =>
  referenceLink("artifact", id, name);

/**
 * What a reference's chip draws of an artifact, as the hub holds it now
 * (`GET /api/artifacts/:id/places`): its name and kind, the session whose
 * panel holds it, each pin's state by its number, each decision card's
 * question and whether it is picked.
 */
export interface ArtifactPlaces {
  cards: { id: string; picked: boolean; question: string }[];
  id: string;
  /** The session whose panel holds it; null for a project's page no session holds. */
  instanceId: string | null;
  kind: ArtifactKind;
  name: string;
  pins: {
    /** Its thread's first line, for the chip's peek; null when nothing is written. */
    firstLine: string | null;
    id: string;
    /** Its element is gone from the page. */
    moved: boolean;
    /** What it stands on, in words (core pin-name.ts). */
    name: string;
    number: number;
    resolved: boolean;
    /** It holds an answer the person has not looked at (core comments.ts `pinUnread`). */
    unread: boolean;
  }[];
}

/** A pin's or a card's id (`<artifact>/<place>`) as its artifact and its place; null when it names no place. */
export function placeOf(id: string): { artifact: string; at: string } | null {
  const slash = id.indexOf("/");
  if (slash <= 0 || slash === id.length - 1) {
    return null;
  }
  return { artifact: id.slice(0, slash), at: id.slice(slash + 1) };
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
  "To mention a session, delegate or Caw thread in anything you write, link it by its full id: `[its title](cawco:session/<id>)`. CawCo shows the link as that session's chip; a bare id or handle stays plain text. CawCo's own tool results and reports name sessions this way. To point at a pin, a decision card or an artifact, write the link CawCo gave you for it: a pin's from its delivery or comment_reply (`[When](cawco:pin/<artifact>/12)`), a card's or an artifact's from artifact_create or artifact_update. CawCo draws each as a chip that opens it in the panel at that place; a bare number (\"pin 12\") stays plain text.";
