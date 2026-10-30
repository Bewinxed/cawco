/**
 * OPENING A CONVERSATION AT ONE OF ITS RECORDS.
 *
 * `?at=<docId>` on a conversation's address (`/session/<id>?at=…`) asks for
 * that conversation scrolled to the record, centred and highlighted, however
 * far back in its history it is: a Claude transcript record's uuid, an
 * OpenCode message id, a pi entry id. The finder's "Where it was said" rows link there.
 * Or a time (an ISO-8601 date and time, {@link isMoment}): the first record
 * stored at or after it. A landed commit's `Agent-Logs-Url` trailer names
 * its author date so (hub landing.ts `stampCommand`), which opens the
 * session at the turn that made the commit.
 *
 * The address is read where every address is (`workspace.followUrl`), and
 * the ask is held here, by the view it is for, until that view's transcript
 * takes it (`Transcript`): one that has not landed yet reads back to it as
 * it would to a kept place, one already drawn seeks to it in place.
 */
import { SvelteMap } from "svelte/reactivity";
import { browser } from "$app/env";
import type { Message } from "../types";
import type { Row } from "./rows";

/** The record each view was asked to open at, until its transcript takes it. */
export const openAt = new SvelteMap<string, string>();

/** Ask `viewId` to open at `docId`. Browser only: the server holds no asks. */
export function askOpenAt(viewId: string, docId: string): void {
  if (browser) {
    openAt.set(viewId, docId);
  }
}

/** A view re-addressed (`workspace.retarget`) keeps the ask made of it. */
export function carryOpenAt(from: string, to: string): void {
  const docId = openAt.get(from);
  if (docId !== undefined) {
    openAt.delete(from);
    openAt.set(to, docId);
  }
}

/** Whether `message` is the record `docId`: its id, or the stored entry's (a send's row carries the hub's id). */
const isRecord = (message: Message, docId: string): boolean =>
  message.id === docId || message.sdkUuid === docId;

/** The messages a row draws, the records it is the place of. */
function recordsOf(row: Row): Message[] {
  switch (row.kind) {
    case "single":
    case "queued":
    case "question":
    case "delegate":
      return [row.message];
    case "connect":
      return row.message ? [row.message] : [];
    case "tools":
    case "notices":
    case "account":
      return row.messages;
    case "subagent":
      return [row.spawn, ...row.branch.messages];
    case "compaction":
      return row.records ?? [];
    case "harness":
    case "live":
    case "livetool":
    case "stream":
    case "thinking":
      return [];
  }
}

/** Where among `rows` the record `docId` is drawn, or -1. */
export const rowHolding = (rows: readonly Row[], docId: string): number =>
  rows.findIndex((row) =>
    recordsOf(row).some((message) => isRecord(message, docId))
  );

/** A date and time by its shape, as no record id is. */
const MOMENT = /^\d{4}-\d{2}-\d{2}T/u;

/** Whether `at` asks for a time rather than a record. */
const isMoment = (at: string): boolean => MOMENT.test(at);

/** When `row` was stored: its first record's `timestamp`, in ms, or none. */
function storedAt(row: Row): number | undefined {
  const timestamp = recordsOf(row)[0]?.timestamp;
  const ms = timestamp === undefined ? Number.NaN : Date.parse(timestamp);
  return Number.isNaN(ms) ? undefined : ms;
}

/**
 * Where among `rows` the ask `at` is drawn, or -1 while more history is
 * needed to say. A record id: the row holding it ({@link rowHolding}). A
 * time: the first row whose first record was stored at or after it, once
 * the rows bracket it (a row stored before it is loaded, or the
 * conversation's start is in hand, `startInHand`); when every row is stored
 * before it, the last row that is.
 */
export function rowAt(
  rows: readonly Row[],
  at: string,
  startInHand: boolean
): number {
  if (!isMoment(at)) {
    return rowHolding(rows, at);
  }
  const moment = Date.parse(at);
  let before = -1;
  for (const [index, row] of rows.entries()) {
    const stored = storedAt(row);
    if (stored === undefined) {
      continue;
    }
    if (stored >= moment) {
      return before >= 0 || startInHand ? index : -1;
    }
    before = index;
  }
  return before;
}

/**
 * The block a row is the place of, by its first record's id: what a kept
 * place names it by (`Transcript`), found again by {@link rowHolding} however
 * the rows around it were folded since. None for a row of the live tail.
 */
export const blockOf = (row: Row): string | undefined => recordsOf(row)[0]?.id;
