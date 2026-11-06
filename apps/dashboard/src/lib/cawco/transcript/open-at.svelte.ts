/**
 * OPENING A CONVERSATION AT ONE OF ITS RECORDS.
 *
 * `?at=<docId>` on a conversation's address (`/session/<id>?at=…`) asks for
 * that conversation scrolled to the record and highlighted, however far
 * back in its history it is: a Claude transcript record's uuid, an
 * OpenCode message id, a pi entry id. The finder's "Where it was said" rows link there,
 * naming the words that matched (`&match=<term>`, once each, {@link MATCH}):
 * the first of them in the record is brought into the room the reader sees
 * (Transcript `seekInto`), where a record with none named is.
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

/** The address's parameter naming a word the record matched on, once per word. */
export const MATCH = "match";

/** A record to open at, and the words to bring into view in it: none, its place alone. */
export interface OpenAsk {
  at: string;
  terms: readonly string[];
}

/** The record each view was asked to open at, until its transcript takes it. */
export const openAt = new SvelteMap<string, OpenAsk>();

/** Ask `viewId` to open at `at`, its `terms` in view. Browser only: the server holds no asks. */
export function askOpenAt(
  viewId: string,
  at: string,
  terms: readonly string[] = []
): void {
  if (browser) {
    openAt.set(viewId, { at, terms });
  }
}

/** A view re-addressed (`workspace.retarget`) keeps the ask made of it. */
export function carryOpenAt(from: string, to: string): void {
  const ask = openAt.get(from);
  if (ask !== undefined) {
    openAt.delete(from);
    openAt.set(to, ask);
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

/**
 * The record `at` names among those `row` draws: what a seek finds its drawn
 * part by (its `data-message`, the record's own id, whichever id `at` is)
 * and opens the fold of. None for a time, or a row that does not hold it.
 */
export const recordIn = (row: Row, at: string): Message | undefined =>
  recordsOf(row).find((message) => isRecord(message, at));

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

/** `text` matched literally in a pattern. */
const literal = (text: string): string =>
  text.replace(/[.*+?^${}()|[\]\\]/gu, "\\$&");

/**
 * Where the first of `terms` is drawn in `root`, in the order its words are
 * read, case aside: its words' box on the page, any box between it and
 * `root` that scrolls on its own (a tool's capped output) scrolled to it
 * first. Null when none of them is drawn there: a record folded shut, or
 * words the transcript draws otherwise than they were stored.
 */
export function matchBox(
  root: Element,
  terms: readonly string[]
): DOMRect | null {
  const words = terms.filter((term) => term.trim().length > 0);
  if (words.length === 0) {
    return null;
  }
  const pattern = new RegExp(words.map(literal).join("|"), "iu");
  const walker = document.createTreeWalker(root, NodeFilter.SHOW_TEXT);
  for (let node = walker.nextNode(); node; node = walker.nextNode()) {
    const found = pattern.exec(node.nodeValue ?? "");
    if (!found) {
      continue;
    }
    const range = document.createRange();
    range.setStart(node, found.index);
    range.setEnd(node, found.index + found[0].length);
    if (range.getClientRects().length === 0) {
      // Not drawn (a hidden copy, a closed fold's): the next one may be.
      continue;
    }
    for (
      let box = node.parentElement;
      box && box !== root && root.contains(box);
      box = box.parentElement
    ) {
      if (box.scrollHeight > box.clientHeight + 1 && scrolls(box)) {
        const drawn = range.getBoundingClientRect();
        const room = box.getBoundingClientRect();
        box.scrollTop +=
          drawn.top + drawn.height / 2 - (room.top + room.height / 2);
      }
    }
    return range.getBoundingClientRect();
  }
  return null;
}

/** Whether `box` scrolls its own content up and down. */
const scrolls = (box: Element): boolean => {
  const { overflowY } = getComputedStyle(box);
  return overflowY === "auto" || overflowY === "scroll";
};
