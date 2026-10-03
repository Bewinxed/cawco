import type {
  ClaudeLimits,
  InstanceRow,
  Workflow,
  WorkflowRun,
} from "@cawco/core";
import { runIdOf } from "#lib/cawco/workflow-runs.js";
import type { LayoutServerLoad } from "./$types";

/**
 * The sidebar rail's width is this browser's preference, not the fleet's. It is
 * read here from a cookie so the server renders the resolved width into the
 * first paint — before this, the width lived only in localStorage, so SSR drew
 * the default and the rail visibly jumped once the client read the real value
 * on mount. The bounds mirror Shell.svelte's clamp.
 */
const RAIL_KEY = "cawco-rail-width";
const RAIL_MIN = 216;
const RAIL_MAX = 520;
const RAIL_DEFAULT = 228;

/**
 * The cookie workspace.svelte.ts mirrors its localStorage into — declared here
 * rather than imported so the server never pulls the client store (and its
 * module-level `$state`) into a request. The shapes mirror that module's.
 */
const WORKSPACE_KEY = "cawco-workspace";
/** The addresses of what the tree holds, kept apart from it (workspace.svelte.ts, Persistence). */
const WORKSPACE_CTX_KEY = "cawco-workspace-ctx";

const SESSION_PATH = /^\/session\/([^/]+)/;

/**
 * Whether this browser is a phone, for the session surface's first paint.
 * The deck-or-grid decision is a media query on the client, which the server
 * cannot run, so SSR drew the grid and the phone flipped to the deck once the
 * bundle ran. The client mirrors the query into this cookie; on the very first
 * visit, before any cookie, the client hints and the user agent stand in. The
 * cookie is primary because an iPad in desktop mode reports a Macintosh UA.
 */
const NARROW_KEY = "cawco-narrow";
const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone/i;

function narrowOf(cookie: string | undefined, headers: Headers): boolean {
  if (cookie === "1") {
    return true;
  }
  if (cookie === "0") {
    return false;
  }
  const hint = headers.get("sec-ch-ua-mobile");
  if (hint) {
    return hint.trim() === "?1";
  }
  return PHONE_UA.test(headers.get("user-agent") ?? "");
}

interface LeafNode {
  active: string | null;
  id: string;
  t: "l";
  tabs: string[];
}
interface BranchNode {
  dir: "h" | "v";
  id: string;
  kids: PaneNode[];
  sizes: number[];
  t: "b";
}
type PaneNode = LeafNode | BranchNode;
interface SessionContext {
  cwd: string;
  harness: string;
  machine: string | null;
}
export interface WorkspaceV1 {
  ctx?: Record<string, SessionContext>;
  focusedLeaf: string;
  root: PaneNode;
  v: 1;
}

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

function parseCtx(
  raw: string | null | undefined
): Record<string, SessionContext> {
  try {
    return JSON.parse(raw ?? "{}") as Record<string, SessionContext>;
  } catch {
    return {};
  }
}

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

const blank = (): WorkspaceV1 => ({
  v: 1,
  root: { t: "l", id: "p0", tabs: [], active: null },
  focusedLeaf: "p0",
  ctx: {},
});

/** The conversation the URL names, or '' on the board and everywhere else. */
function currentId(pathname: string): string {
  const match = SESSION_PATH.exec(pathname);
  return match ? decodeURIComponent(match[1]) : "";
}

/**
 * The account's Claude limits, as the sidebar's usage meter shows them: read
 * here so the first paint draws the meter at the size it will have, not an
 * empty footer that grows when the live reading arrives. Limits belong to the
 * account, so it is the first reading without an error, else the first.
 */
async function usageLimits(
  fetch: typeof globalThis.fetch
): Promise<ClaudeLimits | null> {
  try {
    const response = await fetch("/api/usage/limits");
    if (!response.ok) {
      return null;
    }
    const { machines } = (await response.json()) as {
      machines: { limits: ClaudeLimits }[];
    };
    const readings = machines.map((reading) => reading.limits);
    return (
      readings.find((reading) => reading.error === null) ?? readings[0] ?? null
    );
  } catch {
    return null;
  }
}

export const load: LayoutServerLoad = async ({
  cookies,
  fetch,
  request,
  url,
  untrack,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: first-paint reconciliation of the workspace cookie against the URL — one pass, not split in this pass
}) => {
  const narrow = narrowOf(cookies.get(NARROW_KEY), request.headers);
  const stored = Number(cookies.get(RAIL_KEY));
  const railWidth =
    Number.isFinite(stored) && stored > 0
      ? Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(stored)))
      : RAIL_DEFAULT;

  const usage = await usageLimits(fetch);

  let workspace = parse(cookies.get(WORKSPACE_KEY));
  if (workspace) {
    workspace.ctx = parseCtx(cookies.get(WORKSPACE_CTX_KEY));
  }

  // Untrack URL access: a switch between conversations is a shallow pushState
  // and the client store is authoritative after hydration. This load exists
  // for the first paint only — re-running it on every navigation would repeat
  // the title fetches for nothing. Mirrors what `workspace.reveal()` does.
  const pathname = untrack(() => url.pathname);
  const urlId = currentId(pathname);
  if (urlId) {
    workspace ??= blank();
    const leaves = leavesOf(workspace.root);
    const { focusedLeaf } = workspace;
    const leaf =
      leaves.find((l) => l.tabs.includes(urlId)) ??
      leaves.find((l) => l.id === focusedLeaf) ??
      leaves[0];
    if (!leaf.tabs.includes(urlId)) {
      leaf.tabs.push(urlId);
    }
    leaf.active = urlId;
    workspace.focusedLeaf = leaf.id;
    const machine = untrack(() => url.searchParams.get("machine"));
    if (machine) {
      workspace.ctx ??= {};
      workspace.ctx[urlId] ??= {
        machine,
        cwd: untrack(() => url.searchParams.get("cwd")) ?? "",
        harness: untrack(() => url.searchParams.get("harness")) ?? "claude",
      };
    }
  } else if (pathname === "/session" && workspace) {
    const leaves = leavesOf(workspace.root);
    const { focusedLeaf } = workspace;
    const leaf = leaves.find((l) => l.id === focusedLeaf) ?? leaves[0];
    leaf.active = null;
  }

  const names: Record<string, string> = {};
  if (!workspace) {
    return { railWidth, narrow, workspace, names, usage };
  }

  const open = leavesOf(workspace.root).flatMap((leaf) => leaf.tabs);
  if (open.length === 0) {
    return { railWidth, narrow, workspace, names, usage };
  }

  // What the fleet calls these conversations. A machine that cannot answer just
  // leaves every tab named by its folder, which is what the strip falls back to
  // on the client too.
  let rows: InstanceRow[] = [];
  try {
    const response = await fetch("/api/instances");
    if (response.ok) {
      rows = (await response.json()) as InstanceRow[];
    }
  } catch {
    rows = [];
  }
  for (const id of open) {
    const title = rows.find((instance) => instance.id === id)?.title?.trim();
    if (title) {
      names[id] = title;
    }
  }

  // A workflow run's tab is called by its workflow, as the client names it
  // (workflow-runs.ts): the run says which workflow, the list says its name.
  const runs = open.flatMap((id) => {
    const runId = runIdOf(id);
    return runId ? [{ id, runId }] : [];
  });
  if (runs.length > 0) {
    try {
      const [listing, ...read] = await Promise.all([
        fetch("/api/workflows").then((response) =>
          response.ok
            ? (response.json() as Promise<{ workflows: Workflow[] }>)
            : { workflows: [] }
        ),
        ...runs.map(({ runId }) =>
          fetch(`/api/workflow-runs/${encodeURIComponent(runId)}`).then(
            (response) =>
              response.ok ? (response.json() as Promise<WorkflowRun>) : null
          )
        ),
      ]);
      runs.forEach(({ id }, i) => {
        const name = listing.workflows.find(
          (workflow) => workflow.id === read[i]?.workflowId
        )?.name;
        if (name) {
          names[id] = name;
        }
      });
    } catch {
      // A hub that cannot answer leaves run tabs to their client name.
    }
  }

  // The board is a working set: it drops a session that has not moved in a day.
  // The strip is not — it carries whatever the reader left open, so a tab on an
  // aged-out conversation has no row to read a name off. The name is not
  // missing, only filtered out of the listing, so ask for it by id: one batched
  // call, and only for the tabs the listing did not name.
  const unnamed = open.filter((id) => !(names[id] || runIdOf(id)));
  if (unnamed.length > 0) {
    const ctx = workspace.ctx ?? {};
    try {
      const response = await fetch("/api/instances/titles", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          ids: unnamed.map((id) => ({
            id,
            machine: ctx[id]?.machine ?? undefined,
            cwd: ctx[id]?.cwd,
            harness: ctx[id]?.harness,
          })),
        }),
      });
      if (response.ok) {
        // biome-ignore lint/performance/noAwaitInLoops: the await resolves the iterable once, before the loop starts — the loop body itself never awaits
        for (const { id, title } of (await response.json()) as {
          id: string;
          title: string | null;
        }[]) {
          if (title?.trim()) {
            names[id] = title.trim();
          }
        }
      }
    } catch {
      // A hub that cannot answer leaves those tabs to their client fallback.
    }
  }

  return { railWidth, narrow, workspace, names, usage };
};
