/**
 * OPENING A CONVERSATION AT ONE OF ITS RECORDS.
 *
 * `?at=<docId>` on a conversation's address (`/session/<id>?at=…`, a thread's
 * `/session/thread:<id>?at=…`) asks for that conversation scrolled to the
 * record, centred and highlighted, however far back in its history it is: a
 * Claude transcript record's uuid, an OpenCode message id, a pi entry id, a
 * thread message's id. The finder's "Where it was said" rows link there.
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
    case "run":
      return [row.message];
    case "tools":
      return row.messages;
    case "subagent":
      return [row.spawn, ...row.branch.messages];
    case "account":
    case "compaction":
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
