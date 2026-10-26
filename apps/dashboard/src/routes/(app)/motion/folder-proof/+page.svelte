<script lang="ts">
  import type { InstanceRow, PulseFrame, SessionPulse } from "@cawco/core";
  import { onMount, untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import WorkTabs from "#lib/cawco/home/WorkTabs.svelte";
  import { workTab } from "#lib/cawco/home/work-tab.svelte.js";
  import PaneTabs from "#lib/cawco/workspace/PaneTabs.svelte";
  import type { LeafNode } from "#lib/cawco/workspace/workspace.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";
  /**
   * Both folder strips on a bench, fed through the client's own state with
   * no hub, over everything the shell draws (its hub banner included):
   *
   * - the session tabs (`data-strip="session"`): the real PaneTabs, six
   *   tabs in mixed statuses (needs you, working, idle, stopped, failed,
   *   idle), the working one chosen; and the same tabs again with the idle
   *   one chosen (`data-strip="session-idle"`);
   * - three sliders over the rims' tokens, written live on the bench:
   *   Taper (`--tab-rim-taper`, px), Subtle (`--tab-rim-mix-subtle`, an
   *   unchosen tab's rim strength) and Thickness (`--tab-rim-width`, the
   *   rim's stroke, px); `?taper=`, `?subtle=` and `?width=` start them;
   * - the home's Working and Finished (`data-strip="work"`): the real
   *   WorkTabs over twelve working sessions and fourteen finished, hosted as
   *   the shell hosts it, in the rail's 228px column on the desk and across
   *   the phone's home page under 900px.
   *
   * In the reader's theme; `?at=` the index of the session tab chosen
   * first (1); `?work=` working | finished. `window.__ft.choose(id)` chooses
   * a session tab and `window.__ft.work.choose(id)` Working or Finished, as
   * a click does; `ids` and `chosen()` on each say the rest.
   *
   * A click on a tab chooses it here, in the bench's own group; the strip's
   * own choice goes to the workspace, which holds no such group and would
   * navigate to the session.
   */
  import { benchClick, benchLeaf } from "../tab-bench";

  const ids = [
    "0f1e2d3c-0000-4000-8000-000000000001",
    "0f1e2d3c-0000-4000-8000-000000000002",
    "0f1e2d3c-0000-4000-8000-000000000003",
    "0f1e2d3c-0000-4000-8000-000000000004",
    "0f1e2d3c-0000-4000-8000-000000000005",
    "0f1e2d3c-0000-4000-8000-000000000006",
  ];
  /** What each session's pulse says: needs you, working, idle, (stopped, failed), idle. */
  const DOING: Record<string, SessionPulse["activity"]> = {
    [ids[0]]: "blocked",
    [ids[1]]: "working",
    [ids[2]]: "idle",
    [ids[5]]: "idle",
  };

  // The client's own state, as the hub's frames would have set it: the
  // sessions' rows and pulses (dev's `__cawcoDebug`, set when
  // client.svelte.ts loads, which PaneTabs imports ahead of this script).
  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        frame: (frame: PulseFrame) => void;
        adoptInstances: (rows: InstanceRow[]) => void;
      };
    }
  ).__cawcoDebug;
  const now = Date.now();
  const pulse = (
    instanceId: string,
    activity: SessionPulse["activity"]
  ): void =>
    debug.frame({
      kind: "pulse",
      instanceId,
      pulse: {
        activity,
        at: now,
        busy: activity === "working",
        currentTool: null,
        instanceId,
        runningSubagents: 0,
      },
    });
  for (const [instanceId, activity] of Object.entries(DOING)) {
    pulse(instanceId, activity);
  }
  /** A bench session's row: `status` as the hub files it, its turn ended `ago` ms back. */
  const rowOf = (
    id: string,
    status: InstanceRow["status"],
    ago: number | null
  ): InstanceRow => ({
    id,
    cwd: "/bench",
    harness: "claude",
    kind: "mainline",
    launchDir: "known",
    machineId: "bench",
    sessionId: null,
    status,
    turnEndedAt: ago === null ? null : now - ago,
    updatedAt: ago === null ? now : now - ago,
  });

  // The home's Working and Finished (WorkTabs), fed the same way: sessions
  // that are working (their pulses say so) and sessions whose turn ended
  // unseen, twelve and fourteen with the strip's own four that ended, so
  // both counts take two figures, the tabs' widest.
  const WORKING = 12;
  const FINISHED = 14;
  const workId = (n: number) =>
    `0f1e2d3c-0000-4000-8000-0000000001${String(n).padStart(2, "0")}`;
  const workRows = Array.from({ length: WORKING + FINISHED - 4 }, (_, n) =>
    rowOf(workId(n), "running", n < WORKING ? null : 120_000 + n * 1000)
  );
  for (const row of workRows.slice(0, WORKING)) {
    pulse(row.id, "working");
  }
  debug.adoptInstances([
    ...ids.map((id, n) => {
      if (n === 3) {
        return rowOf(id, "stopped", 60_000);
      }
      if (n === 4) {
        return rowOf(id, "error", 90_000);
      }
      return rowOf(id, "running", DOING[id] === "working" ? null : 60_000);
    }),
    ...workRows,
  ]);
  const WORK_IDS = ["working", "finished"] as const;
  workTab.set(
    page.url.searchParams.get("work") === "finished" ? "finished" : "working"
  );

  const leaf = $state<LeafNode>(
    untrack(() =>
      benchLeaf("folder-proof", ids, page.url.searchParams.get("at"))
    )
  );
  /** The same tabs with the idle one chosen. */
  const idleLeaf = $state<LeafNode>({
    id: "folder-proof-idle",
    t: "l",
    tabs: ids,
    active: ids[2],
  });

  /**
   * The rims' three tunable tokens, written live on the bench: the taper's
   * length (px), an unchosen tab's rim strength (%) and the rim's stroke
   * (px). Each starts at `?taper=`, `?subtle=` or `?width=` where given,
   * else at the token's value in the bench's theme.
   */
  const asked = (name: string) => {
    const value = untrack(() => page.url.searchParams.get(name));
    return value === null || value === "" ? null : Number(value);
  };
  const subtleAsked = asked("subtle");
  let proofEl = $state<HTMLElement>();
  let taper = $state<number | null>(asked("taper"));
  let subtle = $state<number | null>(subtleAsked);
  let width = $state<number | null>(asked("width"));
  $effect(() => {
    // Again whenever the theme changes.
    if (!(proofEl && scheme)) {
      return;
    }
    // Read once the theme has landed on the root.
    const frame = requestAnimationFrame(() => {
      const style = getComputedStyle(document.documentElement);
      const token = (name: string) =>
        Number.parseFloat(style.getPropertyValue(name));
      taper ??= token("--tab-rim-taper");
      width ??= token("--tab-rim-width");
      // The token is a strength 0 to 1; the slider reads it in percent.
      if (subtleAsked === null) {
        subtle = Math.round(token("--tab-rim-mix-subtle") * 100);
      }
    });
    return () => cancelAnimationFrame(frame);
  });

  /** The drawer layout, where the home is the phone's page, not the rail's. */
  const phone = new MediaQuery("(width < 900px)");

  /** The reader's theme, as the dashboard draws it: the rims' tokens are read again when it changes. */
  const scheme = $derived(theme.resolved);

  /** Chooses a tab in the bench's group, as a click on it does. */
  function choose(id: string) {
    if (leaf.tabs.includes(id)) {
      leaf.active = id;
    }
  }

  let workEl = $state<HTMLElement>();
  /** Chooses Working or Finished as a click on its tab does. */
  function chooseWork(id: string) {
    const at = WORK_IDS.indexOf(id as (typeof WORK_IDS)[number]);
    workEl
      ?.querySelectorAll<HTMLElement>(
        '[data-slot="ff-tab"] > [data-slot="hit"]'
      )
      [at]?.click();
  }

  onMount(() => {
    const bench = {
      ids,
      choose,
      chosen: () => leaf.active,
      work: {
        ids: [...WORK_IDS],
        choose: chooseWork,
        chosen: () => workTab.current,
      },
    };
    Object.assign(window, { __ft: bench });
    return () => {
      Reflect.deleteProperty(window, "__ft");
    };
  });
</script>

<svelte:head><title>Folder tabs proof | CawCo</title></svelte:head>

<!-- Over the shell and anything it draws (a hub banner): the strip on its
     shelf, and the page its chosen tab opens into. -->
<div
  class="fixed inset-0 z-(--layer-bench) flex flex-col bg-surface-recess text-ink-strong"
  data-folder-proof
  bind:this={proofEl}
  style:--tab-rim-mix-subtle={subtle === null
    ? undefined
    : String(subtle / 100)}
  style:--tab-rim-taper={taper === null ? undefined : String(taper)}
  style:--tab-rim-width={width === null ? undefined : String(width)}
>
  <div
    data-slot="group"
    class="@container/leaf flex min-h-0 flex-auto flex-col bg-surface-shelf pt-space-7"
    data-strip="session"
    onclickcapture={benchClick(leaf)}
  >
    <PaneTabs {leaf} />
    <div class="h-space-7 bg-surface-recess"></div>
  </div>
  <div
    data-slot="group"
    class="@container/leaf flex min-h-0 flex-auto flex-col bg-surface-shelf pt-space-7"
    data-strip="session-idle"
    onclickcapture={benchClick(idleLeaf)}
  >
    <PaneTabs leaf={idleLeaf} />
    <div class="h-space-7 bg-surface-recess"></div>
  </div>
  <!-- The rims' tokens, tuned live. The bench's own controls, at the foot,
       clear of every strip. -->
  <div
    class="type-label flex flex-wrap gap-x-space-5 gap-y-space-2 border-t border-t-border-hairline bg-surface-raised px-space-5 py-space-3 text-ink-muted"
  >
    <label class="flex items-center gap-space-2">
      <span>Taper</span>
      <input
        max="32"
        min="0"
        step="1"
        type="range"
        bind:value={
          () => taper ?? 0,
          (v) => {
            taper = v;
          }
        }
      />
      <output class="num min-w-c-bench-readout-w text-ink-strong"
        >{taper ?? "–"}px</output
      >
    </label>
    <label class="flex items-center gap-space-2">
      <span>Subtle</span>
      <input
        max="100"
        min="0"
        step="1"
        type="range"
        bind:value={
          () => subtle ?? 0,
          (v) => {
            subtle = v;
          }
        }
      />
      <output class="num min-w-c-bench-readout-w text-ink-strong"
        >{subtle ?? "–"}%</output
      >
    </label>
    <label class="flex items-center gap-space-2">
      <span>Thickness</span>
      <input
        max="4"
        min="0.5"
        step="0.25"
        type="range"
        bind:value={
          () => width ?? 1.5,
          (v) => {
            width = v;
          }
        }
      />
      <output class="num min-w-c-bench-readout-w text-ink-strong"
        >{width ?? "–"}px</output
      >
    </label>
  </div>
  <!-- The home's Working and Finished as the shell hosts them: in the
       rail's column on the desk, across the phone's home page under a
       finger. -->
  <!-- The rail's column (Shell .rail, Home .rail .groups) on the desk; the
       phone's home page (Home .page .groups) under 900px. Both stand on
       surface-recess. -->
  <div
    class="min-h-0 w-c-sidebar-w flex-auto overflow-hidden bg-surface-recess px-space-2 pt-space-1 pb-space-2 max-desk:w-full max-desk:px-space-5 max-desk:pt-space-2 max-desk:pb-space-7"
    data-strip="work"
    bind:this={workEl}
  >
    <WorkTabs
      onstart={() => undefined}
      stale={false}
      variant={phone.current ? "page" : "rail"}
      waiting={false}
    />
  </div>
</div>
