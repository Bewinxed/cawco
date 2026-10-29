import type { HarnessKind, NeutralSessionInfo } from "@cawco/core/harness";
import type { InstanceRow } from "@cawco/core/protocol";
import { deriveTitleFromFirstMessage } from "@cawco/core/title";

/**
 * A row the lists draw: a session's, or a Caw thread's drawn as one
 * (thread-tabs.ts), which runs on no harness of its own and says so with a
 * null `harness`.
 */
export type BoardRow = Omit<InstanceRow, "harness"> & {
  harness: HarnessKind | null;
};

/** Whether a drawn row is a session's: one a harness runs. */
export const isSessionRow = (row: BoardRow): row is InstanceRow =>
  row.harness !== null;

interface SessionInstance {
  cwd?: string;
  id: string;
  machineId?: string;
  sessionId?: string | null;
  updatedAt?: InstanceRow["updatedAt"];
}

interface SessionLocation {
  cwd?: string;
  machineId?: string | null;
}

/**
 * Where a session's transcript is read from: the view's id alone, the newest
 * page unless `cursor` names where an older one ends, of the hub's own size
 * unless `limit` names one. The hub maps a live instance to its key and
 * locates any other, so the same address works before this browser knows
 * anything about the conversation.
 */
export const transcriptUrl = (
  viewId: string,
  page: { cursor?: string; limit?: number } = {}
): string => {
  const query = new URLSearchParams({
    ...(page.cursor ? { before: page.cursor } : {}),
    ...(page.limit ? { limit: String(page.limit) } : {}),
  }).toString();
  return `/api/instances/${encodeURIComponent(viewId)}/transcript${query ? `?${query}` : ""}`;
};

/**
 * Every instance row, looked up by id and by session. Built once per change to
 * the instance list, so resolving a conversation's address is two map reads —
 * the rail and the board resolve one per row, and a scan per row made that
 * quadratic in the fleet.
 */
export interface InstanceIndex<T extends SessionInstance = SessionInstance> {
  byId: ReadonlyMap<string, T>;
  bySession: ReadonlyMap<string, readonly T[]>;
}

export function indexInstances<T extends SessionInstance>(
  instances: readonly T[]
): InstanceIndex<T> {
  const byId = new Map<string, T>();
  const bySession = new Map<string, T[]>();
  for (const row of instances) {
    byId.set(row.id, row);
    if (row.sessionId) {
      const held = bySession.get(row.sessionId);
      if (held) {
        held.push(row);
      } else {
        bySession.set(row.sessionId, [row]);
      }
    }
  }
  return { byId, bySession };
}

/** Location settles shared session keys; the newest row settles true duplicates. */
export function instanceForSession<T extends SessionInstance>(
  index: InstanceIndex<T>,
  sessionId: string,
  location?: SessionLocation
): T | undefined {
  const candidates = index.bySession.get(sessionId) ?? [];
  const narrowed = location
    ? candidates.filter(
        (row) =>
          row.machineId === location.machineId && row.cwd === location.cwd
      )
    : [];
  // Sorted as a copy: `candidates` is the index's own list.
  const eligible = narrowed.length > 0 ? narrowed : [...candidates];
  return eligible.sort(
    (a, b) =>
      new Date(b.updatedAt ?? 0).getTime() -
        new Date(a.updatedAt ?? 0).getTime() || a.id.localeCompare(b.id)
  )[0];
}

/** Instance-backed conversations have one address, including sleeping instances. */
export function conversationHref(
  id: string | null,
  index: InstanceIndex,
  location?: SessionLocation
): string {
  if (!id) {
    return "/session";
  }
  const instance =
    index.byId.get(id) ?? instanceForSession(index, id, location);
  return `/session/${instance?.id ?? id}`;
}

/**
 * {@link conversationHref} for a row the instance index holds, by its id: a
 * hub row, or a thread's under its `thread:` id, is found in the index
 * under that id, so its address is always that id. It reads nothing:
 * a link drawn from it changes only when the row does, where one drawn
 * through the index was worked out again for every row on every
 * `instances` frame.
 */
export const rowHref = (id: string): string => `/session/${id}`;

/**
 * A session's first message as a title — the shared cleaning, so the name the
 * hub already derived for the row and the one the loaded transcript derives are
 * the same string and the label never changes under the reader.
 */
const fromFirstMessage = deriveTitleFromFirstMessage;

/**
 * What a session is called, wherever it is named — the tab strip, the session
 * header, the rail, the palette. One function so the tab and the header can
 * never disagree about which conversation the reader clicked.
 *
 * In order: a real title somebody or the harness gave it, then what it was
 * first asked to do, then the folder it works in. A session that has said
 * anything at all is never "untitled".
 */
export function resolveSessionTitle(input: {
  /** A named title: a custom one, or the harness's own summary. */
  title?: string | null;
  /** The first thing the session was asked, raw and still wrapped in markup. */
  firstMessage?: string | null;
  /** Where it works; its leaf names the session when nothing else can. */
  cwd?: string | null;
  /** The last resort, shortened — better than a word that says nothing. */
  id?: string | null;
}): string {
  const named = input.title?.trim();
  if (named) {
    return named;
  }

  const first = input.firstMessage?.trim();
  if (first) {
    const derived = fromFirstMessage(first);
    if (derived) {
      return derived;
    }
  }

  const leaf = (input.cwd ?? "").split("/").filter(Boolean).pop();
  if (leaf) {
    return leaf;
  }

  return input.id ? input.id.slice(0, 8) : "session";
}

/**
 * The same title, for a stored session the machine's catalog described. The
 * hub row behind it, when there is one, names it first if it has been given a
 * name: the owner's rename, else the session's own `set_title`. Then the
 * harness's custom title or summary, then the first prompt.
 */
export function sessionTitle(
  info: NeutralSessionInfo,
  row?: Pick<InstanceRow, "title" | "titleSource"> | null
): string {
  return resolveSessionTitle({
    title:
      (row?.titleSource ? row.title : undefined) ||
      info.customTitle ||
      info.summary,
    firstMessage: info.firstPrompt,
    cwd: info.cwd,
    id: info.sessionId,
  });
}

/** {@link sessionTitle}, with the hub row looked up from the fleet's index. */
export function catalogTitle(
  info: NeutralSessionInfo,
  index: InstanceIndex<BoardRow>,
  machineId: string
): string {
  return sessionTitle(
    info,
    instanceForSession(index, info.sessionId, { machineId, cwd: info.cwd })
  );
}
