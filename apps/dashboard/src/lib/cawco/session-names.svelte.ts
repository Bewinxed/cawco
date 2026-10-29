/**
 * The session a written word names, wherever it lives: a reference's id
 * (`[title](cawco:session/<id>)`, core references.ts) or a mention's handle
 * (`@<title> <dir#id8>`, find/mention.svelte.ts), by its full id, a short id
 * of six or more characters, or its handle (`<dir>#<id8>`, `thread#<id8>`,
 * hub labels.ts `sessionLabel`), as the hub's own resolver takes a target
 * (delegation-actions.ts: the full id, or a short id that names only one).
 *
 * The rows this browser holds answer first: the instance index (sessions,
 * runs and threads moved within a day, hub db `listedAt`) and the ids the
 * hub folded into a continuation. A session the index does not hold (ended
 * days ago, on another machine, in another project) is asked of the hub's
 * names (`GET /api/find`), which hold every session it ever started, and
 * the answer is kept for this tab. Every reader that names or describes a
 * session by its id (a chip, a tab, the bar, a card, a tail, a delegate's
 * row, a hand-off's sender, a run's supervisor) reads it through here, so a
 * session aged off the board is drawn as itself, never as "Fleet", a bare
 * id or a transcript that never loads.
 */
import type { FindConversation, FindThread } from "@cawco/core/find";
import { SvelteMap } from "svelte/reactivity";
import { browser } from "$app/env";
import { cawco } from "./client.svelte";
import { findNames } from "./find/find-client";
import { age, rowOf } from "./find/find-rows";
import { resolveSessionTitle } from "./links";
import { threadTabId } from "./thread-tabs";

/** The shortest id part that names a session (the hub's resolver's own). */
const SHORT_ID = 6;

/** A session as the hub's names answered it. */
export type NamedSession = FindConversation | FindThread;

/** Each session the hub's names answered for, by the id it is drawn under. */
const answered = new SvelteMap<string, NamedSession>();
/** What each written name was answered as: the id it names, or null when the hub names nothing by it. */
const resolved = new SvelteMap<string, string | null>();
/** Names asked of the hub and not answered yet: never asked twice at once. */
const asking = new Set<string>();

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
  const rows = cawco.instanceIndex.byId;
  const former = cawco.formerIds;
  if (rows.has(name)) {
    return name;
  }
  if (rows.has(threadTabId(name))) {
    return threadTabId(name);
  }
  const folded = former[name];
  if (folded && rows.has(folded)) {
    return folded;
  }
  const part = idPartOf(name);
  if (part.length < SHORT_ID) {
    return null;
  }
  const prefixes = [part, threadTabId(part)];
  const row = onlyStarting(rows.keys(), prefixes);
  if (row) {
    return row;
  }
  const formerId = onlyStarting(Object.keys(former), [part]);
  const now = formerId ? former[formerId] : undefined;
  return now && rows.has(now) ? now : null;
}

/** The id a result is drawn under: a session's instance id, a thread's tab. */
const drawnId = (result: NamedSession): string =>
  result.kind === "thread" ? threadTabId(result.id) : result.id;

/** The one result of the hub's answer that `name` names, or undefined. */
function namedBy(
  results: readonly NamedSession[],
  name: string
): NamedSession | undefined {
  const exact = results.find(
    (r) => r.handle === name || r.id === name || drawnId(r) === name
  );
  if (exact) {
    return exact;
  }
  const part = idPartOf(name);
  if (part.length < SHORT_ID) {
    return;
  }
  const short = results.filter((r) => r.id.startsWith(part));
  return short.length === 1 ? short[0] : undefined;
}

/**
 * Asks the hub's names what `name` names, once. An answer is kept, naming
 * a session or nothing; an unreached hub is asked again the next time the
 * name is drawn. The browser asks: its `/api/find` is its own origin's,
 * however the dashboard is served. The server's render holds no fleet and
 * no origin to ask from, and these answers are this tab's, never shared
 * across requests; it draws the words, and hydration asks.
 */
function ask(name: string): void {
  if (!browser || asking.has(name)) {
    return;
  }
  asking.add(name);
  findNames(name, { limit: 12, kinds: ["conversation", "thread"] })
    .then((answer) => {
      const read = answer.kind === "answered" ? answer.read : null;
      if (!read || (!read.ok && read.unreached)) {
        return;
      }
      const results = read.ok
        ? read.value.results.filter(
            (r): r is NamedSession =>
              (r.kind === "conversation" && r.instanceId !== null) ||
              r.kind === "thread"
          )
        : [];
      const hit = namedBy(results, name);
      if (hit) {
        answered.set(drawnId(hit), hit);
      }
      resolved.set(name, hit ? drawnId(hit) : null);
    })
    .catch((error: unknown) => {
      const why = error instanceof Error ? error.message : String(error);
      console.error(`[cawco] naming ${name} failed: ${why}`);
    })
    .finally(() => {
      asking.delete(name);
    });
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
 * What a session is called, read from its id the one way: a thread's
 * title, a row's (core's order: its title, else its folder), else the hub's
 * answer. Null while the hub is asked and when nothing names it.
 */
export function sessionTitle(name: string): string | null {
  const id = sessionNamed(name) ?? name;
  const thread = cawco.threadOf(id);
  if (thread) {
    return thread.title;
  }
  const row = cawco.instanceIndex.byId.get(id);
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
  const row = cawco.instanceIndex.byId.get(id);
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
