/**
 * The workspace: what is on screen, as state rather than as a URL.
 *
 * This is the inversion the whole pane system rests on. Before it, the active
 * conversation was `page.params.id` — which meant changing conversations was a
 * `goto()`, which ran a server load, which landed *after* whatever animation
 * had already finished, and reshuffled the transcript underneath it. A gesture
 * needs an answer in the same frame the finger moves; a router cannot give one.
 *
 * So the tree below is the truth, and the URL is a projection of it written
 * with `pushState` — shallow, no load, no `page.data` change. Nothing on the
 * render path reads the URL back. A deep link still works, because the URL is
 * read exactly once per real navigation to seed this store, and never again.
 *
 * The tabs in its leaves are also what is live: the dashboard subscribes to
 * frames for every id `openIds` names, so a tab is streaming exactly when it
 * is open. `workingSet` only remembers what a conversation is called and
 * where a stored one lives.
 */
import type { TabNamed } from "@cawco/core";
import { artifactStopOf } from "@cawco/core/artifact-needs";
import { type HarnessKind, harnessNamed } from "@cawco/core/harness";
import { SvelteSet } from "svelte/reactivity";
import { browser } from "$app/env";
import { goto } from "$app/navigation";
import { cawco } from "../client.svelte";
import { conversationHref, isSessionRow } from "../links";
import { asPref, keepPrefs } from "../prefs";
import { openArtifactIn } from "../reference-open.svelte";
import { store, stored as storedIn } from "../storage";
import { isThreadTab, threadIdOf } from "../thread-tabs";
import { askOpenAt, carryOpenAt } from "../transcript/open-at.svelte";
import { workingSet } from "../working-set.svelte";
import { layoutPolicy } from "./layout-policy.svelte";

/** A split: two or more children laid out along one axis. */
export interface BranchNode {
  dir: "h" | "v";
  id: string;
  kids: PaneNode[];
  /** Percentages, one per child, summing to 100. Written by paneforge. */
  sizes: number[];
  t: "b";
}

/** A group of tabs with one showing — VS Code's editor group. */
export interface LeafNode {
  /** `null` is the fleet board: a leaf holding nothing is where you start. */
  active: string | null;
  id: string;
  /**
   * The tab in front and the tab it was opened from, while that holds: kept
   * from the open until another tab is shown, so closing it goes back to
   * where it came from (a browser's opener). Absent once forgotten.
   */
  opened?: { from: string; id: string } | null;
  t: "l";
  tabs: string[];
}

export type PaneNode = BranchNode | LeafNode;

/** How a stored conversation is addressed: which machine, which folder, which harness. */
export interface SessionContext {
  cwd: string;
  harness: HarnessKind;
  machine: string;
}

/** A tab's address as it is handed over: machine and harness both named, or it is no address. */
export interface AskedContext {
  cwd?: string;
  harness?: HarnessKind;
  machine?: string | null;
}

export interface WorkspaceV1 {
  /**
   * The address of every conversation the tree holds.
   *
   * This lives HERE, beside the ids that need it, rather than being looked
   * up in the working set — which is a most-recently-used record with a cap
   * on it, and evicts. The tree can hold more tabs than that cap remembers,
   * so an evicted conversation came back addressed by id alone, resolved to
   * a different session that happened to share it, and rendered as
   * unreachable. Two records of one fact, one of them allowed to forget.
   */
  ctx?: Record<string, SessionContext>;
  focusedLeaf: string;
  root: PaneNode;
  v: 1;
}

const KEY = "cawco-workspace";
/** The pref the addresses (`ctx`) ride in, apart from the tree. */
const CTX_KEY = "cawco-workspace-ctx";

/**
 * The group the last split made. Not state and never stored: the grid reads
 * it once, as the new group first renders, to grow it in from the edge it
 * was dropped on.
 */
let fresh: string | null = null;

let seq = 0;
const nodeId = (): string => {
  const id = `p${Date.now().toString(36)}${seq.toString(36)}`;
  seq += 1;
  return id;
};

const emptyLeaf = (): LeafNode => ({
  t: "l",
  id: nodeId(),
  tabs: [],
  active: null,
});

/**
 * The tree the server draws when it was given none: the layout's own
 * (`(app)/+layout.server.ts` `blank`), under the same group id, so a page
 * drawn from it hydrates as the same group.
 */
const unserved = (): WorkspaceV1 => ({
  v: 1,
  root: { t: "l", id: "p0", tabs: [], active: null },
  focusedLeaf: "p0",
  ctx: {},
});
/* ── Persistence ──────────────────────────────────────────────────────
   localStorage is the source, written on every mutation; the cookies are
   the copy the SERVER renders from, which only the server writes and reads
   (prefs.ts, HttpOnly), sent once the layout holds still.

   The first client render draws the tree the server drew (`serve`, from the
   layout's data), never localStorage: hydration keeps every tab the server
   drew, as it drew it. Once that has been painted, `restore` puts the tree
   localStorage keeps in front and sends its copy, and the strip moves to it
   as it moves for any change (PaneTabs: tabs open, close and slide). A copy
   behind localStorage (another window's write, one sent too late, a
   dashboard on another port of this host) is drawn first and corrected
   then, and the copy sent with it makes the next load agree. Nothing is
   written before the restore, so nothing drawn from the server's tree
   overwrites the tree localStorage keeps; a change asked for before it
   (a tap held through hydration) restores first.

   The tree and the addresses are two cookies. A browser refuses a cookie
   over 4KB outright and keeps the one it had, and an address runs to a
   hundred bytes and more: in one cookie, a strip with a couple of dozen
   stored conversations open stopped being saved for the server, which
   then drew every reload in an older order and the client reshuffled it
   on hydration. The tree alone is ~45 bytes a tab. */

/** Whether a parsed value is actually a tree, and not merely JSON. */
function validate(node: unknown): node is PaneNode {
  if (!node || typeof node !== "object") {
    return false;
  }
  const n = node as Partial<BranchNode> & Partial<LeafNode>;
  if (n.t === "l") {
    return typeof n.id === "string" && Array.isArray(n.tabs);
  }
  if (n.t === "b") {
    return (
      typeof n.id === "string" &&
      (n.dir === "h" || n.dir === "v") &&
      Array.isArray(n.kids) &&
      n.kids.length > 0 &&
      n.kids.every(validate)
    );
  }
  return false;
}

function parse(raw: string | null | undefined): WorkspaceV1 | null {
  if (!raw) {
    return null;
  }
  try {
    const held = JSON.parse(raw) as WorkspaceV1;
    // biome-ignore lint/suspicious/noUnnecessaryConditions: JSON.parse can return null at runtime (e.g. stored literal "null") despite the WorkspaceV1 cast
    if (held?.v !== 1 || !validate(held.root)) {
      return null;
    }
    if (typeof held.focusedLeaf !== "string") {
      return null;
    }
    return held;
  } catch {
    return null;
  }
}

const held = $state<WorkspaceV1>(unserved());

/* ── Naming the tabs ──────────────────────────────────────────────────
   A tab kept from an earlier visit (the tree localStorage and the cookie
   keep), or given by an address, may name a session the hub no longer
   holds, a session by its short id, or something that is no session at all
   (a kind of tab CawCo no longer has). Each is asked of the hub before
   anything reads it (`POST /api/instances/named`, core `TabNamed`): a tab
   that names a session under another id takes that id (`retarget`), one
   that names nothing is dropped and the tree saved without it, so it never
   reaches the cookie again. Until the hub answers, nothing is read or
   followed for it: a read of an id that names nothing is a 404. A tab the
   server drew this page with whose id the hub lists as a session (`serve`,
   the layout's `resolved`) is named already and asked nothing: asked, the
   pane reading it would be unwatched while the ask is out. */

/** Tab ids asked of the hub and not answered yet: nothing reads them. */
const unnamed = new SvelteSet<string>();
/** Tab ids the server found the hub listing as sessions under that id: named already, until `restore` has asked the rest. */
const resolved = new Set<string>();
/** Tab ids waiting for the next ask, sent together. */
const toName = new Set<string>();

/** Asks the hub what tab `id` names, beside every other tab asked in this task. */
function askName(id: string): void {
  if (!browser || isThreadTab(id) || unnamed.has(id) || resolved.has(id)) {
    return;
  }
  unnamed.add(id);
  toName.add(id);
  if (toName.size === 1) {
    queueMicrotask(sendNames);
  }
}

function sendNames(): void {
  const asked = [...toName];
  toName.clear();
  fetch("/api/instances/named", {
    method: "POST",
    headers: { "content-type": "application/json" },
    body: JSON.stringify({
      ids: asked.map((id) => ({
        id,
        machine: held.ctx?.[id]?.machine ?? null,
      })),
    }),
  })
    .then(async (response) =>
      response.ok ? ((await response.json()) as TabNamed[]) : []
    )
    // Not reached: each tab is read as it stands, and its read says why.
    .catch((): TabNamed[] => [])
    .then((answers) => {
      for (const answer of answers) {
        if (answer.kind === "none") {
          workspace.drop(answer.asked);
        } else if (answer.kind === "session" && answer.id !== answer.asked) {
          workspace.retarget(answer.asked, answer.id);
        }
      }
      for (const id of asked) {
        unnamed.delete(id);
      }
    });
}

/** Whether the tree localStorage keeps has been put in front (`restore`); the server's needs none. */
let restored = $state(!browser);

/** Puts the tree localStorage keeps in front of the server's, once; the URL still names what is in front. */
function restore(): void {
  if (restored) {
    return;
  }
  restored = true;
  const kept = parse(storedIn("local", KEY));
  if (kept) {
    held.root = kept.root;
    held.focusedLeaf = kept.focusedLeaf;
    held.ctx = kept.ctx ?? {};
  }
  // The tree kept here may not hold the URL's tab yet (the server put it in
  // the cookie's): following the URL puts it back, asked nothing when the
  // server named it.
  workspace.followUrl(location.href);
  for (const id of workspace.openIds) {
    askName(id);
  }
  // What the server found holds for this first naming alone: an address
  // given later is asked as any is.
  resolved.clear();
  save();
}

function save(): void {
  if (!(browser && restored)) {
    return;
  }
  const payload = JSON.stringify(held);
  store("local", KEY, payload);
  const tree = JSON.stringify({
    v: held.v,
    root: held.root,
    focusedLeaf: held.focusedLeaf,
  });
  const ctx = JSON.stringify(held.ctx ?? {});
  // The server's copy (prefs.ts), once the layout stops moving: a drag
  // saves on every step, and only where it settles is worth sending. One
  // too long for a cookie is sent as none: the server then draws the URL's
  // tab alone (or the addresses unknown), and the rest arrive with the
  // restore, rather than an older strip drawn as this one.
  clearTimeout(keeping);
  keeping = setTimeout(
    () => keepPrefs({ [KEY]: asPref(tree), [CTX_KEY]: asPref(ctx) }),
    KEEP_AFTER_MS
  );
}

/** How long the layout holds still before its server copy is sent. Our call: past a drag's steps, before a reload. */
const KEEP_AFTER_MS = 300;
let keeping: ReturnType<typeof setTimeout> | undefined;

/* ── Tree walking ─────────────────────────────────────────────────────── */

function leavesOf(node: PaneNode, out: LeafNode[] = []): LeafNode[] {
  if (node.t === "l") {
    out.push(node);
  } else {
    for (const kid of node.kids) {
      leavesOf(kid, out);
    }
  }
  return out;
}

/**
 * The groups whose top edge is the workspace's top edge, left to right: the
 * ones the top bar carries the tabs of. A group is one; a branch that lays
 * its children side by side has every child's, and one that stacks them has
 * only its first child's, since the others stand under it.
 */
export function topLeaves(node: PaneNode): LeafNode[] {
  if (node.t === "l") {
    return [node];
  }
  return node.dir === "h"
    ? node.kids.flatMap(topLeaves)
    : topLeaves(node.kids[0]);
}

function leafById(id: string): LeafNode | null {
  return leavesOf(held.root).find((leaf) => leaf.id === id) ?? null;
}

function leafHolding(sessionId: string): LeafNode | null {
  return (
    leavesOf(held.root).find((leaf) => leaf.tabs.includes(sessionId)) ?? null
  );
}

/* ── Where a tab opens, and where closing it goes back to ─────────────
   A browser's rule: a tab opened from the tab you are on opens just after
   it, not at the strip's end, and closing it goes back to that tab while
   both are open and nothing else has been shown in between; showing any
   other tab forgets where it came from (owner: "if i open a tab from the
   tab i'm already on it should open next to it not at the end, and closing
   it returns me to the tab i was on"). */

/**
 * Puts a conversation in a group's strip if it is not there yet: just after
 * the tab in front, which it was opened from, else (the board in front) at
 * the end.
 */
function place(leaf: LeafNode, sessionId: string): void {
  if (leaf.tabs.includes(sessionId)) {
    return;
  }
  const from = leaf.active;
  const at = from ? leaf.tabs.indexOf(from) : -1;
  if (!from || at === -1) {
    leaf.tabs.push(sessionId);
    leaf.opened = null;
    return;
  }
  leaf.tabs.splice(at + 1, 0, sessionId);
  leaf.opened = { id: sessionId, from };
}

/** Puts a tab in front of its group; any other tab than the one just opened forgets its opener. */
function show(leaf: LeafNode, sessionId: string | null): void {
  if (leaf.opened && leaf.opened.id !== sessionId) {
    leaf.opened = null;
  }
  leaf.active = sessionId;
}

/** A tab that left a group takes the group's opener with it, as the tab opened or the one it came from. */
function forget(leaf: LeafNode, sessionId: string): void {
  if (leaf.opened?.id === sessionId || leaf.opened?.from === sessionId) {
    leaf.opened = null;
  }
}

/** The focused leaf, or the first one — `focusedLeaf` can name a closed leaf. */
function focused(): LeafNode {
  const named = leafById(held.focusedLeaf);
  if (named) {
    return named;
  }
  const [first] = leavesOf(held.root);
  held.focusedLeaf = first.id;
  return first;
}

/** The branch holding a node, or `null` for the root. */
function parentOf(
  target: PaneNode,
  node: PaneNode = held.root
): BranchNode | null {
  if (node.t === "l") {
    return null;
  }
  if (node.kids.includes(target)) {
    return node;
  }
  for (const kid of node.kids) {
    const found = parentOf(target, kid);
    if (found) {
      return found;
    }
  }
  return null;
}

/** Put `next` where `old` currently sits. */
function replace(old: PaneNode, next: PaneNode): void {
  const parent = parentOf(old);
  if (!parent) {
    held.root = next;
    return;
  }
  parent.kids[parent.kids.indexOf(old)] = next;
}

/** Even shares, so a fresh split lands down the middle. */
const evenly = (count: number): number[] =>
  Array.from({ length: count }, () => 100 / count);

/**
 * Put the tree back into a shape the renderer can trust, after any mutation.
 *
 * Three rules, each of which exists because the alternative renders something
 * absurd: a branch with one child is a split with nothing to split against; a
 * leaf holding nothing is a pane with no tab strip and no content; and a size
 * list that has come loose from its children makes paneforge lay out against
 * a length it no longer has.
 *
 * The root is the exception to the empty-leaf rule: a workspace with nothing
 * open is not broken, it is the fleet board.
 */
function normalize(node: PaneNode = held.root): PaneNode | null {
  if (node.t === "l") {
    return node.tabs.length > 0 || node === held.root ? node : null;
  }
  const kids = node.kids
    .map((kid) => normalize(kid))
    .filter((kid): kid is PaneNode => !!kid);
  if (kids.length === 0) {
    return null;
  }
  if (kids.length === 1) {
    return kids[0];
  }
  // A child that survived may have been promoted out of a branch of the same
  // direction; folding it in keeps `h(a, h(b, c))` from rendering as nested
  // groups when it means the same thing as `h(a, b, c)`.
  const flat: PaneNode[] = [];
  for (const kid of kids) {
    if (kid.t === "b" && kid.dir === node.dir) {
      flat.push(...kid.kids);
    } else {
      flat.push(kid);
    }
  }
  node.kids = flat;
  if (node.sizes.length !== flat.length) {
    node.sizes = evenly(flat.length);
  }
  return node;
}

function settle(): void {
  const root = normalize();
  held.root = root ?? emptyLeaf();
  if (!leafById(held.focusedLeaf)) {
    held.focusedLeaf = leavesOf(held.root)[0].id;
  }
  save();
}

/* ── The URL projection ───────────────────────────────────────────────
   One direction only. `conversationHref` builds exactly the href the tab strip
   builds, so a projected URL and a copied link are the same string. */

/** Records how a conversation is addressed, if this is news. */
function remember(sessionId: string, ctx?: AskedContext): void {
  if (!(ctx?.machine && ctx.harness)) {
    return;
  }
  held.ctx ??= {};
  held.ctx[sessionId] = {
    machine: ctx.machine,
    cwd: ctx.cwd ?? "",
    harness: ctx.harness,
  };
}

/**
 * Where a conversation lives: which machine, which folder, which harness.
 *
 * The fleet already knows this. A cawco instance carries its machine, and
 * every online machine publishes a catalogue of the transcripts on its disk —
 * so an id can be RESOLVED rather than carried around. It was being carried:
 * copied into the URL, and into a most-recently-used record that evicts. Both
 * copies could go stale or be lost, and when they were, a conversation with a
 * perfectly good unique id became unreachable — not because anything was
 * missing, but because the one thing that knew where it lived had never been
 * asked.
 *
 * Asked in order of authority: the hub's own instances, then the machines'
 * catalogues, then what we were told when the tab was opened. The first two
 * are live, so a tab whose remembered address was lost heals itself as soon
 * as the fleet answers.
 */
export function contextOf(sessionId: string): SessionContext | null {
  const instance = cawco.instanceIndex.byId.get(sessionId);
  if (instance?.machineId && isSessionRow(instance)) {
    return {
      machine: instance.machineId,
      cwd: instance.cwd,
      harness: instance.harness,
    };
  }
  for (const machine of cawco.machines) {
    if (machine.status !== "online") {
      continue;
    }
    const stored = cawco
      .catalogOf(machine.machineId)
      .find((entry) => entry.sessionId === sessionId);
    if (stored) {
      return {
        machine: machine.machineId,
        cwd: stored.cwd ?? "",
        harness: stored.harness,
      };
    }
  }
  return held.ctx?.[sessionId] ?? workingSet.contextOf(sessionId);
}

/** The session id a URL names, or `null` for the board. */
export function sessionIdOf(url: { readonly pathname: string }): string | null {
  const parts = url.pathname.split("/").filter(Boolean);
  if (parts[0] !== "session") {
    return null;
  }
  return parts[1] ?? null;
}

/**
 * Write the URL without running a load.
 *
 * `pushState` for a session the reader chose to visit, `replaceState` for
 * moves that are not destinations of their own (focusing another pane). Our
 * choice: Back should walk the conversations you went to, not every click
 * that moved focus. Guarded on `browser` because the router does not exist
 * during a render, and wrapped because SvelteKit throws if it is called
 * before the router has initialised — a throw here would take the whole
 * synchronous mutation down with it, and the URL is the one part of this
 * that is allowed to be best-effort.
 *
 * Written after the frame that draws the move, in the order the moves were
 * made. A pushed entry keeps the scroll it leaves (SvelteKit's
 * `capture_scroll` reads `pageXOffset`), and read in the switch's own task
 * that laid out the pane coming in, in the middle of the switch, for a
 * second time before its frame did. With no frame coming (the page hidden)
 * nothing is drawn to wait for, and it is written at once — so is what was
 * waiting on a frame when the page was hidden, which no frame will come for.
 */
const unwritten: { url: string; mode: "push" | "replace" }[] = [];
if (browser) {
  document.addEventListener("visibilitychange", () => {
    if (document.hidden) {
      writeUrls();
    }
  });
}

function writeUrls(): void {
  for (const { url, mode } of unwritten.splice(0)) {
    try {
      goto(url, { shallow: true, replace: mode === "replace" });
    } catch {
      // Before the router is ready the URL is already correct — this is a
      // no-op, not a failure.
    }
  }
}

function project(sessionId: string | null, mode: "push" | "replace"): void {
  if (!browser) {
    return;
  }
  const ctx = sessionId ? contextOf(sessionId) : null;
  const url = conversationHref(sessionId, cawco.instanceIndex, {
    machineId: ctx?.machine,
    cwd: ctx?.cwd,
  });
  unwritten.push({ url, mode });
  if (document.hidden) {
    writeUrls();
  } else if (unwritten.length === 1) {
    requestAnimationFrame(() => setTimeout(writeUrls));
  }
}

/** A tab out of its group (`close`, `drop`); `mode` is how the URL comes to name what is in front. */
function remove(sessionId: string, mode: "push" | "replace"): void {
  restore();
  const leaf = leafHolding(sessionId);
  if (!leaf) {
    return;
  }
  const at = leaf.tabs.indexOf(sessionId);
  const back =
    leaf.active === sessionId && leaf.opened?.id === sessionId
      ? leaf.opened.from
      : null;
  leaf.tabs.splice(at, 1);
  forget(leaf, sessionId);
  workingSet.forget(sessionId);
  if (held.ctx) {
    delete held.ctx[sessionId];
  }
  if (leaf.active === sessionId) {
    leaf.active =
      (back && leaf.tabs.includes(back) ? back : null) ??
      leaf.tabs[at] ??
      leaf.tabs[at - 1] ??
      null;
  }
  // Closing the last tab of a split half closes the half: a group with
  // nothing in it is a divider with a blank on one side, which is not a
  // state worth being able to reach.
  settle();
  if (leaf.id === held.focusedLeaf || !leafById(leaf.id)) {
    project(focused().active, mode);
  }
}

/* ── The store ────────────────────────────────────────────────────────── */

export const workspace = {
  /** Every open conversation, in tab order, across every group. */
  get openIds(): string[] {
    return leavesOf(held.root).flatMap((leaf) => leaf.tabs);
  },

  /** The groups, left to right, for the grid and the mobile pager. */
  get leaves(): LeafNode[] {
    return leavesOf(held.root);
  },

  get root(): PaneNode {
    return held.root;
  },

  get focusedLeafId(): string {
    return focused().id;
  },

  /** What the reader is looking at — `null` is the fleet board. */
  get activeSessionId(): string | null {
    return focused().active;
  },

  /** Which conversation a given group is showing. */
  activeOf(leafId: string): string | null {
    return leafById(leafId)?.active ?? null;
  },

  leaf(leafId: string): LeafNode | null {
    return leafById(leafId);
  },

  /** The group holding a conversation, for a tab that names no group. */
  leafOf(sessionId: string): LeafNode | null {
    return leafHolding(sessionId);
  },

  /**
   * Show a conversation. The synchronous half of every tab click, swipe
   * commit and drop — the re-render happens on this assignment, and the URL
   * catches up afterwards without a load.
   */
  activate(sessionId: string | null, leafId?: string): void {
    restore();
    const leaf =
      (leafId ? leafById(leafId) : leafHolding(sessionId ?? "")) ?? focused();
    if (sessionId) {
      place(leaf, sessionId);
    }
    show(leaf, sessionId);
    held.focusedLeaf = leaf.id;
    save();
    project(sessionId, "push");
  },

  /** Move keyboard focus between groups without changing what is shown. */
  focus(leafId: string): void {
    restore();
    const leaf = leafById(leafId);
    if (!leaf || held.focusedLeaf === leafId) {
      return;
    }
    held.focusedLeaf = leafId;
    save();
    project(leaf.active, "replace");
  },

  /**
   * Open a conversation, adding it to a group (`into`, else the focused one)
   * if it is not already held somewhere. `ctx` is the machine/folder a
   * STORED session is known to live on — a hint that names the pane before
   * the transcript answers, not an address: the URL is the bare id either
   * way, and the hub resolves it.
   */
  open(sessionId: string, ctx?: AskedContext, into?: string): void {
    restore();
    remember(sessionId, ctx);
    if (ctx) {
      workingSet.visit(sessionId, ctx);
    } else {
      workingSet.visit(sessionId);
    }
    this.activate(sessionId, leafHolding(sessionId)?.id ?? into);
  },

  /**
   * Bring a conversation on screen because the URL now names it — a deep
   * link, a back button, a link from another route. Same shape as `open`,
   * but it never writes the URL back: the URL is already what it is, and
   * projecting it again would push a duplicate history entry.
   */
  reveal(sessionId: string | null, ctx?: AskedContext): void {
    restore();
    if (sessionId) {
      remember(sessionId, ctx);
      if (ctx) {
        workingSet.visit(sessionId, ctx);
      } else {
        workingSet.visit(sessionId);
      }
    }
    const leaf = (sessionId ? leafHolding(sessionId) : null) ?? focused();
    if (sessionId) {
      place(leaf, sessionId);
      // An address can name anything: asked of the hub before it is read.
      askName(sessionId);
    }
    show(leaf, sessionId);
    held.focusedLeaf = leaf.id;
    save();
  },

  /**
   * The address bar into the store: a `/session[/<id>]` address puts its
   * conversation in front (`reveal`), as the server's first paint already
   * did from the cookie ((app)/+layout.server.ts). Any other route leaves
   * the workspace holding what it holds, so a trip to Usage and back does
   * not cost the reader their place.
   *
   * The Shell calls it before anything is drawn (the bar's strip reads the
   * workspace ahead of the session surface), so the first client render
   * holds the tab the server drew, under the same key; it is called again
   * on each history move and real navigation (SessionSurface).
   */
  followUrl(href: string): void {
    const url = new URL(href);
    const parts = url.pathname.split("/").filter(Boolean);
    if (parts[0] !== "session") {
      return;
    }
    const urlId = parts[1] ?? null;
    // A record to open at (`?at=`), asked of the conversation whether or not
    // it is already in front: its transcript seeks there either way.
    const at = url.searchParams.get("at");
    if (urlId && at) {
      askOpenAt(urlId, at);
    }
    // An artifact to open in its panel at its first pending stop
    // (`?artifact=`, a Needs-you row's address), asked whether or not the
    // conversation is in front.
    const artifact = url.searchParams.get("artifact");
    // A thread's panel is its project's lead's (ThreadPane `previewOf`).
    const holder =
      urlId && threadIdOf(urlId)
        ? cawco.projects.find(
            (one) => one.id === cawco.threadOf(urlId)?.projectId
          )?.leadInstanceId
        : urlId;
    if (browser && holder && artifact) {
      // biome-ignore lint/complexity/noVoid: a refusal is kept where its row says it (artifactOpenKey)
      void openArtifactIn(
        holder,
        artifact,
        artifactStopOf(url.searchParams.get("stop"))
      );
    }
    if (urlId === this.activeSessionId) {
      return;
    }
    // Only carry context when the URL actually names a machine. A stored
    // conversation's machine and folder are how it is addressed at all, and
    // `workingSet.visit` SPREADS what it is given over what it holds — so a
    // blank context from a URL with no query string erases the real one, and
    // a pane that was reading a transcript reports itself unreachable.
    const machine = url.searchParams.get("machine");
    this.reveal(
      urlId,
      urlId && machine
        ? {
            machine,
            cwd: url.searchParams.get("cwd") ?? "",
            harness: harnessNamed(url.searchParams.get("harness")),
          }
        : undefined
    );
  },

  /**
   * Re-address a tab without moving it. A conversation opened by its session
   * id — an old link, a message from the phone — lives at its instance's
   * address once the instance list names one, the same address every link in
   * the app already points at; until then the pane cannot tell it is live.
   * The tab keeps its place and, if it was showing, keeps showing.
   */
  retarget(from: string, to: string): void {
    restore();
    const leaf = leafHolding(from);
    if (!leaf) {
      return;
    }
    carryOpenAt(from, to);
    const at = leaf.tabs.indexOf(from);
    if (leaf.tabs.includes(to)) {
      leaf.tabs.splice(at, 1);
    } else {
      leaf.tabs[at] = to;
    }
    if (leaf.active === from) {
      leaf.active = to;
    }
    // Still the same conversation: where it was opened from holds.
    if (leaf.opened?.id === from) {
      leaf.opened.id = to;
    }
    if (leaf.opened?.from === from) {
      leaf.opened.from = to;
    }
    workingSet.forget(from);
    workingSet.visit(to);
    if (held.ctx) {
      delete held.ctx[from];
    }
    save();
    if (leaf.id === held.focusedLeaf && leaf.active === to) {
      project(to, "replace");
    }
  },

  /**
   * Close a tab. The tab in front goes back to the tab it was opened from
   * (`opened`), while that is still open and nothing else was shown since;
   * otherwise the group falls back to its neighbour, the right one, else the
   * left, rather than to the board — closing the third of four
   * conversations should leave you in the strip, not back at the fleet.
   * Closing a tab that is not in front changes nothing about what is shown.
   */
  close(sessionId: string): void {
    remove(sessionId, "push");
  },

  /**
   * Take away a tab that names nothing (the hub's `TabNamed` none) as
   * `close` does, but as no move of the reader's: Back never walks to it.
   */
  drop(sessionId: string): void {
    remove(sessionId, "replace");
  },

  /** Whether the hub has named tab `id` (Naming the tabs): until it has, nothing reads it. */
  named(id: string): boolean {
    return !unnamed.has(id);
  },

  /**
   * Show a conversation the reader did not pick: what a wide screen opens
   * when nothing is open. Same as `open`, but the URL is replaced rather than
   * pushed, so Back never walks into a conversation the app chose.
   */
  land(sessionId: string): void {
    restore();
    workingSet.visit(sessionId);
    const leaf = leafHolding(sessionId) ?? focused();
    place(leaf, sessionId);
    show(leaf, sessionId);
    held.focusedLeaf = leaf.id;
    save();
    project(sessionId, "replace");
  },

  /**
   * Give every group that holds tabs a conversation in front. A phone's
   * home is the focused group showing nothing (`reveal(null)`); on a wide
   * screen there is no home in the detail area, so a group left that way
   * would draw blank beside the others. Its first tab comes forward, and
   * the URL is replaced (not pushed) to name what is now in front.
   */
  fillGroups(): void {
    restore();
    let changed = false;
    for (const leaf of leavesOf(held.root)) {
      if (leaf.active === null && leaf.tabs.length > 0) {
        show(leaf, leaf.tabs[0]);
        changed = true;
      }
    }
    if (changed) {
      save();
      project(focused().active, "replace");
    }
  },

  /**
   * Fold the tree down to at most `max` groups, the extra groups' tabs moving
   * into the last group kept. What a layout that allows fewer groups (a
   * tablet's two, a single wide transcript) does to a tree made at a desk.
   */
  capLeaves(max: number): void {
    restore();
    const leaves = leavesOf(held.root);
    if (leaves.length <= max) {
      return;
    }
    const kept = leaves.slice(0, max);
    const into = kept.at(-1) as LeafNode;
    for (const extra of leaves.slice(max)) {
      for (const id of extra.tabs) {
        if (!into.tabs.includes(id)) {
          into.tabs.push(id);
        }
      }
      if (extra.id === held.focusedLeaf) {
        show(into, extra.active ?? into.active);
        held.focusedLeaf = into.id;
      }
      extra.tabs = [];
      extra.active = null;
    }
    settle();
  },

  /**
   * Split a group, putting a conversation in the new half. Refused when the
   * layout already holds as many groups as `maxLeaves` allows.
   *
   * "Always move": a conversation lives in exactly one group, so it leaves
   * wherever it was. That is the invariant that keeps session state keyed by
   * id alone — no pane owns a private copy of a scroll position or a draft,
   * because no conversation is ever in two places to disagree about.
   */
  split(
    leafId: string,
    edge: "left" | "right" | "top" | "bottom",
    sessionId: string
  ): void {
    restore();
    const target = leafById(leafId);
    if (!target || leavesOf(held.root).length >= layoutPolicy.maxLeaves) {
      return;
    }
    const from = leafHolding(sessionId);
    // Splitting a group against its only tab would leave an empty half.
    if (from === target && target.tabs.length < 2) {
      return;
    }
    if (from) {
      from.tabs.splice(from.tabs.indexOf(sessionId), 1);
      forget(from, sessionId);
      if (from.active === sessionId) {
        show(from, from.tabs[0] ?? null);
      }
    }
    const made: LeafNode = {
      t: "l",
      id: nodeId(),
      tabs: [sessionId],
      active: sessionId,
    };
    const dir = edge === "left" || edge === "right" ? "h" : "v";
    const before = edge === "left" || edge === "top";
    const kids = before ? [made, target] : [target, made];
    replace(target, { t: "b", id: nodeId(), dir, sizes: evenly(2), kids });
    held.focusedLeaf = made.id;
    fresh = made.id;
    settle();
    project(sessionId, "push");
  },

  /**
   * Move a conversation into a group that already exists, at an index in its
   * strip. Same invariant as `split`: it leaves where it was first.
   */
  move(sessionId: string, leafId: string, index?: number): void {
    restore();
    const target = leafById(leafId);
    if (!target) {
      return;
    }
    const from = leafHolding(sessionId);
    if (from) {
      from.tabs.splice(from.tabs.indexOf(sessionId), 1);
      forget(from, sessionId);
      if (from.active === sessionId) {
        show(from, from.tabs[0] ?? null);
      }
    }
    const at =
      index === undefined
        ? target.tabs.length
        : Math.max(0, Math.min(index, target.tabs.length));
    target.tabs.splice(at, 0, sessionId);
    show(target, sessionId);
    held.focusedLeaf = target.id;
    settle();
    project(sessionId, "push");
  },

  /** Reorder within one group's strip, for a drag that never left it. */
  reorder(leafId: string, sessionId: string, index: number): void {
    restore();
    const leaf = leafById(leafId);
    if (!leaf) {
      return;
    }
    const at = leaf.tabs.indexOf(sessionId);
    if (at === -1) {
      return;
    }
    leaf.tabs.splice(at, 1);
    leaf.tabs.splice(
      Math.max(0, Math.min(index, leaf.tabs.length)),
      0,
      sessionId
    );
    save();
  },

  /** Whether `leafId` is the group a split just made; true once, to the grid rendering it. */
  takeFresh(leafId: string): boolean {
    if (fresh !== leafId) {
      return false;
    }
    fresh = null;
    return true;
  },

  /** Record a resize. Written by paneforge as the divider moves. */
  resize(branchId: string, sizes: number[]): void {
    restore();
    const walk = (node: PaneNode): BranchNode | null => {
      if (node.t === "l") {
        return null;
      }
      if (node.id === branchId) {
        return node;
      }
      for (const kid of node.kids) {
        const found = walk(kid);
        if (found) {
          return found;
        }
      }
      return null;
    };
    const branch = walk(held.root);
    if (!branch || branch.sizes.length !== sizes.length) {
      return;
    }
    branch.sizes = sizes;
    save();
  },

  /**
   * The tree the server drew this page from (the layout's data, from its
   * cookie), for the first render on both sides: on the server every
   * render, because the module is shared across requests; in the browser
   * until `restore`, so the Shell coming back later (an artifact's own
   * route left) never sets the reader's tree back to the server's.
   * `named`: the tabs the server found the hub listing as sessions under
   * their own id, which `restore` asks nothing of (Naming the tabs); kept in
   * the browser alone, since on the server the module is every request's.
   */
  serve(served: WorkspaceV1 | null, named: readonly string[]): void {
    if (browser && restored) {
      return;
    }
    if (browser) {
      for (const id of named) {
        resolved.add(id);
      }
    }
    const next = served && validate(served.root) ? served : unserved();
    held.root = next.root;
    held.focusedLeaf = next.focusedLeaf;
    held.ctx = next.ctx ?? {};
  },

  /** Whether the tree localStorage keeps is in front yet: what happens of itself (a group filled, a tab re-addressed) waits for it. */
  get restored(): boolean {
    return restored;
  },

  /** Once the first paint is up: the tree localStorage keeps, in front of the server's (Persistence above). */
  restore,
};
