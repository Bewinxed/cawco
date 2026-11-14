import { harnessNamed } from "@cawco/core/harness/kinds";
import type { InstanceRow, SessionPulse } from "@cawco/core/protocol";
import { servedBoardOf } from "#lib/cawco/first-paint.js";
import { askOpens, landingOf, type Wait } from "#lib/cawco/landing.js";
import type { ProjectRow } from "#lib/cawco/projects.js";
import type { ServedBoard } from "#lib/cawco/served-board.js";

import { routedToParent } from "#lib/cawco/transcript/present.js";
import {
  isSessionTab,
  projectOfTab,
  tabOfPath,
} from "#lib/cawco/workspace/tabs.js";
import {
  blankWorkspace,
  fillGroupsIn,
  focusedIn,
  landIn,
  leavesOf,
  parseContexts,
  parseWorkspace,
  placeIn,
  showIn,
  type WorkspaceV1,
} from "#lib/cawco/workspace/tree.js";
import { parseFoldBoxes } from "#lib/components/ui/fluid-tabs/fold-memory.js";
import { hubThrough } from "#lib/platform/hub.js";
import { type HubRead, hubRead } from "#lib/platform/hub-read.js";
import {
  clampRail,
  FOLD_BOXES_PREF,
  KEPT,
  NARROW_PREF,
  type Pref,
  prefCookie,
  RAIL_HIDDEN_PREF,
  RAIL_PREF,
  WORKSPACE_CTX_PREF,
  WORKSPACE_PREF,
} from "#lib/platform/prefs.js";
import type { LayoutServerLoad } from "./$types";

/**
 * Whether this browser is a phone, for the session surface's first paint.
 * The deck-or-grid decision is a media query on the client, which the server
 * cannot run, so SSR drew the grid and the phone flipped to the deck once the
 * bundle ran. The client keeps the query's answer in this cookie; on the very
 * first visit, before any cookie, the client hints and the user agent stand
 * in. The cookie is primary because an iPad in desktop mode reports a
 * Macintosh UA. The first client render draws this answer too, and the query
 * takes over a frame later (lib/platform/first-render.svelte.ts).
 */
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

/**
 * What waits on the reader and what is moving, as a wide screen's landing
 * reads them (landing.ts): the asks the hub holds that are the reader's to
 * answer (as the store's `blocked` lists them, an ask routed to its
 * parent's agent left out), the artifacts waiting on them that are not put
 * away (the store's `artifactNeedsOpen`), and the moves just cancelled.
 * Null when the hub would not give one of them: the page lands by itself.
 */
async function readWaits(
  fetch: typeof globalThis.fetch
): Promise<{ waits: Wait[]; cancelled: Set<string> } | null> {
  const hub = hubThrough(fetch);
  const [pending, artifacts, moves] = await Promise.all([
    hubRead(hub.api.pending.get()),
    hubRead(hub.api["artifact-needs"].get()),
    hubRead(hub.api.moves.get()),
  ]);
  if (!(pending.ok && artifacts.ok && moves.ok)) {
    return null;
  }
  const waits: Wait[] = [];
  for (const { payload } of pending.value) {
    if (payload.kind === "permission_request" && !routedToParent(payload)) {
      waits.push({ opens: askOpens(payload), raisedAt: payload.raisedAt });
    }
  }
  for (const need of artifacts.value.needs) {
    if (!need.parked) {
      waits.push({ opens: need.instanceId, raisedAt: need.raisedAt });
    }
  }
  const cancelled = new Set(
    moves.value
      .filter((job) => job.stage === "cancelled")
      .map((job) => job.targetInstanceId)
  );
  return { waits, cancelled };
}

/**
 * A wide screen never shows an empty detail if anything can be opened
 * (SessionSurface): every group holding tabs shows one, and with nothing in
 * front of the focused group it lands on the longest wait, else the latest
 * work (landing.ts). Done here as the page would do it once restored, so
 * the first paint draws the strip, the pane and its transcript where they
 * stay. The tabs it put in front, which the page counts as its own picks,
 * not the reader's (SessionSurface `picked`).
 */
function landOnDesk(
  tree: WorkspaceV1,
  read: {
    rows: InstanceRow[];
    pulses: Record<string, SessionPulse>;
    waits: Wait[];
    cancelled: Set<string>;
  }
): string[] {
  const landed = fillGroupsIn(tree);
  if (focusedIn(tree).active !== null) {
    return landed;
  }
  const listed = new Set(read.rows.map((row) => row.id));
  const landing = landingOf({
    waits: read.waits,
    rows: read.rows,
    pulseAt: (id) => read.pulses[id]?.at,
    listed: (id) => listed.has(id),
    cancelled: read.cancelled,
  });
  if (landing) {
    landIn(tree, landing);
    landed.push(landing);
  }
  return landed;
}

export const load: LayoutServerLoad = async ({
  cookies,
  fetch,
  isDataRequest,
  request,
  url,
  untrack,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: first-paint reconciliation of the workspace cookie against the URL — one pass, not split in this pass
}) => {
  const pref = (name: Pref) => cookies.get(prefCookie(name, url));
  const narrow = narrowOf(pref(NARROW_PREF), request.headers);
  // Untrack URL access: a switch between conversations is a shallow pushState
  // and the client store is authoritative once it has restored. This load exists
  // for the first paint only — re-running it on every navigation would repeat
  // the title fetches for nothing. Mirrors what `workspace.reveal()` does.
  const pathname = untrack(() => url.pathname);
  // A desk opening the board's address, as a page load: the first paint
  // lands where the page would (`landOnDesk`), read alongside the board.
  const lands = pathname === "/session" && !narrow && !isDataRequest;
  // Who this browser is to the hub (hub-auth.svelte.ts): one that must pair
  // is shown the pairing screen from the first paint, and a paired one the
  // app. Its cookie is SameSite=Lax, so it rides a link from another site
  // too.
  // The board as the first paint draws it (first-paint.ts): the sidebar's
  // Recent and Projects, the bar's Machines and every row the store draws
  // are in the server's HTML and on the first paint, and none of them waits
  // on the socket. All of it or none: a part the hub would not give leaves
  // the store to read it all itself.
  const hub = hubThrough(fetch);
  const [
    authRead,
    rowsRead,
    pulsesRead,
    machinesRead,
    projectsRead,
    areasRead,
    storedRead,
    waitsRead,
  ] = await Promise.all([
    hubRead(hub.api.auth.get()),
    hubRead(hub.api.instances.get()),
    hubRead(hub.api.pulses.get()),
    hubRead(hub.api.agents.get()),
    hubRead(hub.api.projects.get()),
    hubRead(hub.api.areas.get()),
    hubRead(hub.api.stored.get()),
    lands ? readWaits(fetch) : null,
  ]);
  const auth = authRead.ok ? authRead.value : null;
  const board: ServedBoard<ProjectRow> | null =
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
  const railKept = Number(pref(RAIL_PREF));
  const railWidth =
    Number.isFinite(railKept) && railKept > 0 ? clampRail(railKept) : null;
  /** The sidebar put away on a desk (Shell's Hide sidebar), drawn so from the first paint. */
  const railHidden = pref(RAIL_HIDDEN_PREF) === "1";

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

  let workspace = parseWorkspace(pref(WORKSPACE_PREF));
  if (workspace) {
    workspace.ctx = parseContexts(pref(WORKSPACE_CTX_PREF));
  }

  // The tab the URL names: a conversation, a project, or none.
  const urlTab = tabOfPath(pathname);
  const urlId = urlTab ?? "";
  if (urlId) {
    workspace ??= blankWorkspace();
    const leaf =
      leavesOf(workspace.root).find((l) => l.tabs.includes(urlId)) ??
      focusedIn(workspace);
    placeIn(leaf, urlId);
    showIn(leaf, urlId);
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
    // The board's address: nothing in front of the focused group.
    const leaf = focusedIn(workspace);
    showIn(leaf, null);
    workspace.focusedLeaf = leaf.id;
  }
  let landed: string[] = [];
  if (lands && board && waitsRead) {
    workspace ??= blankWorkspace();
    landed = landOnDesk(workspace, {
      rows: rowsRead.ok ? rowsRead.value : [],
      pulses: pulsesRead.ok ? pulsesRead.value : {},
      ...waitsRead,
    });
  }

  // Each open tab's name as the hub gave it, or why the hub could not: a tab
  // whose name read failed says so in the strip until the fleet names it.
  const names: Record<string, HubRead<string>> = {};
  const unresolved: string[] = [];
  if (!workspace) {
    return {
      railWidth,
      railHidden,
      narrow,
      workspace,
      names,
      resolved: unresolved,
      foldBoxes,
      auth,
      board,
      kept,
      landed,
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
      resolved: unresolved,
      foldBoxes,
      auth,
      board,
      kept,
      landed,
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
    const titles = await hubRead(
      hub.api.instances.titles.post({
        ids: unnamed.map((id) => ({
          id,
          machine: ctx[id]?.machine ?? undefined,
          cwd: ctx[id]?.cwd,
          harness: ctx[id]?.harness,
        })),
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
    landed,
  };
};
