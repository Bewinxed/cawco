import { harnessNamed } from "@cawco/core/harness/kinds";
import type { HubAuthState } from "@cawco/core/hub-auth";
import { hubRequest } from "@cawco/core/hub-request";
import type { AgentRow, InstanceRow, SessionPulse } from "@cawco/core/protocol";
import { clampRail } from "#lib/cawco/rail.js";
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
  placeTab,
} from "#lib/cawco/workspace/tree.js";
import { parseFoldBoxes } from "#lib/components/ui/fluid-tabs/fold-memory.js";
import { type HubRead, readHub } from "#lib/platform/hub-read.js";
import {
  FOLD_BOXES_PREF,
  NARROW_PREF,
  type Pref,
  prefCookie,
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
 * takes over a frame later (lib/cawco/first-render.svelte.ts).
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

export const load: LayoutServerLoad = async ({
  cookies,
  fetch,
  request,
  url,
  untrack,
  // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: first-paint reconciliation of the workspace cookie against the URL — one pass, not split in this pass
}) => {
  const pref = (name: Pref) => cookies.get(prefCookie(name, url));
  const narrow = narrowOf(pref(NARROW_PREF), request.headers);
  // Who this browser is to the hub (hub-auth.svelte.ts): one that must pair
  // is shown the pairing screen from the first paint, and a paired one the
  // app. Its cookie is SameSite=Lax, so it rides a link from another site
  // too.
  // How many machines the bar's Machines counts (MachinesButton), so its
  // number is in the first paint and the bar does not widen when the
  // socket's list lands; null where the hub would not say.
  const [authRead, machinesRead] = await Promise.all([
    readHub<HubAuthState>(fetch, hubRequest("GET /api/auth")),
    readHub<AgentRow[]>(fetch, hubRequest("GET /api/agents")),
  ]);
  const auth = authRead.ok ? authRead.value : null;
  const machineCount =
    machinesRead.ok && Array.isArray(machinesRead.value)
      ? machinesRead.value.length
      : null;
  const stored = Number(pref(RAIL_PREF));
  const railWidth =
    Number.isFinite(stored) && stored > 0 ? clampRail(stored) : null;

  // Each folder tab's box as last measured, so its shape is drawn true from
  // the first paint (fluid-tabs/fold-memory.ts).
  const foldBoxes = parseFoldBoxes(pref(FOLD_BOXES_PREF));

  let workspace = parseWorkspace(pref(WORKSPACE_PREF));
  if (workspace) {
    workspace.ctx = parseContexts(pref(WORKSPACE_CTX_PREF));
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
    placeTab(leaf, urlId);
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
  /** Each open tab's pulse as the hub held it for this request. */
  const pulses: Record<string, SessionPulse> = {};
  if (!workspace) {
    return {
      railWidth,
      narrow,
      workspace,
      names,
      resolved: [] as string[],
      pulses,
      foldBoxes,
      auth,
      machineCount,
    };
  }

  // Each project's tab named as the hub names the project, so its tab is
  // drawn with its name from the first paint.
  const projectTabs = leavesOf(workspace.root).flatMap((leaf) =>
    leaf.tabs.filter((tab) => !isSessionTab(tab))
  );
  if (projectTabs.length > 0) {
    const projects = await readHub<{ id: string; name: string }[]>(
      fetch,
      hubRequest("GET /api/projects")
    );
    for (const tab of projectTabs) {
      const project = projects.ok
        ? projects.value.find((row) => row.id === projectOfTab(tab))
        : undefined;
      if (project) {
        names[tab] = { ok: true, value: project.name };
      }
    }
  }

  // The conversations open: a project's tab has no name or pulse to read.
  const open = leavesOf(workspace.root).flatMap((leaf) =>
    leaf.tabs.filter(isSessionTab)
  );
  if (open.length === 0) {
    return {
      railWidth,
      narrow,
      workspace,
      names,
      resolved: [] as string[],
      pulses,
      foldBoxes,
      auth,
      machineCount,
    };
  }

  // What the fleet calls these conversations, and what each is doing as the
  // hub's pulses say: the store draws these until the socket's first frame
  // (client.svelte.ts `pulseOf`), so a working tab is drawn working from the
  // first paint. A read that fails leaves the socket to say it, as before.
  const [listing, pulseRead] = await Promise.all([
    readHub<InstanceRow[]>(fetch, hubRequest("GET /api/instances")),
    readHub<Record<string, SessionPulse>>(fetch, hubRequest("GET /api/pulses")),
  ]);
  if (pulseRead.ok) {
    for (const id of open) {
      const pulse = pulseRead.value[id];
      if (pulse) {
        pulses[id] = pulse;
      }
    }
  }
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
    narrow,
    workspace,
    names,
    resolved,
    pulses,
    foldBoxes,
    auth,
    machineCount,
  };
};
