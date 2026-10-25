/**
 * A rich reference: something CawCo knows, named in written words as a
 * markdown link whose destination is a `cawco:` URL, `[label](cawco:<kind>/<id>)`.
 * The dashboard draws each kind it knows as that kind's element (a session
 * as its chip); any other renderer draws it as a link with its label, and an
 * unknown kind or id reads as the label alone. CommonMark takes any URI
 * scheme as a link's destination (spec 0.31.2, Links).
 *
 * Agents are told to name things only by it (the cawco MCP server's
 * instructions), and CawCo's own tool results and reports lead with it
 * wherever they name a thing, its id kept inside the destination, so the
 * form is the one they copy.
 */

/**
 * The kinds a reference can name. A new kind is added here and to the
 * dashboard's registry. A pin is named by its artifact and its number
 * (`<artifact>/<number>`: the number its pill shows, never reused), a
 * spot an update changed by its artifact and its anchor
 * (`<artifact>/<anchor>`: the selector or canvas element id the hub marked
 * it by, core comments.ts `ChangedItem`), a decision card by its artifact and its id (`<artifact>/<card>`), an
 * artifact by its id. A task by its project and its id
 * (`<project>/<task>`: a task's id is its project's own number, `tsk-12`),
 * a task's to-do by those and its id (`<project>/<task>/<td-3>`), a
 * session's plan by the session (`<session>`), one of its steps by the
 * session and the step's id (`<session>/<step>`); a routine, a project and
 * a machine each by its own id.
 */
export const REFERENCE_KINDS = [
  "session",
  "pin",
  "change",
  "decision",
  "artifact",
  "task",
  "todo",
  "plan",
  "step",
  "routine",
  "project",
  "machine",
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

/** What an update changed on artifact `artifact` at `anchor`, labelled by what it is and says: its chip opens the panel at that spot, marked, with its comment's thread. */
export const changeLink = (
  artifact: string,
  anchor: string,
  label: string
): string => referenceLink("change", `${artifact}/${anchor}`, label);

/** Decision card `card` of artifact `artifact`, labelled by its question: its chip opens the page at that card. */
export const decisionLink = (
  artifact: string,
  card: string,
  label: string
): string => referenceLink("decision", `${artifact}/${card}`, label);

/** Artifact `id`, labelled by its name: its chip brings it to the front of the panel. */
export const artifactLink = (id: string, name: string): string =>
  referenceLink("artifact", id, name);

/** Task `task` of project `project`, labelled by its title: its chip opens the task. */
export const taskLink = (
  project: string,
  task: string,
  title: string
): string => referenceLink("task", `${project}/${task}`, title);

/** To-do `todo` of task `task` in project `project`, labelled by its words: its chip opens the task at it. */
export const todoLink = (
  project: string,
  task: string,
  todo: string,
  words: string
): string => referenceLink("todo", `${project}/${task}/${todo}`, words);

/** Session `session`'s plan, labelled by its name or its first step: its chip opens the plan. */
export const planLink = (session: string, label: string): string =>
  referenceLink("plan", session, label);

/** Step `step` of session `session`'s plan, labelled by its words: its chip opens the plan at it. */
export const stepLink = (
  session: string,
  step: string,
  words: string
): string => referenceLink("step", `${session}/${step}`, words);

/** Routine `id`, labelled by its name: its chip opens it. */
export const routineLink = (id: string, name: string): string =>
  referenceLink("routine", id, name);

/** Project `id`, labelled by its name: its chip opens the project. */
export const projectLink = (id: string, name: string): string =>
  referenceLink("project", id, name);

/** Machine `id`, labelled by its name: its chip opens the machines. */
export const machineLink = (id: string, name: string): string =>
  referenceLink("machine", id, name);

/**
 * A reference's id read as its `count` parts, each up to the next slash and
 * the last the rest; null when it has fewer or any is empty.
 */
export function referenceParts(id: string, count: number): string[] | null {
  const parts: string[] = [];
  let rest = id;
  for (let i = 1; i < count; i += 1) {
    const slash = rest.indexOf("/");
    if (slash <= 0) {
      return null;
    }
    parts.push(rest.slice(0, slash));
    rest = rest.slice(slash + 1);
  }
  return rest ? [...parts, rest] : null;
}

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

/** A change reference's id, `<artifact>/<anchor>`, read (the anchor is the rest: a selector may hold a slash); null when it is not one. */
export function changeReference(
  id: string
): { anchor: string; artifact: string } | null {
  const slash = id.indexOf("/");
  return slash > 0 && slash < id.length - 1
    ? { artifact: id.slice(0, slash), anchor: id.slice(slash + 1) }
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
 * The line every session's CawCo guidance carries: how to name anything
 * CawCo knows in what it writes, so the person sees the thing itself and
 * never its id.
 */
export const REFERENCE_GUIDANCE =
  "Name every session, delegate or Caw thread you mention by its link, `[its title](cawco:session/cockpit#5a167bde)`, written with the handle CawCo's tools name it by, or its id. " +
  "Name every pin, spot an update changed, decision card, artifact, task or to-do, plan or step, routine, project and machine by the link CawCo's tool results and deliveries give you for it (`[When](cawco:pin/<artifact>/12)`, `[Fix the tray](cawco:task/<project>/tsk-12)`); they name each thing this way. " +
  'The link is the one way to name it to the person, who cannot read an id: its label is the thing\'s title as the tool result gave it, and the id stays inside the link\'s destination, out of your words and the label ("tsk-12", "td-3", "pin 12"). CawCo draws each link as a chip that opens the thing where it lives.';
