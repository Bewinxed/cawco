import { harnessNamed } from "@cawco/core/harness";
import type { HubAuthState } from "@cawco/core/hub-auth";
import { hubRequest } from "@cawco/core/hub-request";
import type {
  InstanceRow,
  SessionPulse,
  StoredRecent,
} from "@cawco/core/protocol";
import type { Machine, ProjectRow } from "#lib/cawco/client.svelte.js";
import { type ServedBoard, servedBoardOf } from "#lib/cawco/first-paint.js";
import type { Area } from "#lib/cawco/home/areas.svelte.js";
import { type HubRead, readHub } from "#lib/cawco/hub-read.js";
import { KEPT, type Pref, prefCookie } from "#lib/cawco/prefs.js";
import {
  isSessionTab,
  projectOfTab,
  tabOfPath,
} from "#lib/cawco/workspace/tabs.js";
import {
  blankWorkspace,
  leavesOf,
  parseContexts,
  parseWorkspace,
} from "#lib/cawco/workspace/tree.js";
import {
  FOLD_BOXES_PREF,
  parseFoldBoxes,
} from "#lib/components/ui/fluid-tabs/fold-memory.js";
import type { LayoutServerLoad } from "./$types";

/**
 * The sidebar rail's width is this browser's preference, not the fleet's. It is
 * read here from a cookie so the server renders the resolved width into the
 * first paint — before this, the width lived only in localStorage, so SSR drew
 * the default and the rail visibly jumped once the client read the real value
 * on mount. The bounds mirror Shell.svelte's clamp. No cookie is null: the
 * shell then draws the `c-sidebar-w` token, the default's one source.
 */
const RAIL_KEY = "cawco-rail-width";
const RAIL_MIN = 216;
const RAIL_HIDDEN_KEY = "cawco-rail-hidden";
const RAIL_MAX = 520;

/**
 * The server's copy of the workspace localStorage keeps (workspace.svelte.ts,
 * Persistence): the whole tree or none, never a part. The first client render
 * draws from what this load gives it, so hydration keeps what was served.
 * Read with the tree's own module (workspace/tree.ts), which the server
 * imports without the client store and its module-level `$state`.
 */
const WORKSPACE_KEY = "cawco-workspace";
/** The addresses of what the tree holds, kept apart from it (workspace.svelte.ts, Persistence). */
const WORKSPACE_CTX_KEY = "cawco-workspace-ctx";

/**
 * Whether this browser is a phone, for the session surface's first paint.
 * The deck-or-grid decision is a media query on the client, which the server
 * cannot run, so SSR drew the grid and the phone flipped to the deck once the
 * bundle ran. The client keeps the query's answer in this cookie; on the very
 * first visit, before any cookie, the client hints and the user agent stand
 * in. The cookie is primary because an iPad in desktop mode reports a
 * Macintosh UA. The first client render draws this answer too, and the query
 * takes over a frame later (lib/cawco/first-render.svelte.ts).
 */
const NARROW_KEY = "cawco-narrow";
const PHONE_UA = /iPhone|iPod|Android.*Mobile|Windows Phone/iu;

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

export const load: LayoutServerLoad = async ({
  cookies,
  fetch,
  request,
  url,
  untrack,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: first-paint reconciliation of the workspace cookie against the URL — one pass, not split in this pass
}) => {
  const pref = (name: Pref) => cookies.get(prefCookie(name, url));
  const narrow = narrowOf(pref(NARROW_KEY), request.headers);
  // Who this browser is to the hub (hub-auth.svelte.ts): one that must pair
  // is shown the pairing screen from the first paint, and a paired one the
  // app. Its cookie is SameSite=Lax, so it rides a link from another site
  // too.
  // The board as the first paint draws it (first-paint.ts): the sidebar's
  // Recent and Projects, the bar's Machines and every row the store draws
  // are in the server's HTML and on the first paint, and none of them waits
  // on the socket. All of it or none: a part the hub would not give leaves
  // the store to read it all itself.
  const [
    authRead,
    rowsRead,
    pulsesRead,
    machinesRead,
    projectsRead,
    areasRead,
    storedRead,
  ] = await Promise.all([
    readHub<HubAuthState>(fetch, hubRequest("GET /api/auth")),
    readHub<InstanceRow[]>(fetch, hubRequest("GET /api/instances")),
    readHub<Record<string, SessionPulse>>(fetch, hubRequest("GET /api/pulses")),
    readHub<Machine[]>(fetch, hubRequest("GET /api/agents")),
    readHub<ProjectRow[]>(fetch, hubRequest("GET /api/projects")),
    readHub<{ areas: Area[] }>(fetch, hubRequest("GET /api/areas")),
    readHub<StoredRecent>(fetch, hubRequest("GET /api/stored")),
  ]);
  const auth = authRead.ok ? authRead.value : null;
  const board: ServedBoard | null =
    rowsRead.ok &&
    pulsesRead.ok &&
    machinesRead.ok &&
    projectsRead.ok &&
    areasRead.ok &&
    storedRead.ok
      ? servedBoardOf({
          instances: rowsRead.value,
          pulses: pulsesRead.value,
          machines: machinesRead.value,
          projects: projectsRead.value,
          areas: areasRead.value.areas,
          stored: storedRead.value,
        })
      : null;
  const railKept = Number(pref(RAIL_KEY));
  const railWidth =
    Number.isFinite(railKept) && railKept > 0
      ? Math.min(RAIL_MAX, Math.max(RAIL_MIN, Math.round(railKept)))
      : null;
  /** The sidebar put away on a desk (Shell's Hide sidebar), drawn so from the first paint. */
  const railHidden = pref(RAIL_HIDDEN_KEY) === "1";

  // How the sidebar's lists are grouped, folded, pinned and unfolded, as
  // this browser last sent them (kept.svelte.ts): the first paint groups
  // the board's rows as the page will.
  const kept: Partial<Record<Pref, string>> = {};
  for (const name of Object.values(KEPT)) {
    const value = pref(name);
    if (value !== undefined) {
      kept[name] = value;
    }
  }

  // Each folder tab's box as last measured, so its shape is drawn true from
  // the first paint (fluid-tabs/fold-memory.ts).
  const foldBoxes = parseFoldBoxes(pref(FOLD_BOXES_PREF));

  let workspace = parseWorkspace(pref(WORKSPACE_KEY));
  if (workspace) {
    workspace.ctx = parseContexts(pref(WORKSPACE_CTX_KEY));
  }

  // Untrack URL access: a switch between conversations is a shallow pushState
  // and the client store is authoritative once it has restored. This load exists
  // for the first paint only — re-running it on every navigation would repeat
  // the title fetches for nothing. Mirrors what `workspace.reveal()` does.
  const pathname = untrack(() => url.pathname);
  // The tab the URL names: a conversation, a project, or none.
  const urlTab = tabOfPath(pathname);
  const urlId = urlTab ?? "";
  if (urlId) {
    workspace ??= blankWorkspace();
    const leaves = leavesOf(workspace.root);
    const { focusedLeaf } = workspace;
    const leaf =
      leaves.find((l) => l.tabs.includes(urlId)) ??
      leaves.find((l) => l.id === focusedLeaf) ??
      leaves[0];
    if (!leaf.tabs.includes(urlId)) {
      // Just after the tab in front, else at the end (workspace `place`).
      const at = leaf.active ? leaf.tabs.indexOf(leaf.active) : -1;
      leaf.tabs.splice(at === -1 ? leaf.tabs.length : at + 1, 0, urlId);
    }
    leaf.active = urlId;
    workspace.focusedLeaf = leaf.id;
    const machine = untrack(() => url.searchParams.get("machine"));
    const harness = harnessNamed(
      untrack(() => url.searchParams.get("harness"))
    );
    if (machine && harness && isSessionTab(urlId)) {
      workspace.ctx ??= {};
      workspace.ctx[urlId] ??= {
        machine,
        cwd: untrack(() => url.searchParams.get("cwd")) ?? "",
        harness,
      };
    }
  } else if (pathname === "/session" && workspace) {
    const leaves = leavesOf(workspace.root);
    const { focusedLeaf } = workspace;
    const leaf = leaves.find((l) => l.id === focusedLeaf) ?? leaves[0];
    leaf.active = null;
  }

  // Each open tab's name as the hub gave it, or why the hub could not: a tab
  // whose name read failed says so in the strip until the fleet names it.
  const names: Record<string, HubRead<string>> = {};
  if (!workspace) {
    return {
      railWidth,
      railHidden,
      narrow,
      workspace,
      names,
      resolved: [] as string[],
      foldBoxes,
      auth,
      board,
      kept,
    };
  }

  // Each project's tab named as the hub names the project, so its tab is
  // drawn with its name from the first paint.
  const projectTabs = leavesOf(workspace.root).flatMap((leaf) =>
    leaf.tabs.filter((tab) => !isSessionTab(tab))
  );
  for (const tab of projectTabs) {
    const project = projectsRead.ok
      ? projectsRead.value.find((row) => row.id === projectOfTab(tab))
      : undefined;
    if (project) {
      names[tab] = { ok: true, value: project.name };
    }
  }

  // The conversations open: a project's tab has no name or pulse to read.
  const open = leavesOf(workspace.root).flatMap((leaf) =>
    leaf.tabs.filter(isSessionTab)
  );
  if (open.length === 0) {
    return {
      railWidth,
      railHidden,
      narrow,
      workspace,
      names,
      resolved: [] as string[],
      foldBoxes,
      auth,
      board,
      kept,
    };
  }

  // What the fleet calls these conversations, off the board's rows.
  const listing = rowsRead;
  // The open tabs the hub lists as sessions under their own id: named
  // already (workspace.svelte.ts, Naming the tabs), so the client asks the
  // hub nothing of them, and the pane reading one is never left unwatched
  // mid-read while the ask is out.
  const resolved: string[] = [];
  for (const id of open) {
    if (!listing.ok) {
      names[id] = listing;
      continue;
    }
    const row = listing.value.find((instance) => instance.id === id);
    if (row) {
      resolved.push(id);
    }
    const title = row?.title?.trim();
    if (title) {
      names[id] = { ok: true, value: title };
    }
  }

  // The board is a working set: it drops a session that has not moved in a day.
  // The strip is not — it carries whatever the reader left open, so a tab on an
  // aged-out conversation has no row to read a name off. The name is not
  // missing, only filtered out of the listing, so ask for it by id: one batched
  // call, and only for the tabs the listing answered without naming.
  const unnamed = open.filter((id) => !names[id]);
  if (unnamed.length > 0) {
    const ctx = workspace.ctx ?? {};
    const titles = await readHub<{ id: string; title: string | null }[]>(
      fetch,
      hubRequest("POST /api/instances/titles", {
        body: {
          ids: unnamed.map((id) => ({
            id,
            machine: ctx[id]?.machine ?? undefined,
            cwd: ctx[id]?.cwd,
            harness: ctx[id]?.harness,
          })),
        },
      })
    );
    if (titles.ok) {
      for (const { id, title } of titles.value) {
        if (title?.trim()) {
          names[id] = { ok: true, value: title.trim() };
        }
      }
    } else {
      for (const id of unnamed) {
        names[id] = titles;
      }
    }
  }

  return {
    railWidth,
    railHidden,
    narrow,
    workspace,
    names,
    resolved,
    foldBoxes,
    auth,
    board,
    kept,
  };
};
