/**
 * Artifacts as an agent reads them: what is in the person's panel and whose
 * move it is, what they picked and wrote on each, their pins and threads.
 * Each artifact by its name and handle, which every artifact tool takes
 * back (handles.ts); a pin by its number and handle. The whole record
 * (every id, hash and time, a decision page's program) is the detailed form.
 */

import { type Pin, pinStandsOn, type ThreadEntry } from "@cawco/core/comments";
import { PLACES_KEY } from "@cawco/core/decisions";
import type { CanvasSpec, DesignMap } from "@cawco/core/stage";
import type {
  ArtifactRead,
  ArtifactStatus,
  Browsed,
  CommentRead,
  ComponentWritten,
  Created,
  DecisionAnswer,
  GraphBroken,
  Opened,
  Promoted,
  Removed,
  Revised,
  Shown,
} from "../artifacts/service";
import type { Picture, Presented } from "../mcp-tool";
import { LISTED } from "./sessions";
import {
  ago,
  ahead,
  count,
  handle,
  lines,
  listed,
  quote,
  valueWords,
  verbatim,
} from "./words";

/** What `artifact_update`'s `ask` answers. */
export interface AskChanged {
  ask: string;
  id: string;
}

/** What a component canvas's own change answers: a states file's write, or the canvas's new spec. */
export type ComponentChanged =
  ComponentWritten | { id: string; revision: number; spec: CanvasSpec };

/** `artifact_update`'s answer, by the change it made. */
export type Updated =
  | { answer: AskChanged; change: "ask" }
  | { answer: Revised; change: "statements" }
  | { answer: ComponentChanged; change: "component" }
  | { answer: ArtifactRead; change: "page" };

/** What `comment_reply` answers. */
export interface CommentReplied {
  entry: ThreadEntry;
  /** The pin's link, `[label](cawco:pin/<artifact>/<number>)`. */
  link: string;
  number: number;
  pin: string;
}

/** What `comment_resolve` answers. */
export interface CommentResolved {
  /** The pin's link. */
  link: string;
  number: number;
  pin: string;
  resolvedAt: string;
}

/** A decision page's cards' links, as the agent names each to the person. */
const cardLinkLines = (
  heading: string,
  cards: Record<string, string> | undefined
): string[] => {
  const links = Object.values(cards ?? {});
  return links.length > 0 ? [heading, ...links.map((link) => `- ${link}`)] : [];
};

/** An artifact as an agent names it: `pricing (page 08899254)`. */
const named = (artifact: { id: string; kind: string; name: string }): string =>
  `${artifact.name} (${artifact.kind} ${handle(artifact.id)})`;

/** Whose move an artifact is, in words. */
const moveWords = (waitingOn: ArtifactStatus["waitingOn"]): string => {
  if (waitingOn.length === 2) {
    return "waiting on you and the person";
  }
  if (waitingOn[0] === "person") {
    return "waiting on the person";
  }
  return waitingOn[0] === "session" ? "waiting on you" : "nobody's move";
};

/** Whether the person has it on screen, and has opened it. */
const screenWords = (status: ArtifactStatus): string => {
  if (!status.shown) {
    return "in the panel, not on screen";
  }
  return status.opened ? "on screen, opened" : "on screen, not opened yet";
};

/** One artifact of the panel as a line. */
const statusLine = (status: ArtifactStatus, now: number): string => {
  const facts = [
    screenWords(status),
    ...(status.picks
      ? [
          `${status.picks.made}/${status.picks.asked} picked${status.picks.unsent > 0 ? `, ${status.picks.unsent} unsent` : ""}`,
        ]
      : []),
    ...(status.picksAwaiting > 0
      ? [`${count(status.picksAwaiting, "sent pick")} to read`]
      : []),
    ...(status.unread > 0 ? [`${count(status.unread, "change")} unread`] : []),
    ...(status.pins > 0 ? [`${count(status.pins, "open pin")}`] : []),
    ...(status.sent ? ["Send pressed since your last change"] : []),
    moveWords(status.waitingOn),
    ...(status.session ? [`made in session ${handle(status.session)}`] : []),
    ...(status.madeBy ? [`put here by delegate ${handle(status.madeBy)}`] : []),
    `changed ${ago(status.updatedAt, now)}`,
  ];
  return `- ${named(status)}, ${status.does}: ${quote(status.ask, 140)} · ${facts.join(" · ")}`;
};

/** `artifact_list`: the panel, newest first. */
export const artifactListWords = (statuses: ArtifactStatus[]): string => {
  const now = Date.now();
  const shown = statuses.slice(0, LISTED);
  return statuses.length === 0
    ? "No artifacts: artifact_create opens one in the person's panel."
    : lines(
        `${count(statuses.length, "artifact")}, newest first; every artifact tool takes the name or the handle:`,
        shown.map((status) => statusLine(status, now)),
        statuses.length > shown.length &&
          `…and ${statuses.length - shown.length} older ones: artifact_delete takes those a newer one superseded.`
      );
};

/** One choice's answer as a line. */
const answerLine = (answer: DecisionAnswer, now: number): string => {
  const asked = `${answer.id}${answer.question ? ` ${quote(answer.question, 100)}` : ""}`;
  const note =
    answer.answer !== "open" && answer.note
      ? `; note ${verbatim(answer.note)}`
      : "";
  const earlier =
    answer.answer !== "open" && answer.earlierRevision
      ? ", on an earlier revision"
      : "";
  switch (answer.answer) {
    case "open":
      return `- ${asked}: no pick yet${answer.note ? `; note ${verbatim(answer.note)}` : ""}`;
    case "picked":
      return `- ${asked}: picked ${listed(answer.options.map((option) => (option.label ? `${option.id} ${quote(option.label, 60)}` : option.id)))} ${ago(answer.at, now)}${earlier}${note}`;
    case "cleared":
      return `- ${asked}: picked, then cleared ${ago(answer.at, now)}${earlier}; nothing picked now${note}`;
    case "gone":
      return `- ${asked}: picked ${listed(answer.options)} ${ago(answer.at, now)}, but the page no longer offers ${listed(answer.gone)}${earlier}${note}`;
    default: {
      const unhandled: never = answer;
      return String(unhandled);
    }
  }
};

/** The person's entries that answer no choice: a page's `cawco.set` values and notes. */
const valueLines = (read: ArtifactRead, now: number): string[] => {
  const asked = new Set((read.decisions ?? []).map((answer) => answer.id));
  return Object.entries(read.state)
    .filter(([key]) => !(asked.has(key) || key === PLACES_KEY))
    .map(([key, entry]) => {
      const said = [
        ...(entry.options.length > 0
          ? [`picked ${listed(entry.options)}`]
          : []),
        ...(entry.value === null || entry.value === undefined
          ? []
          : [`set ${valueWords(entry.value)}`]),
        ...(entry.note ? [`note ${verbatim(entry.note)}`] : []),
      ];
      return `- ${key}: ${said.length > 0 ? said.join("; ") : "cleared"} ${ago(entry.at, now)}${entry.earlierRevision ? ", on an earlier revision" : ""}`;
    });
};

/** A page's or preview's send, in words; a canvas has no Send to speak of. */
const sentWords = (read: ArtifactRead, now: number): string => {
  if (read.kind === "canvas") {
    return "";
  }
  return read.sentAt === null
    ? "The person has not pressed Send yet."
    : `The person pressed Send ${ago(read.sentAt, now)}${read.sentText ? `, the page sending ${verbatim(read.sentText)}` : ""}.`;
};

/** A stage or served preview's state, in words. */
const stageWords = (
  read: Pick<ArtifactRead, "stage" | "unreached">
): string[] => [
  ...(read.stage
    ? [
        `Its ${read.stage.runs === "serve" ? "server" : "stage"} in ${read.stage.dir}: ${read.stage.status}${read.stage.message ? `, ${read.stage.message}` : ""}.`,
      ]
    : []),
  ...(read.unreached
    ? [
        `Its stage could not be reached (${read.unreached.down}) since ${ago(read.unreached.since)}: ${read.unreached.why}`,
      ]
    : []),
];

/** The picture a read answered, as an image beside the words; a canvas or frame with none says so. */
const picturesOf = (read: ArtifactRead): Picture[] =>
  typeof read.png === "string"
    ? [{ data: read.png, mimeType: "image/png" }]
    : [];

/** A component canvas's read: its frames, stories, moves and the person's dials, each a line. */
const componentLines = (read: ArtifactRead): string[] => {
  const extra = read as ArtifactRead & {
    dials?: unknown;
    errors?: { file: string; line: number | null; message?: string }[];
    frame?: Record<string, unknown>;
    hint?: string;
    moves?: {
      from: string;
      to: string;
      animations: unknown[];
      error?: string;
    }[];
    render?: {
      by: string;
      cut?: string;
      frames: {
        box: { h: number; w: number };
        error?: string;
        form: string;
        interaction: string;
        label: string | null;
        scheme?: string;
        state: string;
        story: string;
      }[];
      pageErrors?: string[];
      unnamed: string[];
    };
    stories?: {
      argsChanged: string[];
      interactions: string[];
      label: string | null;
      name: string;
    }[];
    story?: { args: unknown; code: unknown; name: string };
    tuned?: unknown;
  };
  const { render } = extra;
  return [
    ...(extra.errors?.length
      ? [
          "Compile errors:",
          ...extra.errors.map(
            (one) =>
              `- ${one.file}${one.line === null ? "" : `:${one.line}`}: ${one.message ?? "no message"}`
          ),
        ]
      : []),
    ...(render
      ? [
          `Frames, as ${render.by} drew them:`,
          ...render.frames.map(
            (frame) =>
              `- ${frame.story}${frame.label ? ` ${quote(frame.label, 60)}` : ""} · ${frame.interaction}${frame.scheme ? ` · ${frame.scheme}` : ""} · ${frame.state} · ${frame.box.w}×${frame.box.h}${frame.error ? ` · ${frame.error}` : ""}`
          ),
          ...(render.cut ? [render.cut] : []),
          ...(render.unnamed.length > 0
            ? [
                `Stories with no name of their own: ${render.unnamed.join(", ")}.`,
              ]
            : []),
          ...(render.pageErrors?.length
            ? [`The canvas page's errors: ${render.pageErrors.join("; ")}`]
            : []),
        ]
      : [
          "No browser has drawn it since its files changed: read with render: true.",
        ]),
    ...(extra.stories?.length
      ? [
          "Stories:",
          ...extra.stories.map(
            (story) =>
              `- ${story.name}${story.label ? ` ${quote(story.label, 60)}` : ""}: ${story.interactions.join(", ") || "not drawn"}${story.argsChanged.length > 0 ? `; sets ${story.argsChanged.join(", ")}` : ""}`
          ),
        ]
      : []),
    ...(extra.moves?.length
      ? [
          "Moves:",
          ...extra.moves.map(
            (move) =>
              `- ${move.from} → ${move.to}: ${count(move.animations.length, "animation")}${move.error ? `; ${move.error}` : ""}`
          ),
        ]
      : []),
    ...(extra.dials === undefined
      ? []
      : [`The person's dials: ${valueWords(extra.dials, 600)}`]),
    ...(extra.tuned === undefined
      ? []
      : [`What they tuned: ${valueWords(extra.tuned, 600)}`]),
    ...(extra.frame
      ? [`The frame asked: ${valueWords(extra.frame, 2000)}`]
      : []),
    ...(extra.story
      ? [
          `Story ${extra.story.name}: args ${valueWords(extra.story.args, 1500)}; code ${valueWords(extra.story.code, 1500)}`,
        ]
      : []),
    ...(read.weight
      ? [
          `It loads ${count(read.weight.modules, "module")}, ${read.weight.bytes} bytes${read.weight.over ? `, over its budget: ${valueWords(read.weight.cut, 400)}` : ""}.`,
        ]
      : []),
    ...(read.verify ? [read.verify] : []),
    ...(extra.hint ? [extra.hint] : []),
  ];
};

/** A page's choices and the values set beside them; that there are none, on a page or preview. */
const pickLines = (read: ArtifactRead, now: number): string[] => {
  const decisions = read.decisions ?? [];
  const answered = decisions.filter(
    (answer) => answer.answer === "picked"
  ).length;
  const values = valueLines(read, now);
  const none =
    read.kind !== "canvas" &&
    read.kind !== "component" &&
    decisions.length === 0 &&
    values.length === 0;
  return [
    ...(decisions.length > 0
      ? [`Choices (${answered} of ${decisions.length} picked):`]
      : []),
    ...decisions.map((answer) => answerLine(answer, now)),
    ...(values.length > 0
      ? ["What the person set beside them:", ...values]
      : []),
    ...(none ? ["Nothing picked, noted or set on it."] : []),
    ...(read.removed?.length
      ? [`Taken out since: ${listed(read.removed)}.`]
      : []),
  ];
};

/** A canvas's outline, what the person changed on it, and its picture. */
const canvasLines = (read: ArtifactRead, now: number): string[] => {
  if (read.kind !== "canvas") {
    return [];
  }
  const outline = read.outline?.trim()
    ? lines("Outline:", read.outline)
    : "The canvas is empty.";
  const changed = read.changed?.length
    ? `The person changed ${listed(read.changed)}.`
    : "The person changed nothing since.";
  const picture = read.pictureAt
    ? `Its picture was drawn ${ago(read.pictureAt, now)}.`
    : "No picture of it has been drawn yet.";
  return [
    outline,
    changed,
    ...(read.changedUnderYou?.length
      ? [`Changed under you: ${listed(read.changedUnderYou)}.`]
      : []),
    picture,
  ];
};

/** What a write to it did: elements written, deleted or not found, a states file's lines. */
const writeLines = (read: ArtifactRead): string[] => [
  ...(read.wrote?.length ? [`Wrote ${listed(read.wrote)}.`] : []),
  ...(read.deleted?.length ? [`Deleted ${listed(read.deleted)}.`] : []),
  ...(read.missing?.length
    ? [`No such element: ${listed(read.missing)}.`]
    : []),
  ...(read.edit
    ? [
        `Wrote ${read.edit.file}:${read.edit.lines.from}-${read.edit.lines.to}${read.edit.formatted ? `, formatted by ${read.edit.formatted}` : ""}.`,
      ]
    : []),
];

/** `artifact_read`: what the person did on it, in words, its picture beside them. */
export const artifactReadWords = (read: ArtifactRead): Presented => {
  const now = Date.now();
  const text = lines(
    `${named(read)}, revision ${read.revision}.`,
    sentWords(read, now),
    read.draft && "The person has it open in the composer and has not sent it.",
    read.held,
    pickLines(read, now),
    canvasLines(read, now),
    writeLines(read),
    read.workspace &&
      `It previews a server of workspace ${handle(read.workspace)}.`,
    stageWords(read),
    read.kind === "component" && componentLines(read),
    read.program !== undefined &&
      'Its program is in response_format: "detailed"; artifact_update\'s statements revise it.',
    `Read at seq ${read.seq}: since: ${read.seq} reads only what changes after this.`
  );
  const pictures = picturesOf(read);
  return pictures.length > 0 ? { text, pictures } : text;
};

/**
 * An answer as the hub keeps it, less its `route`: a bare path on the hub's
 * preview listener that opens nowhere an agent can reach (artifact_browse
 * answers the address its browser loads). The HTTP wire keeps it: installed
 * apps decode it.
 */
const withoutRoute = <T extends object>(answer: T): Omit<T, "route"> => {
  const { route: _route, ...rest } = answer as T & { route?: string };
  return rest;
};

/** `artifact_create`, detailed: the hub's whole answer as JSON, less its route. */
export const artifactCreatedDetailed = (created: Created): Presented =>
  JSON.stringify(withoutRoute(created));

/** `artifact_read`, detailed: the hub's whole read as JSON, its picture as an image beside it. */
export const artifactReadDetailed = (whole: ArtifactRead): Presented => {
  const read = withoutRoute(whole) as ArtifactRead;
  const { png, ...rest } = read;
  const pictures = picturesOf(read);
  const text = JSON.stringify(
    png === undefined
      ? rest
      : { ...rest, png: pictures.length > 0 ? "beside" : png }
  );
  return pictures.length > 0 ? { text, pictures } : text;
};

/** Whether a show or create put it on the person's screen, in words. */
const openedWords = (opened: Opened): string =>
  opened.opened
    ? "It is on the person's screen."
    : `Not on screen: ${opened.why}`;

/** What a program left broken on the picks and the graph. */
const brokenLines = (broken: GraphBroken | undefined): string[] =>
  broken
    ? [
        ...(broken.picked?.length
          ? [
              `Decisions taken out that the person had picked (their picks are kept): ${listed(broken.picked)}.`,
            ]
          : []),
        ...Object.entries(broken.options ?? {}).map(
          ([decision, options]) =>
            `${decision}: the person picked ${listed(options)}, which the page no longer offers.`
        ),
        ...Object.entries(broken.after ?? {}).map(
          ([decision, cards]) =>
            `${decision} is gone, and ${listed(cards)} come after it: no edge is drawn.`
        ),
        ...(broken.unlinked?.length
          ? [
              `Its afters name no decision of the project: ${listed(broken.unlinked)}.`,
            ]
          : []),
      ]
    : [];

/** `artifact_create`: whether it opened, and what a decision page or canvas came to. */
export const artifactCreatedWords = (created: Created): string =>
  lines(
    `Made ${named(created)}. ${openedWords(created.opened ? { opened: true } : { opened: false, why: created.why ?? "no view said why" })}`,
    created.link && `Name it to the person as ${created.link}.`,
    created.held,
    created.note,
    cardLinkLines("Its cards, as you name each to the person:", created.cards),
    !!created.dropped?.length &&
      `Components the library does not have, dropped: ${listed(created.dropped)}.`,
    brokenLines(created.broken),
    created.weight &&
      `It loads ${count(created.weight.files, "file")}, ${created.weight.bytes} bytes at most.`,
    !!created.errors?.length && [
      "Compile errors:",
      ...created.errors.map(
        (one) =>
          `- ${one.file}${one.line === null ? "" : `:${one.line}`}: ${one.message ?? "no message"}`
      ),
    ],
    created.stage &&
      `Its ${created.stage.runs === "serve" ? "server" : "stage"}: ${created.stage.status}${created.stage.message ? `, ${created.stage.message}` : ""}.`,
    created.render && [
      `Frames, as ${created.render.by} drew them:`,
      ...created.render.frames.map(
        (frame) =>
          `- ${frame.story} · ${frame.interaction} · ${frame.state} · ${frame.box.w}×${frame.box.h}${frame.error ? ` · ${frame.error}` : ""}`
      ),
      ...(created.render.cut ? [created.render.cut] : []),
    ],
    !!created.moves?.length &&
      `${count(created.moves.length, "move")} between its stories.`,
    created.outline !== undefined &&
      (created.outline.trim()
        ? lines("Outline:", created.outline)
        : "The canvas is empty."),
    !!created.wrote?.length && `Wrote ${listed(created.wrote)}.`,
    created.hint
  );

/** A decision page's revision: what its statements did, its decisions and cards now, what it broke. */
const revisedWords = (revised: Revised): string => {
  const said = (verb: string, names: string[]) =>
    names.length > 0 ? [`${verb} ${listed(names)}`] : [];
  const statements = [
    ...said("added", revised.statements.added),
    ...said("rewrote", revised.statements.replaced),
    ...said("dropped, as nothing reaches them,", revised.statements.removed),
  ];
  return lines(
    `Revised to revision ${revised.revision}${statements.length > 0 ? `: ${statements.join("; ")}` : ""}.`,
    revised.held,
    `Its decisions now: ${listed(revised.decisions) || "none"}.`,
    cardLinkLines(
      "The cards it put in or rewrote, as you name each to the person:",
      revised.cards
    ),
    revised.moved.added.length > 0 &&
      `New decisions: ${listed(revised.moved.added)}.`,
    revised.moved.removed.length > 0 &&
      `Decisions taken out (a pick on one is kept): ${listed(revised.moved.removed)}.`,
    !!revised.dropped?.length &&
      `Components the library does not have, dropped: ${listed(revised.dropped)}.`,
    brokenLines(revised.broken)
  );
};

/** A component canvas's change: its new spec, or a states file's write and its frames. */
const componentChangedWords = (changed: ComponentChanged): string => {
  if ("spec" in changed) {
    return `The canvas is at revision ${changed.revision}: ${count(changed.spec.edges?.length ?? 0, "edge")}, ${count(Object.keys(changed.spec.group ?? {}).length, "group")}, ${count(changed.spec.dials?.length ?? 0, "dial")}.`;
  }
  return lines(
    `Wrote ${changed.file}:${changed.lines.from}-${changed.lines.to}${changed.formatted ? `, formatted by ${changed.formatted}` : ""}.`,
    changed.story
      ? `Story ${changed.story.name}: args ${valueWords(changed.story.args, 1500)}.`
      : "The story it named is gone.",
    changed.render === "unseen"
      ? "No browser drew it within the wait: read with render: true."
      : [
          "Its frames, as drawn:",
          ...changed.render.map(
            (frame) =>
              `- ${frame.story} · ${frame.interaction} · ${frame.state} · ${frame.box.w}×${frame.box.h}${frame.error ? ` · ${frame.error}` : ""}`
          ),
        ]
  );
};

/** A page's change: the page as it reads now, its link first when the answer carries it. */
const pageChangedWords = (
  answer: ArtifactRead & { link?: string }
): Presented => {
  const read = artifactReadWords(answer);
  const { link } = answer;
  if (!link) {
    return read;
  }
  const naming = `Name it to the person as ${link}.`;
  return typeof read === "string"
    ? lines(naming, read)
    : { ...read, text: lines(naming, read.text) };
};

/** `artifact_update`: what the change came to. */
export const artifactUpdatedWords = (updated: Updated): Presented => {
  switch (updated.change) {
    case "ask":
      return `Its head now asks ${quote(updated.answer.ask, 200)}.`;
    case "statements":
      return revisedWords(updated.answer);
    case "component":
      return componentChangedWords(updated.answer);
    case "page":
      return pageChangedWords(updated.answer);
    default: {
      const unhandled: never = updated;
      return String(unhandled);
    }
  }
};

/** `artifact_update`, detailed: the hub's own answer for the change, as JSON. */
export const artifactUpdatedDetailed = (updated: Updated): Presented =>
  updated.change === "page"
    ? artifactReadDetailed(updated.answer)
    : JSON.stringify(withoutRoute(updated.answer));

/** `artifact_show`: the artifact by its link, and whether it is on the person's screen. */
export const artifactShownWords = (shown: Shown): string =>
  `${shown.link}: ${openedWords(shown)}`;

/** `artifact_browse`: the address to load, and until when. */
export const artifactBrowsedWords = (
  browsed: Browsed & { link: string }
): string =>
  `Load ${browsed.url} once in your browser tool to open ${browsed.link}. ${browsed.expiresAt === null ? "It needs no pass: it opens for as long as this session runs." : `It opens until ${ahead(browsed.expiresAt)} (15 minutes) or this session ends; call again for a fresh one.`}`;

/** `artifact_promote`. */
export const artifactPromotedWords = (promoted: Promoted): string =>
  `Committed to ${promoted.path} in the project's folder (commit ${promoted.commit.slice(0, 8)}).`;

/** `artifact_delete`: what the panel shows now. */
export const artifactRemovedWords = (removed: Removed): string =>
  removed.showing
    ? `Removed. Your panel shows ${named(removed.showing)} now.`
    : "Removed. Your panel shows nothing now.";

/** One pin's thread, oldest first, each entry a line. */
const threadLines = (thread: ThreadEntry[], now: number): string[] =>
  thread.map((entry) => {
    const who = entry.by === "agent" ? "you" : "the person";
    const attached = entry.attachments?.length
      ? ` (attached ${listed(entry.attachments.map((one) => one.name))})`
      : "";
    const files = entry.files?.length
      ? ` (changed ${listed(entry.files)})`
      : "";
    const unsent =
      entry.by === "person" && !entry.sentAt ? ", not sent yet" : "";
    return `  - ${who}, ${ago(entry.at, now)}${unsent}: ${entry.text.trim() ? verbatim(entry.text) : "no words"}${attached}${files}`;
  });

/** A whole id in a line of words. */
const WHOLE_ID = /[0-9a-f]{8}-[0-9a-f-]{27}/;

/** Whether a pin is open or resolved, in words. */
const pinState = (pin: Pin, now: number): string => {
  if (pin.resolvedAt) {
    return `resolved ${ago(pin.resolvedAt, now)}`;
  }
  return pin.movedAt
    ? "open, its element gone from the page since a revision"
    : "open";
};

/** One pin: what it stands on, its state, its thread. */
const pinLines = (
  pin: Pin & {
    inkBox?: { h: number; w: number; x: number; y: number };
    link: string;
  },
  now: number
): string[] => {
  const [heading, ...facts] = pinStandsOn(pin);
  return [
    heading ?? `## ${pin.number}.`,
    ...facts.map((fact) =>
      fact.startsWith("- Inside the artifact ")
        ? fact.replace(WHOLE_ID, (id) => handle(id))
        : fact
    ),
    ...(pin.inkBox
      ? [
          `- Ink: ${Math.round(pin.inkBox.w)} × ${Math.round(pin.inkBox.h)} px at ${Math.round(pin.inkBox.x)}, ${Math.round(pin.inkBox.y)} in the page`,
        ]
      : []),
    `- Pin ${handle(pin.id)}: ${pinState(pin, now)}, left ${ago(pin.at, now)}`,
    `- Link: ${pin.link}`,
    ...threadLines(pin.thread, now),
  ];
};

/** `comment_read`: each artifact's pins, what each stands on, and its thread. */
export const commentReadWords = (
  read: CommentRead,
  asked: { filter?: "open" | "resolved" | "all" }
): string => {
  const now = Date.now();
  const filter = asked.filter ?? "open";
  if (read.artifacts.length === 0) {
    return `No ${filter === "all" ? "" : `${filter} `}pins. New ones reach you by themselves. Read at ${read.at}: since takes it.`;
  }
  return lines(
    read.artifacts.flatMap((artifact) => [
      `# ${artifact.link} (${artifact.kind} ${handle(artifact.id)}): ${count(artifact.pins.length, filter === "all" ? "pin" : `${filter} pin`)}${artifact.address.endsWith(`/${artifact.id}`) ? "" : `, marked at ${artifact.address}`}`,
      ...artifact.pins.flatMap((pin) => pinLines(pin, now)),
    ]),
    "comment_reply and comment_resolve take a pin's handle.",
    `Read at ${read.at}: since takes it, for only what is newer.`
  );
};

/** `comment_reply`. */
export const commentRepliedWords = (replied: CommentReplied): string =>
  `Answered ${replied.link} (pin ${handle(replied.pin)}) in its thread${replied.entry.files?.length ? `, naming ${listed(replied.entry.files)}` : ""}.`;

/** `comment_resolve`. */
export const commentResolvedWords = (resolved: CommentResolved): string =>
  `Resolved ${resolved.link} (pin ${handle(resolved.pin)}). The person can reopen it.`;

/** `design_map`: each component of the library, or one's card. */
export const designMapWords = (map: DesignMap): string => {
  const linkWords = (links: DesignMap["components"][number]["madeOf"]) =>
    typeof links === "number"
      ? String(links)
      : listed(
          links.map((link) => `${link.name}${link.at ? ` (${link.at})` : ""}`)
        ) || "none";
  return lines(
    map.total === 0
      ? `No components under ${map.dir}.`
      : `${count(map.total, "component")} under ${map.dir} (toolchain root ${map.root}):`,
    map.components.map(
      (card) =>
        `- ${card.name} (${card.file}): ${count(card.states, "state")}, ${card.drawn} frames drawn; made of ${linkWords(card.madeOf)}; used in ${linkWords(card.usedIn)}${card.statesFiles?.length ? `; states files ${listed(card.statesFiles)}` : ""}${card.props?.length ? `; props ${listed(card.props.map((prop) => prop.name))}` : ""}${card.stories?.length ? `; stories ${listed(card.stories.map((story) => `${story.name}${story.drawn ? "" : " (not drawn)"}`))}` : ""}`
    ),
    map.has_more &&
      `${map.steer ?? "More past this page."} Next page: cursor ${map.next_cursor}.`
  );
};
