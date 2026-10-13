/**
 * Artifacts (Projects spec §5.10): what the four tools and the panel do to
 * them. A session makes an artifact with `artifact_create`, changes it with
 * `artifact_update`, reads it with `artifact_read` and brings it to the front
 * of its panel with `artifact_show`; the person's picks, notes and values
 * live in the artifact's doc (docs.ts) and reach the session as one message
 * after {@link QUIET_MS} of quiet, at once while its turn runs, and at once
 * when the person sends.
 */
import { mkdirSync, readFileSync, writeFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentRow,
  ARTIFACT_NAME,
  type ArtifactChoices,
  type ArtifactKind,
  type ArtifactSummary,
  type ChoiceEntry,
  choiceEntryProblem,
  type InstanceRow,
  machineLabel,
  type PreviewSource,
  type ShownFailure,
} from "@cawco/core";
import {
  CANVAS_LIMITS,
  canvasOutline,
  excalidrawFile,
  NO_SCREEN,
} from "@cawco/core/canvas";
import { pageHash } from "@cawco/core/preview-proxy";
import { applyPatch, type Operation } from "rfc6902";
import { Doc, encodeStateAsUpdate } from "yjs";
import { PREVIEW_PORT } from "../config";
import type { ArtifactRow, ArtifactsDb } from "../db/artifacts";
import {
  canvasEntries,
  convertOnScreen,
  deleteElements,
  screenJoined,
} from "./canvas";
import type { ArtifactDocs } from "./docs";
import { picturePath } from "./sync";

/**
 * How long the person's changes wait for quiet before they go to the
 * session: `--dur-wait-grace` (1000ms) × 3, the spec's number.
 */
export const QUIET_MS = 3000;

/** The longest message a delivery makes; the rest is left to `artifact_read`. */
const MESSAGE_MAX = 8000;

export class ArtifactRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 422 | 503 | 504;
  constructor(
    status: 400 | 403 | 404 | 409 | 413 | 422 | 503 | 504,
    message: string
  ) {
    super(message);
    this.status = status;
  }
}

/**
 * What a create or a re-create names: a page from `html` or `dir`, a
 * preview of `port` or `dir` on `machine`, opened at `path`, or a canvas
 * drawn from skeleton `elements` or `mermaid`; each kind's fields only.
 */
export interface ArtifactInput {
  dir?: string | undefined;
  /**
   * A canvas the person opened in the composer (a pen's swipe, Draw, ⌘⇧D,
   * the panel's +): always a new one, `meta.draft` until its first send,
   * and not shown in the panel by being made.
   */
  draft?: boolean | undefined;
  /** A canvas's skeleton elements (Excalidraw's `convertToExcalidrawElements`). */
  elements?: SkeletonElement[] | undefined;
  html?: string | undefined;
  kind: ArtifactKind;
  machine?: string | undefined;
  /** A canvas's Mermaid diagram. */
  mermaid?: string | undefined;
  name: string;
  path?: string | undefined;
  port?: number | undefined;
  /**
   * The workspace whose dev server a port is: the caller's own, or one of its
   * delegates'. Omitted, the caller's own when it runs in one, unless
   * `machine` names the host the port is on.
   */
  workspace?: string | undefined;
}

/** A skeleton element as the agent writes it: a type, an optional id, and Excalidraw's own fields. */
export type SkeletonElement = { id?: string; type: string } & Record<
  string,
  unknown
>;

/** What `artifact_update` changes on a canvas: exactly one of these. */
export type CanvasChange =
  | { elements: SkeletonElement[] }
  | { delete: string[] }
  | { mermaid: string };

/** What `artifact_update` changes on a page: exactly one of these. */
export type PageChange = { html: string } | { patch: Operation[] };

/** The fields each kind takes, and what its refusal says it takes. */
const KIND_FIELDS = {
  page: { fields: ["html", "dir"], takes: "html or dir" },
  preview: {
    fields: ["port", "dir", "path", "machine", "workspace"],
    takes: "port or dir",
  },
  canvas: { fields: ["elements", "mermaid"], takes: "elements or mermaid" },
} as const;

const INPUT_FIELDS = [
  "html",
  "dir",
  "port",
  "path",
  "machine",
  "workspace",
  "elements",
  "mermaid",
] as const;

const strayFields = (input: ArtifactInput): string | null => {
  const own: readonly string[] = KIND_FIELDS[input.kind].fields;
  const stray = INPUT_FIELDS.filter(
    (key) => input[key] !== undefined && !own.includes(key)
  );
  if (stray.length === 0) {
    return null;
  }
  return `A ${input.kind} takes ${KIND_FIELDS[input.kind].takes}; ${stray.join(", ")} ${stray.length === 1 ? "is" : "are"} not for a ${input.kind}.`;
};

/** Why a preview's fields do not go together, or nothing. */
const previewProblem = (input: ArtifactInput): string | null => {
  if ((input.port === undefined) === (input.dir === undefined)) {
    return "A preview takes exactly one of port or dir.";
  }
  if (input.port === undefined && input.workspace !== undefined) {
    return "workspace goes with a port, not a dir.";
  }
  if (input.machine !== undefined && input.workspace !== undefined) {
    return "A workspace's port is on the workspace's machine: pass workspace for a workspace's server, or machine for a port on that machine's host.";
  }
  return null;
};

/** An entry as `artifact_read` answers it. */
type ReadEntry = ChoiceEntry & { earlierRevision?: true };

export interface ArtifactRead {
  /** A canvas's elements the person changed since `since` (or since your last read). */
  changed?: string[];
  /** A canvas's elements you replaced that the person had changed since your last read: "<id> changed under you". */
  changedUnderYou?: string[];
  /** Elements an update deleted, and the ids it named that the canvas does not hold. */
  deleted?: string[];
  /** A canvas the person opened in the composer and has not sent yet. */
  draft?: boolean;
  id: string;
  kind: ArtifactKind;
  missing?: string[];
  name: string;
  /** A canvas, as you read it: one line per element (core `canvasOutline`). */
  outline?: string;
  pageHash: string | null;
  /** When the canvas's latest picture was drawn; null when it has none. */
  pictureAt?: string | null;
  /** A canvas's latest picture, base64 PNG, when asked (`png: true`); null when it has none yet. */
  png?: string | null;
  /** Keys that changed since `since` and are no longer there. */
  removed?: string[];
  revision: number;
  sentAt: string | null;
  /** The cursor for the next read's `since`. */
  seq: number;
  /** Every key, or with `since` only those changed after it. */
  state: Record<string, ReadEntry>;
  /** A port preview's workspace, whose dev server it is. */
  workspace?: string;
  /** The element ids an update wrote. */
  wrote?: string[];
}

export interface Created {
  id: string;
  kind: ArtifactKind;
  name: string;
  /** A canvas made with nothing to draw says so. */
  note?: string;
  /** Whether a view the person is looking at has it on screen ({@link Opened}). */
  opened: boolean;
  /** A canvas's outline once drawn (core `canvasOutline`). */
  outline?: string;
  /**
   * A draft canvas's: the hub's preview listener, on the hub's host, where a
   * client that is not a page (the Apple app) loads the canvas at
   * `/__cawco/canvas/<id>/`, naming its session in a `cawco-preview` cookie.
   */
  port?: number;
  /** Its live document on the hub's preview listener. */
  route: string;
  /** Why it is not on screen, one sentence; only with `opened: false`. */
  why?: string;
  /** The element ids a canvas's create wrote. */
  wrote?: string[];
}

/**
 * Whether a view the person is looking at has the artifact on screen: a
 * dashboard tab (or the app) showing the session heard the open frame,
 * mounted the pane and loaded the page, and said so ({@link Artifacts.shown})
 * within {@link SHOWN_WAIT_MS}; else why not, in one sentence.
 */
export type Opened = { opened: true } | { opened: false; why: string };

/** How long a show waits for a view to say it has the artifact on screen. The spec's number. */
export const SHOWN_WAIT_MS = 10_000;

/** No view of the session said it showed the artifact in time. WORDS.md's error formula. */
export const NO_VIEW =
  "No open dashboard is showing this session. The artifact is in the session's panel and opens when one is.";

/** A view's word that it has (or could not load) the artifact at `revision` (`POST …/artifacts/:artifact/shown`). */
export interface ShownAck {
  /** Which view: a dashboard tab's id, or the app's. */
  client: string;
  /** Why the page didn't load; only with `ok: false`. */
  error?: ShownFailure | undefined;
  ok: boolean;
  /** The open frame's revision the view loaded. */
  revision: string;
}

/** A canvas's export: the `.excalidraw` file, its outline and its latest picture. */
export interface CanvasExport {
  file: ReturnType<typeof excalidrawFile>;
  outline: string;
  /** Base64 PNG; null until a screen has drawn one. */
  png: string | null;
  /** The hub's preview listener, where the canvas's page stands (`Created.port`). */
  port: number;
}

const routeOf = (id: string) => `/__cawco/artifact/${id}`;

const summaryOf = (row: ArtifactRow): ArtifactSummary => ({
  id: row.id,
  kind: row.kind,
  name: row.name,
  createdAt: row.createdAt.toISOString(),
  updatedAt: row.updatedAt.toISOString(),
  shownAt: row.shownAt?.toISOString() ?? null,
});

/** The doc's `state`, read as entries. */
const stateOf = (doc: Doc): Record<string, ChoiceEntry> =>
  doc.getMap("state").toJSON() as Record<string, ChoiceEntry>;

const metaOf = (doc: Doc) => {
  const meta = doc.getMap("meta");
  return {
    pageHash: (meta.get("pageHash") as string | null | undefined) ?? null,
    sentAt: (meta.get("sentAt") as string | null | undefined) ?? null,
  };
};

/** The page hash the newest entry was made on: a preview's, which the hub never built. */
const newestHash = (state: Record<string, ChoiceEntry>): string | null =>
  Object.values(state).sort((a, b) => b.at.localeCompare(a.at))[0]?.pageHash ??
  null;

/** One line per id (none: it was removed), cut to fit one message. */
const summary = (
  entries: [string, ChoiceEntry | undefined][],
  current: string | null
): string => {
  const lines = entries.map(([id, entry]) => {
    if (!entry) {
      return `- ${id}: cleared`;
    }
    const parts = [
      entry.options.length > 0 ? entry.options.join(", ") : null,
      entry.value === null ? null : `value ${JSON.stringify(entry.value)}`,
      entry.note ? `note: ${JSON.stringify(entry.note)}` : null,
      current && entry.pageHash !== current
        ? "made on an earlier revision"
        : null,
    ].filter(Boolean);
    return `- ${id}: ${parts.length > 0 ? parts.join("; ") : "cleared"}`;
  });
  const kept: string[] = [];
  let length = 0;
  for (const line of lines) {
    if (length + line.length > MESSAGE_MAX) {
      kept.push(
        `- … ${lines.length - kept.length} more; artifact_read has them all.`
      );
      break;
    }
    kept.push(line);
    length += line.length + 1;
  }
  return kept.join("\n");
};

const named = (row: ArtifactRow) => `the ${row.kind} "${row.name}"`;

/** The machine a hostname, its label or its id names. */
const machineNamed = (
  machines: Pick<AgentRow, "machineId" | "hostname">[],
  nameOrId: string
): string | undefined =>
  machines.find(
    (machine) =>
      machine.machineId === nameOrId ||
      machine.hostname === nameOrId ||
      machineLabel(machine.hostname) === nameOrId
  )?.machineId;

/**
 * The entries a patched `state` (`after`) makes of `before`: each changed key
 * whole, the fields the agent left out filled in (no note, no value, the
 * page it was made on), stamped `at`; refused whole at the first one out of
 * the bridge's bounds.
 */
const patchedEntries = (
  before: Record<string, ChoiceEntry>,
  after: Record<string, unknown>,
  hash: string,
  at: string
): Record<string, ChoiceEntry> => {
  const next: Record<string, ChoiceEntry> = {};
  for (const [key, value] of Object.entries(after)) {
    if (JSON.stringify(value) === JSON.stringify(before[key])) {
      continue;
    }
    const given = (value ?? {}) as Partial<ChoiceEntry>;
    const entry: ChoiceEntry = {
      options: given.options ?? [],
      note: given.note ?? null,
      value: given.value ?? null,
      pageHash: given.pageHash ?? before[key]?.pageHash ?? hash,
      at,
    };
    const problem = choiceEntryProblem(key, entry);
    if (problem) {
      throw new ArtifactRefusal(422, `${problem} Nothing was changed.`);
    }
    next[key] = entry;
  }
  return next;
};

/** A name for a preview made before artifacts had names: its port, or its folder's leaf. */
export const legacyName = (place: string): string =>
  place
    .toLowerCase()
    .replaceAll(/[^a-z0-9]+/g, "-")
    .replaceAll(/^-+|-+$/g, "")
    .slice(0, 63) || "preview";

export interface ArtifactServiceDeps {
  db: ArtifactsDb;
  /**
   * Whether `workspaceId` holds a work item of the session's delegates: one it
   * delegated, or one of a project it leads (as `stop_delegate` decides).
   */
  delegatesIn: (instance: InstanceRow, workspaceId: string) => boolean;
  /** Puts the person's message into the session. */
  deliver: (instance: InstanceRow, content: string) => void;
  docs: ArtifactDocs;
  instance: (id: string) => InstanceRow | undefined;
  /** The machines the hub knows. */
  machines: () => Pick<AgentRow, "machineId" | "hostname">[];
  /**
   * Publishes `artifact` to its session's panel at a fresh revision (the open
   * frame every view of the session hears); why not, when its server could
   * not be started. Whether a view put it on screen is that view's word
   * ({@link Artifacts.shown}).
   */
  open: (
    artifact: ArtifactRow
  ) => Promise<{ ok: true; revision: string } | { error: string; ok: false }>;
  /** The workspace a session runs in, by id; undefined outside one. */
  ownWorkspace: (instance: InstanceRow) => string | undefined;
  /**
   * A page's HTML built as the decision-page skill builds one: from inline
   * `html`, from `dir`'s page.html on the session's machine, or (neither) from
   * `decisions/<name>/page.html` in the session's project folder; written to
   * `decisions/<name>/` too when the session is in a project.
   */
  page: (
    instance: InstanceRow,
    name: string,
    from: { html: string } | { dir: string } | { folder: true }
  ) => Promise<
    { html: string } | { refused: string; status: ArtifactRefusal["status"] }
  >;
  /** Where artifacts' files are kept: a page's `<root>/<id>/index.html`, a canvas's `<root>/<id>/picture.png`. */
  root: string;
  /**
   * What a send applies before the session hears it (setup.ts
   * `applySetupPicks`); a refusal throws and nothing is sent.
   */
  sending: (
    instance: InstanceRow,
    artifact: ArtifactRow,
    state: Record<string, ChoiceEntry>
  ) => Promise<void>;
  /** The artifact a session's panel shows now, if any. */
  showing: (instanceId: string) => string | undefined;
  /** Whether the session's turn is running now. */
  turnRunning: (instanceId: string) => boolean;
  /** The workspaces an id or its prefix names, each with the machine it is on. */
  workspaces: (needle: string) => { id: string; machineId: string }[];
}

export const createArtifacts = (deps: ArtifactServiceDeps) => {
  const { db, docs } = deps;
  const timers = new Map<string, ReturnType<typeof setTimeout>>();

  const sessionOf = (id: string): InstanceRow => {
    const row = deps.instance(id);
    if (!row) {
      throw new ArtifactRefusal(404, "Session not found.");
    }
    return row;
  };

  /** The session's artifact `id`; refused when it is another session's or not there. */
  const own = (instance: InstanceRow, id: string): ArtifactRow => {
    const row = db.get(id);
    if (!row || row.instanceId !== instance.id) {
      throw new ArtifactRefusal(404, `This session has no artifact ${id}.`);
    }
    return row;
  };

  const writePage = (id: string, html: string) => {
    const dir = join(deps.root, id);
    mkdirSync(dir, { recursive: true });
    writeFileSync(join(dir, "index.html"), html);
  };

  /** The person's changes the session has not heard, as one message; nothing when none are owed. */
  const deliverOwed = (id: string) => {
    clearTimeout(timers.get(id));
    timers.delete(id);
    const row = db.get(id);
    const instance = row && deps.instance(row.instanceId);
    if (!(row && instance)) {
      return;
    }
    const owed = Object.entries(row.changes)
      .filter(
        ([, change]) => change.by === "person" && change.seq > row.deliveredSeq
      )
      .map(([key]) => key);
    if (owed.length === 0) {
      return;
    }
    const doc = docs.doc(id);
    const state = stateOf(doc);
    const current = metaOf(doc).pageHash ?? newestHash(state);
    const entries = owed.map((key): [string, ChoiceEntry | undefined] => [
      key,
      state[key],
    ]);
    deps.deliver(
      instance,
      `I changed my picks on ${named(row)}:\n\n${summary(entries, current)}\n\nartifact_read returns them in full; with since: ${row.seq} it returns only what changes after this.`
    );
    db.update(id, { deliveredSeq: row.seq });
  };

  /** The person changed the doc's state: at once while the turn runs, else after the quiet. */
  const personChanged = (id: string) => {
    const row = db.get(id);
    if (row && deps.turnRunning(row.instanceId)) {
      deliverOwed(id);
      return;
    }
    clearTimeout(timers.get(id));
    timers.set(
      id,
      setTimeout(() => deliverOwed(id), QUIET_MS)
    );
  };

  /** Writes the doc's meta for the artifact as the hub keeps it. */
  const stampMeta = (row: ArtifactRow, hash: string | null) => {
    docs.transact(row.id, "hub", (doc) => {
      const meta = doc.getMap("meta");
      meta.set("kind", row.kind);
      meta.set("name", row.name);
      meta.set("revision", row.revision);
      if (hash !== null) {
        meta.set("pageHash", hash);
      }
    });
  };

  const read = (row: ArtifactRow, since?: number): ArtifactRead => {
    const doc = docs.doc(row.id);
    const state = stateOf(doc);
    const meta = metaOf(doc);
    const current = meta.pageHash ?? newestHash(state);
    const changed =
      since === undefined
        ? null
        : new Set(
            Object.entries(row.changes)
              .filter(([, change]) => change.seq > since)
              .map(([key]) => key)
          );
    const keys = Object.keys(state).filter(
      (key) => !changed || changed.has(key)
    );
    const removed = changed
      ? [...changed].filter((key) => !(key in state))
      : [];
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      revision: row.revision,
      pageHash: meta.pageHash,
      sentAt: meta.sentAt,
      seq: row.seq,
      state: Object.fromEntries(
        keys.map((key) => [
          key,
          {
            ...state[key],
            ...(current && state[key].pageHash !== current
              ? { earlierRevision: true as const }
              : {}),
          },
        ])
      ),
      ...(removed.length > 0 ? { removed } : {}),
      ...("workspace" in row.source && row.source.workspace
        ? { workspace: row.source.workspace }
        : {}),
    };
  };

  /**
   * The source a preview input names, on the machine that serves it: a
   * workspace's port on the workspace's machine, in its network; a port or a
   * folder on the machine `machine` names, else the session's.
   */
  const previewSource = (
    instance: InstanceRow,
    input: ArtifactInput
  ): { machineId: string; source: PreviewSource } => {
    const problem = previewProblem(input);
    if (problem) {
      throw new ArtifactRefusal(400, problem);
    }
    const at = input.path === undefined ? {} : { path: input.path };
    // A machine named is its host's port; else the port is in the workspace
    // named, or the session's own.
    const workspace =
      input.port === undefined || input.machine !== undefined
        ? undefined
        : workspaceFor(instance, input.workspace);
    if (workspace) {
      return {
        machineId: workspace.machineId,
        source: {
          port: input.port as number,
          ...at,
          workspace: workspace.id,
        },
      };
    }
    const machineId =
      input.machine === undefined
        ? instance.machineId
        : machineNamed(deps.machines(), input.machine);
    if (!machineId) {
      throw new ArtifactRefusal(
        404,
        `No machine named ${input.machine} is known to this hub.`
      );
    }
    return {
      machineId,
      source:
        input.port === undefined
          ? { dir: input.dir as string, ...at }
          : { port: input.port, ...at },
    };
  };

  /**
   * The workspace a port preview's server runs in, with its machine: the one
   * named, which must be the session's own or one of its delegates', else the
   * session's own; none for a session outside a workspace that names none.
   */
  const workspaceFor = (
    instance: InstanceRow,
    needle: string | undefined
  ): { id: string; machineId: string } | undefined => {
    const mine = deps.ownWorkspace(instance);
    const asked = needle ?? mine;
    if (asked === undefined) {
      return;
    }
    const found = deps.workspaces(asked);
    if (found.length !== 1) {
      throw new ArtifactRefusal(
        404,
        found.length === 0
          ? `No workspace ${asked} on this hub.`
          : `${asked} names ${found.length} workspaces; pass the full workspace id.`
      );
    }
    const [workspace] = found;
    if (workspace.id !== mine && !deps.delegatesIn(instance, workspace.id)) {
      throw new ArtifactRefusal(
        403,
        `"${needle}" is not your delegate's workspace — you can only preview your own workspace or your delegates'.`
      );
    }
    return workspace;
  };

  const pageHtml = async (
    instance: InstanceRow,
    input: Pick<ArtifactInput, "name" | "html" | "dir">
  ): Promise<string> => {
    if (input.html !== undefined && input.dir !== undefined) {
      throw new ArtifactRefusal(400, "A page takes html or dir, not both.");
    }
    if (
      input.html === undefined &&
      input.dir === undefined &&
      !instance.projectId
    ) {
      throw new ArtifactRefusal(
        400,
        "A page takes html, or dir with your work folder that holds page.html."
      );
    }
    let from: { html: string } | { dir: string } | { folder: true } = {
      folder: true,
    };
    if (input.html !== undefined) {
      from = { html: input.html };
    } else if (input.dir !== undefined) {
      from = { dir: input.dir };
    }
    const built = await deps.page(instance, input.name, from);
    if ("refused" in built) {
      throw new ArtifactRefusal(built.status, built.refused);
    }
    return built.html;
  };

  /*
   * A view's word that it has an artifact on screen. Each show publishes a
   * fresh revision and waits for a view to say it loaded that revision; a
   * word that came before the wait began (a fast page) is kept here for it.
   */
  const heard = new Map<string, ShownAck>();
  const waiting = new Map<string, (ack: ShownAck) => void>();
  const shownKey = (id: string, revision: string) => `${id}:${revision}`;

  /** The first view's word on `revision` of artifact `id`; null when none came in time. */
  const shownBy = (id: string, revision: string): Promise<ShownAck | null> => {
    const key = shownKey(id, revision);
    const early = heard.get(key);
    if (early) {
      heard.delete(key);
      return Promise.resolve(early);
    }
    return new Promise((done) => {
      const timer = setTimeout(() => {
        waiting.delete(key);
        done(null);
      }, SHOWN_WAIT_MS);
      waiting.set(key, (ack) => {
        clearTimeout(timer);
        waiting.delete(key);
        done(ack);
      });
    });
  };

  /** Why a view could not load the artifact, in WORDS.md's error formula: what failed, and why. */
  const notLoaded = (row: ArtifactRow, failure: ShownFailure): string => {
    const { source } = row;
    const machine = machineOf(row);
    const subject =
      "port" in source
        ? `The server on port ${source.port} ${source.workspace ? `in workspace ${source.workspace.slice(0, 8)}` : `on ${machine}`}`
        : `${named(row)[0]?.toUpperCase()}${named(row).slice(1)}`;
    switch (failure) {
      case "server":
        return `${subject} did not answer: nothing is listening on that port.`;
      case "workspace":
        return `${subject} did not answer: the workspace isn't running.`;
      case "machine":
        return `${subject} did not answer: ${machine} isn't connected to the hub.`;
      default:
        return `${subject} answered, but not with a page the panel can show.`;
    }
  };
  const machineOf = (row: ArtifactRow): string => {
    const machine = deps
      .machines()
      .find((one) => one.machineId === row.machineId);
    return machine ? machineLabel(machine.hostname) : "its machine";
  };

  /**
   * Publishes the artifact to its session's panel and waits for a view to
   * have it on screen; `started` is false when its server could not even be
   * started, and nothing was published.
   */
  const show = async (
    row: ArtifactRow
  ): Promise<
    | { opened: true; started: true }
    | { opened: false; started: boolean; why: string }
  > => {
    const published = await deps.open(row);
    if (!published.ok) {
      return { opened: false, why: published.error, started: false };
    }
    const ack = await shownBy(row.id, published.revision);
    if (!ack) {
      return { opened: false, why: NO_VIEW, started: true };
    }
    if (!ack.ok) {
      return {
        opened: false,
        why: notLoaded(row, ack.error ?? "page"),
        started: true,
      };
    }
    db.update(row.id, { shownAt: new Date() });
    return { opened: true, started: true };
  };
  /** A show's answer, as the tools and the panel's Show give it. */
  const openedOf = (shown: Opened): Opened =>
    shown.opened ? { opened: true } : { opened: false, why: shown.why };

  /*
   * A canvas (Projects spec §5.10, D24–D25). Its `deliveredSeq` is the seq
   * the session last read it at (a canvas delivers no picks): what "changed
   * since your last read" and "changed under you" are measured from.
   */

  /** The canvas's latest picture as base64; null until a screen drew one. */
  const pictureOf = (id: string): string | null => {
    try {
      return readFileSync(picturePath(deps.root, id)).toString("base64");
    } catch {
      return null;
    }
  };

  /** The elements the person changed after `since` that the canvas still holds. */
  const personChangedAfter = (
    row: ArtifactRow,
    since: number,
    present: Set<string>
  ): string[] =>
    Object.entries(row.changes)
      .filter(
        ([id, change]) =>
          change.by === "person" && change.seq > since && present.has(id)
      )
      .map(([id]) => id);

  /** A canvas as the session reads it, which counts as its read. */
  const readCanvas = (
    row: ArtifactRow,
    since?: number,
    png = false
  ): ArtifactRead => {
    const entries = canvasEntries(docs, row.id);
    const present = new Set(entries.map((entry) => entry.el.id));
    const meta = docs.doc(row.id).getMap("meta");
    db.update(row.id, { deliveredSeq: row.seq });
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      revision: row.revision,
      pageHash: null,
      sentAt: null,
      seq: row.seq,
      state: {},
      outline: canvasOutline(entries.map((entry) => entry.el)),
      changed: personChangedAfter(row, since ?? row.deliveredSeq, present),
      pictureAt: (meta.get("pictureAt") as string | null | undefined) ?? null,
      draft: meta.get("draft") === true,
      ...(png ? { png: pictureOf(row.id) } : {}),
    };
  };

  /** What a canvas's create or update draws: skeleton elements or Mermaid, converted on a screen; the ids written. */
  const draw = async (
    row: ArtifactRow,
    change: { elements: SkeletonElement[] } | { mermaid: string }
  ): Promise<string[]> => {
    if ("elements" in change) {
      if (change.elements.length > CANVAS_LIMITS.elementsPerCall) {
        throw new ArtifactRefusal(
          413,
          `One call writes at most ${CANVAS_LIMITS.elementsPerCall} elements; send the rest in another.`
        );
      }
      return await convertOnScreen(docs, row.id, "elements", {
        elements: change.elements,
      });
    }
    if (change.mermaid.length > CANVAS_LIMITS.mermaid) {
      throw new ArtifactRefusal(
        413,
        `Mermaid is at most ${CANVAS_LIMITS.mermaid} characters; split the diagram.`
      );
    }
    return await convertOnScreen(docs, row.id, "mermaid", {
      mermaid: change.mermaid,
    });
  };

  /**
   * The person's own canvas, opened in the composer: always a new artifact,
   * named `name`, or `name-2`, `name-3`… when the session has that one,
   * marked `draft` until its first send, and not shown in the panel.
   */
  const createDraft = (
    instance: InstanceRow,
    input: ArtifactInput
  ): Created => {
    if (input.elements !== undefined || input.mermaid !== undefined) {
      throw new ArtifactRefusal(
        400,
        "A draft canvas starts empty: it takes no elements or mermaid."
      );
    }
    const { name } = input;
    let free = name;
    for (let n = 2; db.byName(instance.id, "canvas", free); n += 1) {
      free = `${name.slice(0, 63 - String(n).length - 1)}-${n}`;
    }
    const now = new Date();
    const row = db.create({
      id: crypto.randomUUID(),
      instanceId: instance.id,
      projectId: instance.projectId ?? null,
      kind: "canvas",
      name: free,
      machineId: null,
      source: { page: free },
      revision: 1,
      seq: 0,
      changes: {},
      deliveredSeq: 0,
      createdAt: now,
      updatedAt: now,
      shownAt: null,
    });
    stampMeta(row, null);
    docs.transact(row.id, "hub", (doc) =>
      doc.getMap("meta").set("draft", true)
    );
    return {
      id: row.id,
      kind: row.kind,
      name: row.name,
      route: routeOf(row.id),
      opened: false,
      why: "It stands in the composer until it is docked.",
      port: PREVIEW_PORT,
    };
  };

  /**
   * Makes a canvas (or opens the one of that name) and shows it; with
   * elements or Mermaid, waits for a screen to join and draws them.
   */
  const createCanvas = async (
    instance: InstanceRow,
    input: ArtifactInput
  ): Promise<Created> => {
    if (input.elements !== undefined && input.mermaid !== undefined) {
      throw new ArtifactRefusal(
        400,
        "A canvas takes elements or mermaid, not both."
      );
    }
    const now = new Date();
    const before = db.byName(instance.id, "canvas", input.name);
    const row =
      (before && db.update(before.id, { updatedAt: now })) ??
      db.create({
        id: crypto.randomUUID(),
        instanceId: instance.id,
        projectId: instance.projectId ?? null,
        kind: "canvas",
        name: input.name,
        machineId: null,
        // The hub serves it, as it serves a page.
        source: { page: input.name },
        revision: 1,
        seq: 0,
        changes: {},
        deliveredSeq: 0,
        createdAt: now,
        updatedAt: now,
        shownAt: null,
      });
    stampMeta(row, null);
    const made = {
      id: row.id,
      kind: row.kind,
      name: row.name,
      route: routeOf(row.id),
      ...openedOf(await show(row)),
    };
    if (input.elements === undefined && input.mermaid === undefined) {
      const { outline } = readCanvas(db.get(row.id) as ArtifactRow);
      return {
        ...made,
        outline,
        ...(outline
          ? {}
          : {
              note: "The canvas is empty. Draw on it with artifact_update (elements or mermaid), or wait for the person to draw.",
            }),
      };
    }
    if (!(await screenJoined(docs, row.id, CANVAS_LIMITS.convertMs))) {
      throw new ArtifactRefusal(
        503,
        `The canvas ${row.name} is made (id ${row.id}) and empty. ${NO_SCREEN}`
      );
    }
    const wrote = await draw(
      row,
      input.elements === undefined
        ? { mermaid: input.mermaid as string }
        : { elements: input.elements }
    );
    return {
      ...made,
      wrote,
      outline: readCanvas(db.get(row.id) as ArtifactRow).outline,
    };
  };

  /** A canvas's change: elements added or replaced by id, ids deleted, or Mermaid appended. */
  const updateCanvas = async (
    row: ArtifactRow,
    change: CanvasChange
  ): Promise<ArtifactRead> => {
    if ("delete" in change) {
      if (change.delete.length > CANVAS_LIMITS.deletePerCall) {
        throw new ArtifactRefusal(
          413,
          `One call deletes at most ${CANVAS_LIMITS.deletePerCall} elements.`
        );
      }
      const { deleted, missing } = deleteElements(docs, row.id, change.delete);
      return {
        ...readCanvas(db.get(row.id) as ArtifactRow),
        deleted,
        ...(missing.length > 0 ? { missing } : {}),
      };
    }
    // Replacing what the person changed since the session last read it.
    const present = new Set(
      canvasEntries(docs, row.id).map((entry) => entry.el.id)
    );
    const underYou =
      "elements" in change
        ? personChangedAfter(row, row.deliveredSeq, present).filter((id) =>
            change.elements.some((element) => element.id === id)
          )
        : [];
    const wrote = await draw(row, change);
    return {
      ...readCanvas(db.get(row.id) as ArtifactRow),
      wrote,
      ...(underYou.length > 0
        ? { changedUnderYou: underYou.map((id) => `${id} changed under you`) }
        : {}),
    };
  };

  return {
    personChanged,

    list: (instanceId: string): ArtifactSummary[] =>
      db.ofInstance(sessionOf(instanceId).id).map(summaryOf),

    /**
     * An artifact by id with the session that made it, and whether that
     * session's panel shows it now: what its own tab opens on.
     */
    find: (
      id: string
    ): ArtifactSummary & { instanceId: string; shown: boolean } => {
      const row = db.get(id);
      if (!row) {
        throw new ArtifactRefusal(404, `No artifact ${id} on this hub.`);
      }
      return {
        ...summaryOf(row),
        instanceId: row.instanceId,
        shown: deps.showing(row.instanceId) === row.id,
      };
    },

    /**
     * Makes an artifact and shows it in the session's panel. A page or preview
     * the session already has under the same kind and name is replaced in
     * place: its doc, and so every pick, stays.
     */
    create: async (
      instanceId: string,
      input: ArtifactInput
    ): Promise<Created> => {
      const instance = sessionOf(instanceId);
      if (!ARTIFACT_NAME.test(input.name)) {
        throw new ArtifactRefusal(
          400,
          "A name is lowercase letters, digits and dashes, like onboarding, at most 63 characters."
        );
      }
      const stray = strayFields(input);
      if (stray) {
        throw new ArtifactRefusal(400, stray);
      }
      if (input.kind === "canvas") {
        return input.draft
          ? createDraft(instance, input)
          : await createCanvas(instance, input);
      }
      let source: PreviewSource = { page: input.name };
      let machineId: string | null = null;
      let html: string | null = null;
      if (input.kind === "page") {
        html = await pageHtml(instance, input);
      } else {
        ({ machineId, source } = previewSource(instance, input));
      }
      const now = new Date();
      const before = db.byName(instance.id, input.kind, input.name);
      const row = before
        ? (db.update(before.id, {
            source,
            machineId,
            revision: before.revision + 1,
            updatedAt: now,
          }) as ArtifactRow)
        : db.create({
            id: crypto.randomUUID(),
            instanceId: instance.id,
            projectId: instance.projectId ?? null,
            kind: input.kind,
            name: input.name,
            machineId,
            source,
            revision: 1,
            seq: 0,
            changes: {},
            deliveredSeq: 0,
            createdAt: now,
            updatedAt: now,
            shownAt: null,
          });
      if (html !== null) {
        writePage(row.id, html);
      }
      stampMeta(row, html === null ? null : pageHash(html));
      const shown = await show(row);
      if (!(shown.started || before) && input.kind === "preview") {
        // A preview nothing could start shows nothing: it is not kept. One
        // whose server did not answer stays in the panel, its failure on it.
        db.remove(row.id);
        throw new ArtifactRefusal(503, shown.why);
      }
      return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        route: routeOf(row.id),
        ...openedOf(shown),
      };
    },

    /**
     * New HTML for a page (its revision moves and every open view morphs to
     * it, its state kept), or a JSON Patch (RFC 6902) over its `state` applied as one
     * transaction; the state after the change. A canvas's elements, deletes
     * or Mermaid; its outline after the change.
     */
    update: async (
      instanceId: string,
      id: string,
      change: PageChange | CanvasChange
    ): Promise<ArtifactRead> => {
      const instance = sessionOf(instanceId);
      let row = own(instance, id);
      const forCanvas = !("html" in change || "patch" in change);
      if (forCanvas !== (row.kind === "canvas")) {
        throw new ArtifactRefusal(
          409,
          row.kind === "canvas"
            ? `${row.name} is a canvas: it takes elements, delete or mermaid.`
            : `${row.name} is a ${row.kind}: elements, delete and mermaid are for a canvas.`
        );
      }
      if (!("html" in change || "patch" in change)) {
        return await updateCanvas(row, change);
      }
      if ("html" in change) {
        if (row.kind !== "page") {
          throw new ArtifactRefusal(
            409,
            `${row.name} is a ${row.kind}: only a page takes new HTML.`
          );
        }
        const html = await pageHtml(instance, {
          name: row.name,
          html: change.html,
        });
        row = db.update(row.id, {
          revision: row.revision + 1,
          updatedAt: new Date(),
        }) as ArtifactRow;
        writePage(row.id, html);
        // Every page open on it hears the new revision in the doc and morphs
        // in place (the overlay); nothing reloads.
        stampMeta(row, pageHash(html));
        return read(row);
      }
      const doc = docs.doc(row.id);
      const before = stateOf(doc);
      const after = structuredClone(before) as Record<string, unknown>;
      const errors = applyPatch(after, change.patch);
      const failed = errors.findIndex((error) => error !== null);
      if (failed !== -1) {
        throw new ArtifactRefusal(
          422,
          `Operation ${failed} of the patch failed: ${errors[failed]?.message ?? "it does not apply"}. Nothing was changed.`
        );
      }
      const next = patchedEntries(
        before,
        after,
        metaOf(doc).pageHash ?? newestHash(before) ?? "0".repeat(64),
        new Date().toISOString()
      );
      const gone = Object.keys(before).filter((key) => !(key in after));
      docs.transact(row.id, "agent", (live) => {
        const state = live.getMap("state");
        for (const [key, entry] of Object.entries(next)) {
          state.set(key, entry);
        }
        for (const key of gone) {
          state.delete(key);
        }
      });
      return read(db.get(row.id) as ArtifactRow);
    },

    /**
     * The state, meta and sentAt; a canvas's outline and what the person
     * changed, with its picture when `png`; with no id, the session's
     * newest artifact.
     */
    read: (
      instanceId: string,
      id?: string,
      since?: number,
      png = false
    ): ArtifactRead => {
      const instance = sessionOf(instanceId);
      const row =
        id === undefined ? db.ofInstance(instance.id)[0] : own(instance, id);
      if (!row) {
        throw new ArtifactRefusal(
          404,
          "This session has made no artifact yet."
        );
      }
      return row.kind === "canvas"
        ? readCanvas(row, since, png)
        : read(row, since);
    },

    /** A canvas's `.excalidraw` file, its outline and its latest picture: what a send carries. */
    export: (id: string): CanvasExport => {
      const row = db.get(id);
      if (!row) {
        throw new ArtifactRefusal(404, `No artifact ${id} on this hub.`);
      }
      if (row.kind !== "canvas") {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a ${row.kind}: only a canvas exports.`
        );
      }
      const elements = canvasEntries(docs, id).map((entry) => entry.el);
      return {
        file: excalidrawFile(
          elements,
          docs.doc(id).getMap("files").toJSON() as Record<string, unknown>
        ),
        outline: canvasOutline(elements),
        png: pictureOf(id),
        port: PREVIEW_PORT,
      };
    },

    /** A draft canvas went out with a send: it is the session's to hold now. */
    sent: (instanceId: string, id: string): { draft: false } => {
      const row = own(sessionOf(instanceId), id);
      if (row.kind !== "canvas") {
        throw new ArtifactRefusal(
          409,
          `${row.name} is a ${row.kind}: only a canvas is sent from the composer.`
        );
      }
      docs.transact(row.id, "hub", (doc) =>
        doc.getMap("meta").set("draft", false)
      );
      return { draft: false };
    },

    /**
     * Brings an artifact to the front of its session's panel and waits for a
     * view to have it on screen ({@link Opened}); a refusal when its server
     * could not be started.
     */
    show: async (instanceId: string, id: string): Promise<Opened> => {
      const shown = await show(own(sessionOf(instanceId), id));
      if (!shown.started) {
        throw new ArtifactRefusal(503, shown.why);
      }
      return openedOf(shown);
    },

    /**
     * A view's word that it has (or could not load) the artifact at the
     * revision it was opened at: the show waiting on that revision answers
     * from it. A word on a revision no show waits for is kept for one that
     * starts waiting (a fast page answers before the publish returns).
     */
    shown: (instanceId: string, id: string, ack: ShownAck): { heard: true } => {
      const row = own(sessionOf(instanceId), id);
      const key = shownKey(row.id, ack.revision);
      const waiter = waiting.get(key);
      if (waiter) {
        waiter(ack);
      } else if (!heard.has(key)) {
        heard.set(key, ack);
        // Kept as long as a show could still come to wait for it.
        setTimeout(() => heard.delete(key), SHOWN_WAIT_MS).unref?.();
      }
      return { heard: true };
    },

    /**
     * The person sends, by any path: what the send applies first (`sending`),
     * then every pick to the session as one message, at once; `sentAt` kept
     * in the doc.
     */
    send: async (
      instanceId: string,
      id: string,
      text?: string
    ): Promise<ArtifactChoices> => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const doc = docs.doc(row.id);
      const state = stateOf(doc);
      if (Object.keys(state).length === 0) {
        throw new ArtifactRefusal(409, "Nothing is picked yet.");
      }
      await deps.sending(instance, row, state);
      clearTimeout(timers.get(id));
      timers.delete(id);
      const current = metaOf(doc).pageHash ?? newestHash(state);
      deps.deliver(
        instance,
        `I sent my picks from ${named(row)}:\n\n${summary(Object.entries(state), current)}${text ? `\n\n${text}` : ""}\n\nartifact_read returns them in full, with the page hash each was made on.`
      );
      docs.transact(row.id, "hub", (live) =>
        live.getMap("meta").set("sentAt", new Date().toISOString())
      );
      db.update(row.id, { deliveredSeq: (db.get(row.id) as ArtifactRow).seq });
      return { choices: state, ...metaOf(doc) };
    },
  };
};

export type Artifacts = ReturnType<typeof createArtifacts>;

/** A legacy canvas's entries as a doc's `state` update, with its meta. */
export const legacyDoc = (
  meta: {
    kind: ArtifactKind;
    name: string;
    pageHash: string | null;
    sentAt: string | null;
  },
  entries: Record<string, ChoiceEntry>
): Uint8Array => {
  const doc = new Doc();
  doc.transact(() => {
    const m = doc.getMap("meta");
    m.set("kind", meta.kind);
    m.set("name", meta.name);
    m.set("revision", 1);
    if (meta.pageHash) {
      m.set("pageHash", meta.pageHash);
    }
    if (meta.sentAt) {
      m.set("sentAt", meta.sentAt);
    }
    const state = doc.getMap("state");
    for (const [key, entry] of Object.entries(entries)) {
      state.set(key, entry);
    }
  });
  const update = encodeStateAsUpdate(doc);
  doc.destroy();
  return update;
};
