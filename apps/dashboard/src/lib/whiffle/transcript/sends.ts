/**
 * Where every send stands in a transcript, and what its row says — one
 * derive, fed by the live stream and by a history read alike.
 *
 * The hub keeps one record per send (`SendRecord`, @whiffle/core) and is its
 * only writer. A transcript is the harness's own rows with a placeholder
 * (`send.ref`) wherever a send was read (live: at the record frame that said
 * so) or stored (history: the entry the hub linked). {@link placeSends} puts
 * each send's row in: at its placeholder once it is read or failed there;
 * right after its anchor when it failed without being stored — or, with no
 * anchor, after the last row dated before it was accepted; at the end,
 * waiting, while it is pending. So a reload draws what the live stream drew:
 * the same ids, in the same order, with the same words and the same clock.
 */
import type { SendRecord } from "@whiffle/core";
import { sentRow, transcriptUserText } from "../frames";
import type { Message } from "../types";

/** The place a send was read or stored at, among the harness's rows. */
export const sendRef = (
  instanceId: string,
  uuid: string,
  sdkUuid?: string
): Message => ({
  type: "send.ref",
  id: uuid,
  instanceId,
  content: "",
  ...(sdkUuid ? { sdkUuid } : {}),
});

export const isSendRef = (message: Message): boolean =>
  message.type === "send.ref";

/**
 * The order a record's states come in: the hub only ever moves a record
 * forward along it. A frame held behind a history read can be older than the
 * record the read carried, and is then the older word.
 */
const STATE_ORDER: Record<SendRecord["state"], number> = {
  pending: 0,
  read: 1,
  failed: 2,
  replaced: 3,
};

/** Whether `record` says something `held` has not heard yet. */
export const newer = (
  held: SendRecord | undefined,
  record: SendRecord
): boolean =>
  held === undefined || STATE_ORDER[record.state] >= STATE_ORDER[held.state];

/**
 * A send's row, from its record alone: the words the sender submitted, the
 * hub's clock, the record's state. `sdkUuid` is the stored entry's own id,
 * when it has one — the handle a rewind goes by.
 */
export function sendRow(record: SendRecord, sdkUuid?: string): Message {
  const { message } = record.body;
  const row = sentRow(transcriptUserText(message) ?? "", message, {
    id: record.uuid,
    instanceId: record.instanceId,
    timestamp: new Date(record.acceptedAt),
    ...(sdkUuid ? { sdkUuid } : {}),
  });
  const metadata = {
    ...row.metadata,
    ...(record.reason ? { sendFailed: record.reason } : {}),
    ...(record.mode === "urgent" ? { urgent: true as const } : {}),
  };
  return {
    ...row,
    // A replaced record is never drawn (see `placeSends`).
    state: record.state as Exclude<SendRecord["state"], "replaced">,
    queued: record.state === "pending",
    ...(Object.keys(metadata).length > 0 ? { metadata } : {}),
  };
}

const byAcceptance = (a: SendRecord, b: SendRecord): number =>
  a.acceptedAt.localeCompare(b.acceptedAt);

/**
 * A row's clock, as its row shows it: a placeholder by the record it draws
 * there (`acceptedAt`), anything else by when the harness stored it. None for
 * a placeholder that draws nothing here, or a row the harness gave no time.
 */
const clockOf = (
  row: Message,
  records: Record<string, SendRecord>
): number | undefined => {
  if (!isSendRef(row)) {
    return row.timestamp?.getTime();
  }
  const record = row.id ? records[row.id] : undefined;
  return record?.state === "read" || record?.state === "failed"
    ? Date.parse(record.acceptedAt)
    : undefined;
};

/**
 * Where each anchored failure stands: after the last row its anchor names,
 * by id or by the frame the row came from (one assistant frame is several
 * rows). One whose anchor is not among `rows` is put nowhere.
 */
function placeAnchored(
  rows: Message[],
  anchored: Map<string, SendRecord[]>,
  put: (at: number, failed: SendRecord[]) => void
): void {
  const lastAt = new Map<string, number>();
  rows.forEach((row, index) => {
    for (const key of [row.id, row.sdkUuid]) {
      if (key && anchored.has(key)) {
        lastAt.set(key, index);
      }
    }
  });
  for (const [anchor, failed] of anchored) {
    const at = lastAt.get(anchor);
    if (at !== undefined) {
      put(at, failed);
    }
  }
}

/**
 * Where each unanchored failure stands: after the last row dated before it
 * was accepted ({@link clockOf}). Returns the ones no row is dated before.
 */
function placeDated(
  rows: Message[],
  records: Record<string, SendRecord>,
  dated: SendRecord[],
  put: (at: number, failed: SendRecord[]) => void
): SendRecord[] {
  const clocks = rows.map((row) => clockOf(row, records));
  return dated.filter((record) => {
    const accepted = Date.parse(record.acceptedAt);
    const at = clocks.findLastIndex(
      (clock) => clock !== undefined && clock < accepted
    );
    if (at >= 0) {
      put(at, [record]);
    }
    return at < 0;
  });
}

/**
 * THE ONE DERIVE: the harness's rows with every send drawn in its place.
 *
 * - A placeholder draws its send's row when the record is read or failed; a
 *   pending one waits at the end instead, and a replaced one draws nothing.
 * - A failed send that was never stored goes right after its anchor — the
 *   last row the anchor names. One whose anchor is not among these rows (an
 *   older page not read yet) is not drawn until it is.
 * - One with no anchor (the hub knew of nothing the session had said when it
 *   failed) goes after the last row dated before it was accepted, or first of
 *   all when none is. The hub serves such a record only with a page that
 *   reaches the conversation's start, so every row it could follow is here.
 * - Pending sends wait at the end, oldest accepted first, and after them this
 *   tab's own sends the hub has not taken (`local`: sending, or unreached).
 *
 * Read and failed sends with no placeholder and no place of their own are
 * not drawn: their stored entries are on a page this view has not read.
 */
export function placeSends(
  rows: Message[],
  records: Record<string, SendRecord>,
  local: Message[]
): Message[] {
  const referenced = new Set(
    rows.flatMap((row) => (isSendRef(row) && row.id ? [row.id] : []))
  );
  const first: SendRecord[] = [];
  const waiting: SendRecord[] = [];
  const anchored = new Map<string, SendRecord[]>();
  const dated: SendRecord[] = [];
  for (const record of Object.values(records)) {
    if (record.state === "pending") {
      waiting.push(record);
    } else if (record.state === "failed" && !referenced.has(record.uuid)) {
      if (record.anchor) {
        anchored.set(record.anchor, [
          ...(anchored.get(record.anchor) ?? []),
          record,
        ]);
      } else {
        dated.push(record);
      }
    }
  }

  const after = new Map<number, SendRecord[]>();
  const put = (at: number, failed: SendRecord[]): void => {
    after.set(at, [...(after.get(at) ?? []), ...failed]);
  };
  placeAnchored(rows, anchored, put);
  first.push(...placeDated(rows, records, dated, put));

  const placed: Message[] = first.sort(byAcceptance).map((r) => sendRow(r));
  rows.forEach((row, index) => {
    if (isSendRef(row)) {
      const record = row.id ? records[row.id] : undefined;
      if (record?.state === "read" || record?.state === "failed") {
        placed.push(sendRow(record, row.sdkUuid));
      }
    } else {
      placed.push(row);
    }
    const failed = after.get(index);
    if (failed) {
      placed.push(...failed.sort(byAcceptance).map((r) => sendRow(r)));
    }
  });
  placed.push(...waiting.sort(byAcceptance).map((r) => sendRow(r)), ...local);
  return placed;
}
