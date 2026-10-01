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
import { browser } from "$app/environment";
import { pushState, replaceState } from "$app/navigation";
import { cawco } from "../client.svelte";
import { conversationHref } from "../links";
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
  t: "l";
  tabs: string[];
}

export type PaneNode = BranchNode | LeafNode;

/** How a stored conversation is addressed: which machine, which folder. */
export interface SessionContext {
  cwd: string;
  harness: string;
  machine: string;
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
/** The cookie the addresses (`ctx`) ride in, apart from the tree. */
const CTX_KEY = "cawco-workspace-ctx";
/** A year: the layout is a habit, not a session. Matches the working set. */
const COOKIE_MAX_AGE = 60 * 60 * 24 * 365;

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

function blank(): WorkspaceV1 {
  const leaf = emptyLeaf();
  return { v: 1, root: leaf, focusedLeaf: leaf.id, ctx: {} };
}

/* ── Persistence ──────────────────────────────────────────────────────
   localStorage is the source; the cookies are the copy the SERVER renders
   from. Both are written on every mutation, exactly as the working set
   does, so the first paint and the first client render agree.

   The tree and the addresses are two cookies. A browser refuses a cookie
   over 4KB outright and keeps the one it had, and an address runs to a
   hundred bytes and more: in one cookie, a strip with a couple of dozen
   stored conversations open stopped being saved for the server, which
   then drew every reload in an older order and the client reshuffled it
   on hydration. The tree alone is ~45 bytes a tab. */

const cookie = (key: string): string | null => {
  if (typeof document === "undefined") {
    return null;
  }
  const match = new RegExp(`(?:^|;\\s*)${key}=([^;]*)`).exec(document.cookie);
  // biome-ignore lint/suspicious/noUnnecessaryConditions: exec() can return null at runtime when the cookie is absent; Biome's inference here is narrower than the real type
  if (!match) {
    return null;
  }
  try {
    return decodeURIComponent(match[1]);
  } catch {
    return null;
  }
};

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

function load(): WorkspaceV1 {
  let stored: string | null = null;
  try {
    if (typeof localStorage !== "undefined") {
      stored = localStorage.getItem(KEY);
    }
  } catch {
    // A browser that will not read storage still has the cookie.
  }
  return parse(stored) ?? fromCookies() ?? blank();
}

/** The tree the server was sent, with its addresses put back. */
function fromCookies(): WorkspaceV1 | null {
  const tree = parse(cookie(KEY));
  if (!tree) {
    return null;
  }
  try {
    tree.ctx = JSON.parse(cookie(CTX_KEY) ?? "{}") as Record<
      string,
      SessionContext
    >;
  } catch {
    tree.ctx = {};
  }
  return tree;
}

const held = $state<WorkspaceV1>(load());

function save(): void {
  if (!browser) {
    return;
  }
  const payload = JSON.stringify(held);
  try {
    if (typeof localStorage !== "undefined") {
      localStorage.setItem(KEY, payload);
    }
  } catch {
    // A browser that will not store just starts the layout over next time.
  }
  const tree = JSON.stringify({
    v: held.v,
    root: held.root,
    focusedLeaf: held.focusedLeaf,
  });
  const ctx = JSON.stringify(held.ctx ?? {});
  const attributes = `path=/; max-age=${COOKIE_MAX_AGE}; samesite=lax`;
  try {
    // biome-ignore lint/suspicious/noDocumentCookie: Cookie Store API is async and unsupported in Safari; this write must stay synchronous with the try/catch fallback below
    document.cookie = `${KEY}=${encodeURIComponent(tree)}; ${attributes}`;
    // biome-ignore lint/suspicious/noDocumentCookie: as above
    document.cookie = `${CTX_KEY}=${encodeURIComponent(ctx)}; ${attributes}`;
  } catch {
    // Cookies refused: SSR falls back to the URL's session alone.
  }
}

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

function leafById(id: string): LeafNode | null {
  return leavesOf(held.root).find((leaf) => leaf.id === id) ?? null;
}

function leafHolding(sessionId: string): LeafNode | null {
  return (
    leavesOf(held.root).find((leaf) => leaf.tabs.includes(sessionId)) ?? null
  );
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
function remember(
  sessionId: string,
  ctx?: { machine?: string | null; cwd?: string; harness?: string }
): void {
  if (!ctx?.machine) {
    return;
  }
  held.ctx ??= {};
  held.ctx[sessionId] = {
    machine: ctx.machine,
    cwd: ctx.cwd ?? "",
    harness: ctx.harness ?? "claude",
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
  if (instance?.machineId) {
    return {
      machine: instance.machineId,
      cwd: instance.cwd ?? "",
      harness: instance.harness ?? "claude",
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
        harness: stored.harness ?? "claude",
      };
    }
  }
  return held.ctx?.[sessionId] ?? workingSet.contextOf(sessionId);
}

/**
 * Ask the hub where a conversation lives, for the ids nothing local knows.
 *
 * The local answers above cover everything on screen: the hub's instances and
 * the machines' catalogues both arrive with the fleet. What they cannot cover
 * is a conversation older than a catalogue's cut-off — 898 transcripts on one
 * machine here, of which the sidebar asks for the newest 25, because reading
 * all of them to draw a list would be absurd. That cut-off was never meant to
 * decide what is REACHABLE, and for a while it did.
 *
 * So an id nothing local recognises is asked about once, directly. The hub
 * looks in its own rows, then asks the machines — one id, a lookup rather
 * than a directory sweep — and remembers the answer for every reader after.
 * Resolved addresses are written into the tree, so this happens once per
 * conversation and never again.
 */
const asking = new Map<string, Promise<SessionContext | null>>();

export function locate(sessionId: string): Promise<SessionContext | null> {
  const local = contextOf(sessionId);
  if (local) {
    return Promise.resolve(local);
  }
  const already = asking.get(sessionId);
  if (already) {
    return already;
  }

  const ask = (async (): Promise<SessionContext | null> => {
    try {
      const response = await fetch(
        `/api/instances/${encodeURIComponent(sessionId)}/location`
      );
      if (!response.ok) {
        return null;
      }
      // The hub answers in its own vocabulary — `machineId`, as every row of
      // the fleet is keyed — and this store speaks of a `machine`.
      const found = (await response.json()) as {
        machineId?: string;
        cwd?: string;
        harness?: string;
      } | null;
      if (!found?.machineId) {
        return null;
      }
      const where: SessionContext = {
        machine: found.machineId,
        cwd: found.cwd ?? "",
        harness: found.harness ?? "claude",
      };
      held.ctx ??= {};
      held.ctx[sessionId] = where;
      save();
      return where;
    } catch {
      return null;
    } finally {
      asking.delete(sessionId);
    }
  })();
  asking.set(sessionId, ask);
  return ask;
}

/** The session id a URL names, or `null` for the board. */
export function sessionIdOf(url: URL): string | null {
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
 */
function project(sessionId: string | null, mode: "push" | "replace"): void {
  if (!browser) {
    return;
  }
  const ctx = sessionId ? contextOf(sessionId) : null;
  const url = conversationHref(sessionId, cawco.instanceIndex, {
    machineId: ctx?.machine,
    cwd: ctx?.cwd,
  });
  try {
    if (mode === "push") {
      pushState(url, {});
    } else {
      replaceState(url, {});
    }
  } catch {
    // Before the router is ready the URL is already correct — this is a
    // no-op, not a failure.
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
    const leaf =
      (leafId ? leafById(leafId) : leafHolding(sessionId ?? "")) ?? focused();
    if (sessionId && !leaf.tabs.includes(sessionId)) {
      leaf.tabs.push(sessionId);
    }
    leaf.active = sessionId;
    held.focusedLeaf = leaf.id;
    save();
    project(sessionId, "push");
  },

  /** Move keyboard focus between groups without changing what is shown. */
  focus(leafId: string): void {
    const leaf = leafById(leafId);
    if (!leaf || held.focusedLeaf === leafId) {
      return;
    }
    held.focusedLeaf = leafId;
    save();
    project(leaf.active, "replace");
  },

  /**
   * Open a conversation, adding it to the focused group if it is not already
   * held somewhere. `ctx` is the machine/folder a STORED session is known to
   * live on — a hint that names the pane before the transcript answers, not
   * an address: the URL is the bare id either way, and the hub resolves it.
   */
  open(
    sessionId: string,
    ctx?: { machine?: string | null; cwd?: string; harness?: string }
  ): void {
    remember(sessionId, ctx);
    if (ctx) {
      workingSet.visit(sessionId, ctx);
    } else {
      workingSet.visit(sessionId);
    }
    this.activate(sessionId, leafHolding(sessionId)?.id);
  },

  /**
   * Bring a conversation on screen because the URL now names it — a deep
   * link, a back button, a link from another route. Same shape as `open`,
   * but it never writes the URL back: the URL is already what it is, and
   * projecting it again would push a duplicate history entry.
   */
  reveal(
    sessionId: string | null,
    ctx?: { machine?: string | null; cwd?: string; harness?: string }
  ): void {
    if (sessionId) {
      remember(sessionId, ctx);
      if (ctx) {
        workingSet.visit(sessionId, ctx);
      } else {
        workingSet.visit(sessionId);
      }
    }
    const leaf = (sessionId ? leafHolding(sessionId) : null) ?? focused();
    if (sessionId && !leaf.tabs.includes(sessionId)) {
      leaf.tabs.push(sessionId);
    }
    leaf.active = sessionId;
    held.focusedLeaf = leaf.id;
    save();
  },

  /**
   * Re-address a tab without moving it. A conversation opened by its session
   * id — an old link, a message from the phone — lives at its instance's
   * address once the instance list names one, the same address every link in
   * the app already points at; until then the pane cannot tell it is live.
   * The tab keeps its place and, if it was showing, keeps showing.
   */
  retarget(from: string, to: string): void {
    const leaf = leafHolding(from);
    if (!leaf) {
      return;
    }
    const at = leaf.tabs.indexOf(from);
    if (leaf.tabs.includes(to)) {
      leaf.tabs.splice(at, 1);
    } else {
      leaf.tabs[at] = to;
    }
    if (leaf.active === from) {
      leaf.active = to;
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
   * Close a tab. The group falls back to its neighbour rather than to the
   * board — closing the third of four conversations should leave you in the
   * strip, not back at the fleet.
   */
  close(sessionId: string): void {
    const leaf = leafHolding(sessionId);
    if (!leaf) {
      return;
    }
    const at = leaf.tabs.indexOf(sessionId);
    leaf.tabs.splice(at, 1);
    workingSet.forget(sessionId);
    if (held.ctx) {
      delete held.ctx[sessionId];
    }
    if (leaf.active === sessionId) {
      leaf.active = leaf.tabs[at] ?? leaf.tabs[at - 1] ?? null;
    }
    // Closing the last tab of a split half closes the half: a group with
    // nothing in it is a divider with a blank on one side, which is not a
    // state worth being able to reach.
    settle();
    if (leaf.id === held.focusedLeaf || !leafById(leaf.id)) {
      project(this.activeSessionId, "push");
    }
  },

  /**
   * Show a conversation the reader did not pick: what a wide screen opens
   * when nothing is open. Same as `open`, but the URL is replaced rather than
   * pushed, so Back never walks into a conversation the app chose.
   */
  land(sessionId: string): void {
    workingSet.visit(sessionId);
    const leaf = leafHolding(sessionId) ?? focused();
    if (!leaf.tabs.includes(sessionId)) {
      leaf.tabs.push(sessionId);
    }
    leaf.active = sessionId;
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
    let changed = false;
    for (const leaf of leavesOf(held.root)) {
      if (leaf.active === null && leaf.tabs.length > 0) {
        leaf.active = leaf.tabs[0];
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
        into.active = extra.active ?? into.active;
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
      if (from.active === sessionId) {
        from.active = from.tabs[0] ?? null;
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
    const target = leafById(leafId);
    if (!target) {
      return;
    }
    const from = leafHolding(sessionId);
    if (from) {
      from.tabs.splice(from.tabs.indexOf(sessionId), 1);
      if (from.active === sessionId) {
        from.active = from.tabs[0] ?? null;
      }
    }
    const at =
      index === undefined
        ? target.tabs.length
        : Math.max(0, Math.min(index, target.tabs.length));
    target.tabs.splice(at, 0, sessionId);
    target.active = sessionId;
    held.focusedLeaf = target.id;
    settle();
    project(sessionId, "push");
  },

  /** Reorder within one group's strip, for a drag that never left it. */
  reorder(leafId: string, sessionId: string, index: number): void {
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

  /** Server only: this request's tree, from its cookie. Reset every render, because the module is shared across requests. */
  serve(served: WorkspaceV1 | null): void {
    if (browser) {
      return;
    }
    const next = served && validate(served.root) ? served : blank();
    held.root = next.root;
    held.focusedLeaf = next.focusedLeaf;
    held.ctx = next.ctx ?? {};
  },
};
