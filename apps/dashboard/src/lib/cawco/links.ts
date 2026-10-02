import {
  deriveTitleFromFirstMessage,
  type InstanceRow,
  type NeutralSessionInfo,
} from "@cawco/core";

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
  location?: SessionLocation,
  requireLocation = false,
  accept: (row: T) => boolean = () => true
): T | undefined {
  const candidates = (index.bySession.get(sessionId) ?? []).filter(accept);
  const narrowed = location
    ? candidates.filter(
        (row) =>
          row.machineId === location.machineId && row.cwd === location.cwd
      )
    : [];
  // Resume must not adopt an ambiguous session from another machine or checkout.
  const ambiguous = requireLocation && candidates.length > 1;
  const eligible = ambiguous || narrowed.length > 0 ? narrowed : candidates;
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
  index: InstanceIndex<InstanceRow>,
  machineId: string
): string {
  return sessionTitle(
    info,
    instanceForSession(index, info.sessionId, { machineId, cwd: info.cwd })
  );
}

/**
 * The fleet-wide handle for a delegate: repo leaf plus the first eight of its
 * instance id — the same name its reports carry ("Report from delegate
 * cawco#3c872de1"), so the rail and the transcript agree on what to call it.
 */
export function delegateHandle(row: { id: string; cwd: string }): string {
  const leaf = row.cwd.split("/").filter(Boolean).pop() ?? "session";
  return `${leaf}#${row.id.slice(0, 8)}`;
}

/**
 * The full instance id behind a full or short (8-char prefix) id, if it names
 * exactly one row. A stored transcript keeps only the short id (NEW.md:
 * `matchesSession` prefix-matches), so a session reference in a report header
 * or a hand-off receipt resolves here against the fleet's live rows.
 */
export function resolveInstanceId(
  id: string | null | undefined,
  index: InstanceIndex
): string | undefined {
  if (!id) {
    return undefined;
  }
  if (index.byId.has(id)) {
    return id;
  }
  if (id.length >= 8) {
    const matches = [...index.byId.keys()].filter((key) => key.startsWith(id));
    return matches.length === 1 ? matches[0] : undefined;
  }
  return undefined;
}
