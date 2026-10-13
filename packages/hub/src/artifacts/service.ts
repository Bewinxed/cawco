/**
 * Artifacts (Projects spec §5.10): what the four tools and the panel do to
 * them. A session makes an artifact with `artifact_create`, changes it with
 * `artifact_update`, reads it with `artifact_read` and brings it to the front
 * of its panel with `artifact_show`; the person's picks, notes and values
 * live in the artifact's doc (docs.ts) and reach the session as one message
 * after {@link QUIET_MS} of quiet, at once while its turn runs, and at once
 * when the person sends.
 */
import { mkdirSync, writeFileSync } from "node:fs";
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
} from "@cawco/core";
import { pageHash } from "@cawco/core/preview-proxy";
import { applyPatch, type Operation } from "rfc6902";
import { Doc, encodeStateAsUpdate } from "yjs";
import type { ArtifactRow, ArtifactsDb } from "../db/artifacts";
import type { ArtifactDocs } from "./docs";

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
 * What a create or a re-create names: a page from `html` or `dir`, or a
 * preview of `port` or `dir` on `machine`, opened at `path`; each kind's
 * fields only.
 */
export interface ArtifactInput {
  dir?: string | undefined;
  html?: string | undefined;
  kind: "page" | "preview";
  machine?: string | undefined;
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

/** The fields only the other kind takes, named in its refusal. */
const OTHER_KIND = {
  page: ["port", "path", "machine", "workspace"],
  preview: ["html"],
} as const;

const strayFields = (input: ArtifactInput): string | null => {
  const stray = OTHER_KIND[input.kind].filter(
    (key) => input[key] !== undefined
  );
  if (stray.length === 0) {
    return null;
  }
  const other = input.kind === "page" ? "a preview" : "a page";
  return `A ${input.kind} takes ${input.kind === "page" ? "html or dir" : "port or dir"}; ${stray.join(", ")} ${stray.length === 1 ? "is" : "are"} for ${other}.`;
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
  id: string;
  kind: ArtifactKind;
  name: string;
  pageHash: string | null;
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
}

export interface Created {
  id: string;
  kind: ArtifactKind;
  name: string;
  /** Whether the session's panel shows it now, or why not. */
  opened: true | string;
  /** Its live document on the hub's preview listener. */
  route: string;
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
  /** Shows `artifact` in its session's panel, at a fresh revision; why not, when it cannot. */
  open: (
    artifact: ArtifactRow
  ) => Promise<{ ok: true } | { error: string; ok: false }>;
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
  /** Where page artifacts' files are kept: `<root>/<id>/index.html`. */
  root: string;
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

  const show = async (row: ArtifactRow): Promise<true | string> => {
    const opened = await deps.open(row);
    if (!opened.ok) {
      return opened.error;
    }
    db.update(row.id, { shownAt: new Date() });
    return true;
  };

  return {
    personChanged,

    list: (instanceId: string): ArtifactSummary[] =>
      db.ofInstance(sessionOf(instanceId).id).map(summaryOf),

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
      const opened = await show(row);
      if (opened !== true && !before && input.kind === "preview") {
        // A preview nothing could start shows nothing: it is not kept.
        db.remove(row.id);
        throw new ArtifactRefusal(503, opened);
      }
      return {
        id: row.id,
        kind: row.kind,
        name: row.name,
        route: routeOf(row.id),
        opened,
      };
    },

    /**
     * New HTML for a page (its revision moves and the panel reloads it, its
     * state kept), or a JSON Patch (RFC 6902) over its `state` applied as one
     * transaction; the state after the change.
     */
    update: async (
      instanceId: string,
      id: string,
      change: { html: string } | { patch: Operation[] }
    ): Promise<ArtifactRead> => {
      const instance = sessionOf(instanceId);
      let row = own(instance, id);
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
        stampMeta(row, pageHash(html));
        // The panel showing it reloads onto the new HTML; its state stays in the doc.
        if (deps.showing(instance.id) === row.id) {
          await deps.open(row);
        }
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

    /** The state, meta and sentAt; with no id, the session's newest artifact. */
    read: (instanceId: string, id?: string, since?: number): ArtifactRead => {
      const instance = sessionOf(instanceId);
      const row =
        id === undefined ? db.ofInstance(instance.id)[0] : own(instance, id);
      if (!row) {
        throw new ArtifactRefusal(
          404,
          "This session has made no artifact yet."
        );
      }
      return read(row, since);
    },

    /** Brings an artifact to the front of its session's panel: true, or why not. */
    show: async (instanceId: string, id: string): Promise<true | string> =>
      await show(own(sessionOf(instanceId), id)),

    /** The person sends: every pick to the session as one message, at once; `sentAt` kept in the doc. */
    send: (instanceId: string, id: string, text?: string): ArtifactChoices => {
      const instance = sessionOf(instanceId);
      const row = own(instance, id);
      const doc = docs.doc(row.id);
      const state = stateOf(doc);
      if (Object.keys(state).length === 0) {
        throw new ArtifactRefusal(409, "Nothing is picked yet.");
      }
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
