/**
 * The session a written word names, wherever it lives: a reference's id
 * (`[title](cawco:session/<id>)`, core references.ts) or a mention's handle
 * (`@<title> <dir#id8>`, find/mention.svelte.ts), by its full id, a short id
 * of six or more characters, or its handle (`<dir>#<id8>`, hub labels.ts `sessionLabel`), as the hub's own resolver takes a target
 * (delegation-actions.ts: the full id, or a short id that names only one).
 *
 * The rows this browser holds answer first: the instance index (sessions,
 * and runs moved within a day, hub db `listedAt`) and the ids the
 * hub folded into a continuation. A session the index does not hold (ended
 * days ago, on another machine, in another project) is asked of the hub's
 * names, which hold every session it ever started: every name a redraw
 * found missing is asked in one request (`POST /api/find/sessions`), read
 * by key, and the answer is kept for this tab. A request the hub did not
 * answer is asked again on a capped backoff, never on a redraw. Every reader that names or describes a
 * session by its id (a chip, a tab, the bar, a card, a tail, a delegate's
 * row, a hand-off's sender, a run's supervisor) reads it through here, so a
 * session aged off the board is drawn as itself, never as "Fleet", a bare
 * id or a transcript that never loads.
 */
import { backoffWait } from "@cawco/core/backoff";
import type { FindConversation } from "@cawco/core/find";
import { SvelteMap } from "svelte/reactivity";
import { browser } from "$app/env";
import { findSessions } from "./find/find-client";
import { age, rowOf } from "./find/find-rows";
import { resolveSessionTitle } from "./links";
import { boardStore } from "./stores/board.svelte";
import { continuationsStore } from "./stores/continuations.svelte";

/** The shortest id part that names a session (the hub's resolver's own). */
const SHORT_ID = 6;

/** A session as the hub's names answered it. */
export type NamedSession = FindConversation;

/** Each session the hub's names answered for, by the id it is drawn under. */
const answered = new SvelteMap<string, NamedSession>();
/** What each written name was answered as: the id it names, or null when the hub names nothing by it. */
const resolved = new SvelteMap<string, string | null>();
/** Names asked of the hub and not answered yet, or waiting to be: never asked twice at once, nor on a redraw. */
const asking = new Set<string>();
/** Names owed asking in the next request. */
const owed = new Set<string>();
/** The next request's timer: the names owed are asked together once it fires. */
let askTimer: ReturnType<typeof setTimeout> | undefined;
/** Requests in a row the hub did not answer: how long the next one waits ({@link againAfter}). */
let failures = 0;

/**
 * The wait after requests the hub did not answer: from 1 s, doubling to a
 * minute (core backoff.ts, its jitter keeping tabs that lost the hub
 * together from asking again together). Its end is the names' answer: one
 * request a minute at most, never on a redraw. Our call.
 */
const ASKS_AGAIN = { firstMs: 1000, mostMs: 60_000 };

/** The id part of a name: what follows a handle's `#`, else the name. */
const idPartOf = (name: string): string => {
  const hash = name.lastIndexOf("#");
  return hash >= 0 ? name.slice(hash + 1) : name;
};

/** The one id of `ids` that starts with one of `prefixes`, or null when none or several do. */
function onlyStarting(
  ids: Iterable<string>,
  prefixes: string[]
): string | null {
  let found: string | null = null;
  for (const id of ids) {
    if (prefixes.some((prefix) => id.startsWith(prefix))) {
      if (found !== null) {
        return null;
      }
      found = id;
    }
  }
  return found;
}

/** The id a name has among the rows this browser holds, or null. */
function heldId(name: string): string | null {
  const rows = boardStore.instanceIndex.byId;
  const former = continuationsStore.formerIds;
  if (rows.has(name)) {
    return name;
  }
  const folded = former[name];
  if (folded && rows.has(folded)) {
    return folded;
  }
  const part = idPartOf(name);
  if (part.length < SHORT_ID) {
    return null;
  }
  const row = onlyStarting(rows.keys(), [part]);
  if (row) {
    return row;
  }
  const formerId = onlyStarting(Object.keys(former), [part]);
  const now = formerId ? former[formerId] : undefined;
  return now && rows.has(now) ? now : null;
}

/** How long the request after `failed` unanswered ones in a row waits ({@link ASKS_AGAIN}). */
const againAfter = (failed: number): number => backoffWait(ASKS_AGAIN, failed);

/** The names owed asked in one request now, and what it answered kept. */
function askOwed(): void {
  askTimer = undefined;
  const names = [...owed];
  owed.clear();
  if (names.length === 0) {
    return;
  }
  findSessions(names)
    .then((answer) => {
      const read = answer.kind === "answered" ? answer.read : null;
      if (!read || (!read.ok && read.unreached)) {
        unanswered(names);
        return;
      }
      failures = 0;
      for (const name of names) {
        asking.delete(name);
        const hit = read.ok ? read.value[name] : null;
        if (hit) {
          answered.set(hit.id, hit);
        }
        resolved.set(name, hit ? hit.id : null);
      }
    })
    .catch((error: unknown) => {
      const why = error instanceof Error ? error.message : String(error);
      console.error(`[cawco] naming ${names.join(", ")} failed: ${why}`);
      unanswered(names);
    })
    .finally(() => {
      if (owed.size > 0) {
        schedule(0);
      }
    });
}

/** The hub did not answer: these names are asked again after the backoff's wait. */
function unanswered(names: string[]): void {
  failures += 1;
  for (const name of names) {
    owed.add(name);
  }
  schedule(againAfter(failures));
}

/** The next request armed `wait` from now, unless one is armed already. */
function schedule(wait: number): void {
  if (askTimer === undefined) {
    askTimer = setTimeout(askOwed, wait);
  }
}

/**
 * Asks the hub's names what `name` names, once: owed into the next request,
 * which carries every name owed. An answer is kept, naming a session or
 * nothing. The browser asks: its `/api/find/sessions` is its own origin's,
 * however the dashboard is served. The server's render holds no fleet and
 * no origin to ask from, and these answers are this tab's, never shared
 * across requests; it draws the words, and hydration asks.
 */
function ask(name: string): void {
  if (!browser || asking.has(name)) {
    return;
  }
  asking.add(name);
  owed.add(name);
  schedule(failures > 0 ? againAfter(failures) : 0);
}

/**
 * The id of the session `name` names, as the chip is drawn under it: the
 * row this browser holds, else the hub's answer. Null while the hub is
 * asked, and when it names nothing by it: the words read as their label.
 */
export function sessionNamed(name: string): string | null {
  const held = heldId(name);
  if (held) {
    return held;
  }
  if (resolved.has(name)) {
    return resolved.get(name) ?? null;
  }
  ask(name);
  return null;
}

/**
 * The session `name` names as the hub's names answered it, when this
 * browser holds no row of it: what a reader that names or describes a
 * session draws it from in place of the row (its title, harness, state,
 * parent, machine). Undefined for a session the index holds (read the row),
 * while the hub is asked, and when it names nothing by it.
 */
export function sessionAnswer(name: string): NamedSession | undefined {
  const at = sessionNamed(name);
  return at ? answered.get(at) : undefined;
}

/**
 * What a session is called, read from its id the one way: a row's (core's order: its title, else its folder), else the hub's
 * answer. Null while the hub is asked and when nothing names it.
 */
export function sessionTitle(name: string): string | null {
  const id = sessionNamed(name) ?? name;
  const row = boardStore.instanceIndex.byId.get(id);
  if (row) {
    return resolveSessionTitle({ title: row.title, cwd: row.cwd, id: row.id });
  }
  return answered.get(id)?.title ?? null;
}

/**
 * Where a session works, as its mark's hue is seeded (`markHue`): its board
 * row's folder, else its machine (SessionRow's own rule), and the same
 * from the hub's answer for one the board does not hold, so a session wears
 * one colour on the board, in a chip, a card, a task's attempt or a
 * decision's tile, before and after it ages off the board. Its name alone
 * only while the hub is asked, or when nothing knows it.
 */
export function sessionPlace(name: string): string {
  const id = sessionNamed(name) ?? name;
  const row = boardStore.instanceIndex.byId.get(id);
  if (row) {
    return row.cwd || row.machineId;
  }
  const answer = answered.get(id);
  if (answer) {
    return answer.kind === "conversation"
      ? answer.cwd || answer.machine.id
      : answer.cwd;
  }
  return id;
}

/**
 * What the hub's names say of a session this browser holds no row of, as
 * a card or a tail says it in place of its live transcript: its state, its
 * row's facts (project, role, machine) and its age, the finder's words.
 */
export function sessionFacts(answer: NamedSession, now = Date.now()): string {
  const shown = rowOf(answer, now);
  return [shown.state.word, ...shown.meta, age(answer.lastActivity, now)]
    .filter(Boolean)
    .join(" · ");
}
