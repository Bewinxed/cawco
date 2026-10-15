/**
 * Artifacts (Projects spec §5.10): what the five tools and the panel do to
 * them. A session makes an artifact with `artifact_create`, changes it with
 * `artifact_update`, reads it with `artifact_read`, brings it to the front
 * of its panel with `artifact_show` and, in a project, keeps it in the
 * project's folder with `artifact_promote`; the person's picks, notes and values
 * live in the artifact's doc (docs.ts). They are never the person's words in
 * the session: when the person sends, the session hears that the artifact
 * has new responses ({@link ArtifactServiceDeps.signal}) and reads them
 * itself with `artifact_read` and `comment_read`.
 */
import { readFileSync } from "node:fs";
import { join } from "node:path";
import {
  type AgentRow,
  ARTIFACT_NAME,
  type ArtifactChoices,
  type ArtifactKind,
  type ArtifactPromotion,
  type ArtifactSummary,
  type ChoiceEntry,
  choiceEntryProblem,
  type InstanceRow,
  machineLabel,
  noteText,
  type PreviewAddress,
  type PreviewSource,
  type ShownFailure,
} from "@cawco/core";
import {
  CANVAS_LIMITS,
  canvasOutline,
  excalidrawFile,
  NO_SCREEN,
} from "@cawco/core/canvas";
import {
  COMMENT_LIMITS,
  type Pin,
  pinUnsent,
  type SendBody,
  type ThreadEntry,
} from "@cawco/core/comments";
import type { InkGroup } from "@cawco/core/ink";
import { pageHash } from "@cawco/core/preview-proxy";
import { writeStateFileSync } from "@cawco/core/state-file";
import { applyPatch, type Operation } from "rfc6902";
import { Doc, encodeStateAsUpdate } from "yjs";
import type { ArtifactRow, ArtifactsDb } from "../db/artifacts";
import { sessionLabel } from "../labels";
import {
  changeFolderFiles,
  FolderRefusal,
  folderFileNames,
  folderPath,
} from "../project-folder";
import {
  canvasEntries,
  convertOnScreen,
  deleteElements,
  screenJoined,
} from "./canvas";
import type { ArtifactDocs } from "./docs";
import { picturePath } from "./sync";

export class ArtifactRefusal extends Error {
  readonly status: 400 | 403 | 404 | 409 | 413 | 422 | 503 | 504;
  constructor(
    status: 400 | 403 | 404 | 409 | 413 | 422 | 503 | 504,
    message: string,
    options?: ErrorOptions
  ) {
    super(message, options);
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
  /** What the page's `cawco.send(text)` sent with the person's last send. */
  sentText?: string;
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
  /**
   * A draft canvas's: its session's preview origin (core `PreviewAddress`),
   * where a client loads the canvas at `/__cawco/canvas/<id>/`: a port on
   * the hub's host, or (host mode) a whole origin of its own.
   */
  origin?: string;
  /** A canvas's outline once drawn (core `canvasOutline`). */
  outline?: string;
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

/**
 * What `comment_read` answers: each of the session's artifacts with pins
 * that match, the page's address the person last sent from, and the time to
 * pass as the next `since`. A pin on ink carries the ink's box in the page.
 */
export interface CommentRead {
  artifacts: {
    /** The page's address the person last sent from; its own route before any send. */
    address: string;
    id: string;
    kind: ArtifactKind;
    name: string;
    pins: (Pin & { inkBox?: InkGroup["page"] })[];
  }[];
  at: string;
}

/** A canvas's export: the `.excalidraw` file, its outline and its latest picture. */
export interface CanvasExport {
  file: ReturnType<typeof excalidrawFile>;
  /** Its session's preview origin, where the canvas's page stands (`Created.port` / `origin`). */
  origin?: string;
  outline: string;
  /** Base64 PNG; null until a screen has drawn one. */
  png: string | null;
  port?: number;
}

/** What `artifact_promote` answers: the project folder's commit, and the folder it wrote. */
export interface Promoted {
  commit: string;
  /** `artifacts/<name>/`, from the project folder's root. */
  path: string;
}

/** A promote from a session outside a project. WORDS.md's error formula. */
export const NO_PROJECT =
  "This session belongs to no project, so there is nowhere to promote to.";

/**
 * Every file a promote may write into `artifacts/<name>/`: one of these an
 * earlier promote wrote and this one does not (a picture since cleared) is
 * taken out in the same commit.
 */
const PROMOTED_FILES = [
  "artifact.json",
  "index.html",
  "state.json",
  "canvas.excalidraw",
  "outline.md",
  "preview.json",
  "pins.json",
  "ink.json",
  "picture.png",
] as const;
type PromotedFile = (typeof PROMOTED_FILES)[number];

/** `artifacts/<name>`, inside the project folder; refused for a name that would leave it. */
const promotedFolder = (name: string): string => {
  const folder = `artifacts/${name}`;
  if (!ARTIFACT_NAME.test(name) || folderPath(folder) !== folder) {
    throw new ArtifactRefusal(
      400,
      `${JSON.stringify(name)} would not stay inside artifacts/: a name is lowercase letters, digits and dashes.`
    );
  }
  return folder;
};

const TRAILING_DOT = /\.$/;

/** A promote git refused, in WORDS.md's error formula: what failed, and git's reason. */
const notCommitted = (name: string, error: FolderRefusal): ArtifactRefusal =>
  new ArtifactRefusal(
    error.status === 413 || error.status === 409 ? error.status : 503,
    `${name} could not be committed: ${error.message.replace(TRAILING_DOT, "")}.`,
    { cause: error }
  );

/** A promoted file's text: JSON, two-space indented, ending on a newline, as a repository keeps it. */
const promotedJson = (value: unknown): string =>
  `${JSON.stringify(value, null, 2)}\n`;

const routeOf = (id: string) => `/__cawco/artifact/${id}`;

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

/** The words a page's `cawco.send(text)` sent with the person's last send; none when it sent none. */
const sentTextOf = (doc: Doc): string | null =>
  (doc.getMap("meta").get("sentText") as string | null | undefined) ?? null;

/** The page hash the newest entry was made on: a preview's, which the hub never built. */
const newestHash = (state: Record<string, ChoiceEntry>): string | null =>
  Object.values(state).sort((a, b) => b.at.localeCompare(a.at))[0]?.pageHash ??
  null;

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
      note: noteText(given.note),
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
  /**
   * Session `instanceId`'s preview origin (preview.ts), its listener started
   * when it has none; throws a refusal when every port is taken.
   */
  previewAddress: (instanceId: string) => PreviewAddress;
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
  /**
   * Tells the session the person sent responses on `artifact`, which it reads
   * from `since` with its tools, `pins` with `comment_read`, the send's
   * pictures with it (core `artifactResponsesNotice`). One the session has
   * not read yet for the same artifact is superseded, not added to: the
   * session hears once, from the earliest `since` it was not told of.
   */
  signal: (
    instance: InstanceRow,
    artifact: ArtifactRow,
    responses: {
      images: { data: string; mediaType: string }[];
      pins: boolean;
      since: number;
    }
  ) => Promise<void>;
  /** The workspaces an id or its prefix names, each with the machine it is on. */
  workspaces: (needle: string) => { id: string; machineId: string }[];
}

export const createArtifacts = (deps: ArtifactServiceDeps) => {
  const { db, docs } = deps;

  const summaryOf = (row: ArtifactRow): ArtifactSummary => ({
    id: row.id,
    kind: row.kind,
    name: row.name,
    createdAt: row.createdAt.toISOString(),
    updatedAt: row.updatedAt.toISOString(),
    shownAt: row.shownAt?.toISOString() ?? null,
    promoted:
      (docs.doc(row.id).getMap("meta").get("promoted") as
        | ArtifactPromotion
        | undefined) ?? null,
  });

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

  /** Pin `pinId` on one of the session's artifacts, and that artifact; refused when no artifact of the session holds it. */
  const pinOf = (
    instance: InstanceRow,
    pinId: string
  ): { pin: Pin; row: ArtifactRow } => {
    for (const row of db.ofInstance(instance.id)) {
      const pin = docs.doc(row.id).getMap("pins").get(pinId) as Pin | undefined;
      if (pin) {
        return { pin, row };
      }
    }
    throw new ArtifactRefusal(
      404,
      `No artifact of this session holds pin ${pinId}. comment_read lists its pins with their ids.`
    );
  };

  const writePage = (id: string, html: string) => {
    writeStateFileSync(join(deps.root, id, "index.html"), html);
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
    const sentText = sentTextOf(doc);
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
            // Kept before notes were trimmed where they are written.
            note: noteText(state[key].note),
            ...(current && state[key].pageHash !== current
              ? { earlierRevision: true as const }
              : {}),
          },
        ])
      ),
      ...(removed.length > 0 ? { removed } : {}),
      ...(sentText ? { sentText } : {}),
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
      case "reach":
        return `${subject} did not answer: ${machine} couldn't open the way to it.`;
      case "closed":
        return `${subject} did not show: the panel was closed or showed something else first.`;
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
  const pictureOf = (id: string): string | null =>
    pictureBytes(id)?.toString("base64") ?? null;

  /** The artifact's latest picture's bytes: a canvas's, or a page's from its last send; null when it has none. */
  const pictureBytes = (id: string): Buffer | null => {
    try {
      return readFileSync(picturePath(deps.root, id));
    } catch {
      return null;
    }
  };

  /**
   * A send's page with the person's ink on it (its picture with no pin)
   * becomes a page's or preview's picture, as a canvas keeps its own;
   * `artifact_promote` writes it.
   */
  const keepComposited = (row: ArtifactRow, body: SendBody) => {
    const composited = body.pictures?.findLast((one) => one.pin === null);
    if (!composited || row.kind === "canvas") {
      return;
    }
    writeStateFileSync(
      picturePath(deps.root, row.id),
      Buffer.from(composited.png, "base64")
    );
  };

  /** A canvas's `.excalidraw` file and its outline, as the doc holds them now. */
  const canvasFile = (id: string) => {
    const elements = canvasEntries(docs, id).map((entry) => entry.el);
    return {
      file: excalidrawFile(
        elements,
        docs.doc(id).getMap("files").toJSON() as Record<string, unknown>
      ),
      outline: canvasOutline(elements),
    };
  };

  /** What `artifacts/<name>/` holds for the artifact now, by file name. */
  const promotedFiles = (
    instance: InstanceRow,
    row: ArtifactRow,
    at: string
  ): Partial<Record<PromotedFile, string | Uint8Array>> => {
    const doc = docs.doc(row.id);
    const files: Partial<Record<PromotedFile, string | Uint8Array>> = {
      "artifact.json": promotedJson({
        kind: row.kind,
        name: row.name,
        id: row.id,
        promotedAt: at,
        session: instance.id,
      }),
      "pins.json": promotedJson(doc.getMap("pins").toJSON()),
      "ink.json": promotedJson(doc.getMap("ink").toJSON()),
    };
    if (row.kind === "page") {
      files["index.html"] = readFileSync(join(deps.root, row.id, "index.html"));
      files["state.json"] = promotedJson(stateOf(doc));
    } else if (row.kind === "canvas") {
      const { file, outline } = canvasFile(row.id);
      files["canvas.excalidraw"] = promotedJson(file);
      files["outline.md"] = outline ? `${outline}\n` : "";
    } else {
      files["preview.json"] = promotedJson({
        ...row.source,
        machine: machineOf(row),
      });
    }
    const picture = pictureBytes(row.id);
    if (picture) {
      files["picture.png"] = picture;
    }
    return files;
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
      ...deps.previewAddress(instance.id),
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
      return {
        ...canvasFile(id),
        png: pictureOf(id),
        ...deps.previewAddress(row.instanceId),
      };
    },

    /**
     * Writes the artifact into its session's project folder at
     * `artifacts/<name>/` as one commit by the session, so it outlives the
     * session and reaches every checkout of the project; a promote again
     * commits it as it stands then over the same folder. Stamps the doc's
     * `meta.promoted`. Refused outside a project, and when git refuses.
     */
    promote: async (instanceId: string, id: string): Promise<Promoted> => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const { projectId } = instance;
      if (!projectId) {
        throw new ArtifactRefusal(409, NO_PROJECT);
      }
      const folder = promotedFolder(row.name);
      const at = new Date().toISOString();
      const files = promotedFiles(instance, row, at);
      let commit: string;
      try {
        const there = new Set(await folderFileNames(projectId, folder));
        ({ sha: commit } = await changeFolderFiles(
          projectId,
          {
            writes: Object.entries(files).map(([name, content]) => ({
              path: `${folder}/${name}`,
              content,
            })),
            deletes: PROMOTED_FILES.filter(
              (name) => !(name in files) && there.has(name)
            ).map((name) => `${folder}/${name}`),
          },
          {
            author: { name: sessionLabel(instance).name },
            message: `Promote ${row.kind} ${row.name} from session ${instance.id.slice(0, 8)}`,
          }
        ));
      } catch (error) {
        if (!(error instanceof FolderRefusal)) {
          throw error;
        }
        throw notCommitted(row.name, error);
      }
      const promoted: ArtifactPromotion = { commit, at };
      docs.transact(row.id, "hub", (doc) =>
        doc.getMap("meta").set("promoted", promoted)
      );
      return { commit, path: `${folder}/` };
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
     * The pins on the session's artifacts (one, or all of them), with their
     * threads and anchors: `open` (unresolved), `resolved`, or `all`; with
     * `since`, only pins with something newer than it.
     */
    commentRead: (
      instanceId: string,
      query: {
        artifact?: string | undefined;
        filter: "open" | "resolved" | "all";
        since?: string | undefined;
      }
    ): CommentRead => {
      const instance = sessionOf(instanceId);
      const rows =
        query.artifact === undefined
          ? db.ofInstance(instance.id)
          : [own(instance, query.artifact)];
      const newest = (pin: Pin) =>
        [pin.resolvedAt, pin.movedAt, ...pin.thread.map((entry) => entry.at)]
          .filter((at): at is string => !!at)
          .reduce((a, b) => (b > a ? b : a), pin.at);
      const artifacts = rows.flatMap((row) => {
        const doc = docs.doc(row.id);
        const groups = {
          ...(doc.getMap("moved").toJSON() as Record<string, InkGroup>),
          ...(doc.getMap("ink").toJSON() as Record<string, InkGroup>),
        };
        const pins = Object.values(
          doc.getMap("pins").toJSON() as Record<string, Pin>
        )
          .filter((pin) =>
            query.filter === "all"
              ? true
              : (query.filter === "resolved") === !!pin.resolvedAt
          )
          .filter((pin) => !query.since || newest(pin) > query.since)
          .sort((a, b) => a.number - b.number)
          .map((pin) => {
            const inkBox = pin.ink ? groups[pin.ink]?.page : undefined;
            return inkBox ? { ...pin, inkBox } : pin;
          });
        const address =
          (doc.getMap("meta").get("sentUrl") as string | null | undefined) ??
          routeOf(row.id);
        return pins.length > 0
          ? [{ id: row.id, kind: row.kind, name: row.name, address, pins }]
          : [];
      });
      return { artifacts, at: new Date().toISOString() };
    },

    /** The agent answers a pin: an entry in its thread, by the agent, shown at once wherever the artifact is open. */
    commentReply: (
      instanceId: string,
      pinId: string,
      text: string,
      files?: string[]
    ): { entry: ThreadEntry; number: number; pin: string } => {
      const { row, pin } = pinOf(sessionOf(instanceId), pinId);
      if (pin.thread.length >= COMMENT_LIMITS.entries) {
        throw new ArtifactRefusal(
          409,
          `Pin ${pin.number}'s thread holds ${COMMENT_LIMITS.entries} entries, so this reply wasn't kept. Resolve the pin, or answer in the conversation.`
        );
      }
      const entry: ThreadEntry = {
        id: crypto.randomUUID(),
        by: "agent",
        text,
        at: new Date().toISOString(),
        ...(files && files.length > 0 ? { files } : {}),
      };
      docs.transact(row.id, "hub", (doc) =>
        doc
          .getMap("pins")
          .set(pin.id, { ...pin, thread: [...pin.thread, entry] })
      );
      return { pin: pin.id, number: pin.number, entry };
    },

    /** The agent resolves a pin, with a last reply when given; the person can reopen it. */
    commentResolve: (
      instanceId: string,
      pinId: string,
      text?: string
    ): { number: number; pin: string; resolvedAt: string } => {
      const { row, pin } = pinOf(sessionOf(instanceId), pinId);
      const at = new Date().toISOString();
      const thread = text
        ? [
            ...pin.thread,
            {
              id: crypto.randomUUID(),
              by: "agent" as const,
              text,
              at,
            },
          ].slice(-COMMENT_LIMITS.entries)
        : pin.thread;
      docs.transact(row.id, "hub", (doc) =>
        doc.getMap("pins").set(pin.id, { ...pin, thread, resolvedAt: at })
      );
      return { pin: pin.id, number: pin.number, resolvedAt: at };
    },

    /**
     * The person sends, by any path (the panel's Send N, a page's
     * `cawco.send`): what the send applies first (`sending`), then the
     * session hears that the artifact has new responses since the last it
     * was told of ({@link ArtifactServiceDeps.signal}), with the send's
     * pictures. Every unsent pin and thread entry is stamped `sentAt`, and a
     * page's words are kept as `sentText` for `artifact_read`.
     */
    send: async (
      instanceId: string,
      id: string,
      body: SendBody
    ): Promise<ArtifactChoices> => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const doc = docs.doc(row.id);
      const state = stateOf(doc);
      const { sentAt } = metaOf(doc);
      const picked = Object.values(state).some(
        (entry) => !sentAt || entry.at > sentAt
      );
      const pins = doc.getMap("pins").toJSON() as Record<string, Pin>;
      const owed = Object.values(pins)
        .filter(pinUnsent)
        .sort((a, b) => a.number - b.number);
      if (!(picked || owed.length > 0 || body.text)) {
        throw new ArtifactRefusal(
          409,
          "Nothing new to send: every pick and pin here has gone to the session."
        );
      }
      if (picked) {
        await deps.sending(instance, row, state);
      }
      await deps.signal(instance, row, {
        since: row.deliveredSeq,
        pins: owed.length > 0,
        images: (body.pictures ?? []).map(({ png }) => ({
          mediaType: "image/png",
          data: png,
        })),
      });
      keepComposited(row, body);
      const groups = doc.getMap("ink").toJSON() as Record<string, InkGroup>;
      const at = new Date().toISOString();
      docs.transact(row.id, "hub", (live) => {
        const meta = live.getMap("meta");
        meta.set("sentAt", at);
        meta.set("sentText", body.text || null);
        meta.set("sentUrl", body.url ?? null);
        const livePins = live.getMap("pins");
        for (const pin of owed) {
          livePins.set(pin.id, {
            ...pin,
            sentAt: pin.sentAt ?? at,
            thread: pin.thread.map((entry) =>
              entry.by === "person" && !entry.sentAt
                ? { ...entry, sentAt: at }
                : entry
            ),
          });
        }
        const ink = live.getMap("ink");
        for (const group of Object.values(groups)) {
          if (!group.sentAt) {
            ink.set(group.id, { ...group, sentAt: at });
          }
        }
      });
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
