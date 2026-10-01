<script lang="ts">
  import { machineLabel } from "@whiffle/core";
  /**
   * Fleet sidebar — reimplemented on top of the shadcn-svelte sidebar primitives
   * (ui/sidebar/*), following the Fluid Functionalism inset preset pattern:
   *
   *   • Header: brand tile + workspace name, search input, "+ New" row
   *   • Content: Fleet nav group, Machines group, Projects (collapsible groups
   *     with sub-items for sessions), Running-now and Not-running sections
   *   • Footer: user avatar + machine count
   *
   * The rail is now built from SidebarGroup / SidebarMenu / SidebarMenuButton /
   * SidebarMenuSub / SidebarMenuSubButton rather than hand-rolled CSS, inheriting
   * built-in hover, active, focus, and spacing from the component library.
   *
   * Sessions use ActivityDot (status dots) rather than text pills — far more
   * space-efficient and less noisy.
   */
  import type { Attachment } from "svelte/attachments";
  import { SvelteSet } from "svelte/reactivity";
  import { TextMorph } from "torph/svelte";
  import { page } from "$app/state";
  import WorkflowRail from "$lib/components/features/workflows/WorkflowRail.svelte";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  import { highlight } from "$lib/components/ui/highlight/highlight.svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Sidebar from "$lib/components/ui/sidebar";
  import { Skeleton } from "$lib/components/ui/skeleton";
  import ThemeSwitcher from "$lib/components/ui/ThemeSwitcher.svelte";
  import Tip from "$lib/components/ui/tooltip/tip.svelte";
  import {
    IconAssistant,
    IconBox,
    IconPlus,
    IconSettings,
    IconSort,
    IconWorkflow,
  } from "$lib/icons";
  import { formatAgeShort, formatDistanceToNow } from "$lib/utils/time";
  import ActivityDot from "./ActivityDot.svelte";
  import type { Activity } from "./activity";
  import {
    type InstanceRow,
    isFailed,
    isResumable,
    isStale,
    type ProjectRow,
    whiffle,
  } from "./client.svelte";
  import { LAST_KEY as CONFIG_LAST_KEY, SECTIONS } from "./config/sections";
  import { continuing } from "./continue.svelte";
  import FolderMenu from "./FolderMenu.svelte";
  import { folderPrefs } from "./folder-prefs.svelte";
  import Home from "./home/Home.svelte";
  import HomeRecent from "./home/HomeRecent.svelte";
  import { conversationHref } from "./links";
  import { markHue, sessionSprite } from "./mark";
  import { CURVE, dur } from "./motion/curves.svelte";
  import { heldOrder, holdWhileInside } from "./motion/held-order.svelte";
  import { reflow } from "./motion/rows.svelte";
  import NewProjectPopover from "./NewProjectPopover.svelte";
  import { nestFrom, nestPlace } from "./nest";
  import ProjectMark from "./ProjectMark.svelte";
  import { type RailSort, rail } from "./rail.svelte";
  import NewSessionDialog from "./spawn/NewSessionDialog.svelte";
  import { tree } from "./tree";
  import UsageMeter from "./UsageMeter.svelte";
  import { workflowState } from "./workflow-state.svelte";
  import { workspace } from "./workspace/workspace.svelte";

  let {
    onassistant,
    assistantOpen,
    narrow,
  }: {
    /** Toggles the assistant, which Shell owns so ⌘J and this row share it. */
    onassistant: () => void;
    assistantOpen: boolean;
    /** The Shell's live narrow answer: a phone opens Configure on its list. */
    narrow: boolean;
  } = $props();

  const path = $derived(page.url.pathname);
  /**
   * On a phone Configure opens on its section list, every time. A wide
   * screen opens the section last visited, re-read on every navigation so
   * leaving one section for the board and coming back returns to it.
   */
  const configureHref = $derived.by(() => {
    if (narrow) {
      return "/config";
    }
    let last: string | null = null;
    if (path.startsWith("/config/")) {
      [, , last] = path.split("/");
    } else if (typeof localStorage !== "undefined") {
      last = localStorage.getItem(CONFIG_LAST_KEY);
    }
    return `/config/${SECTIONS.some((section) => section.slug === last) ? last : "rules"}`;
  });
  const configuring = $derived(path.startsWith("/config"));
  /**
   * Which conversation is in front, for the rows to mark. The workspace
   * store, not the URL: a tab switch writes the address with `pushState`,
   * which moves nothing the page reads, so a rail keyed to the path stayed
   * on the tab the reader had left.
   */
  const activeSession = $derived(
    path.startsWith("/session") ? workspace.activeSessionId : null
  );

  /**
   * The rail's steps, named once. Every size here comes from app.css's scale
   * (`--text-body` 15px for the nav step, `--text-label` 13.5px for list rows,
   * `--text-label` 12.5px for section labels) rather than Tailwind's own, which
   * runs a step and a half smaller at every level and is how a rail of `text-meta`
   * rows ends up unreadable.
   *
   * Heights are the same two the rail always had: the nav band is tall because
   * six destinations can afford to be, and a LIST row is 30px because a rail of
   * 40px rows is a rail that fits eight things.
   */
  const NAV_ROW = "h-[var(--c-nav-h)] gap-2.5 px-2.5 text-body";
  const LIST_ROW = "h-[30px] gap-2.5 px-2.5 py-0";
  const SUB_ROW = "h-[28px] gap-2.5 px-2.5";
  /** The height the loading rows stand at: a list row's. */
  const LIST_ROW_H = "h-[30px]";
  /** `Sidebar.Group`'s own `p-2` plus `Sidebar.Content`'s `gap-2` stacked to
   *  24px of nothing between every section; the label already separates them. */
  const GROUP = "px-2 py-1";

  /**
   * How far the fleet's first read has come: 1 workflow runs, 2 machines and
   * sessions, 3 every online machine's stored sessions (or the hub is known
   * to be unreachable). It only climbs: a machine coming online later is a
   * live change, not part of the first read.
   */
  let stage = $state(0);
  $effect(() => {
    let next = 0;
    if (whiffle.hub === "unreachable") {
      next = 3;
    } else if (workflowState.loaded) {
      next = 1;
      if (whiffle.fleetRead) {
        next = whiffle.catalogsRead ? 3 : 2;
      }
    }
    if (next > stage) {
      stage = next;
    }
  });
  const GROUP_LABEL = "px-2.5";
  /** A label carrying a control (the sort, the delegates toggle): on a coarse
   *  pointer it takes a 44px row, so the control's touch area stays inside
   *  it, clear of the session row below. */
  const CONTROL_LABEL = "pr-1 pointer-coarse:h-11";
  /** 2px, not 4: these are rows of one list, not six unrelated buttons. */
  const MENU = "gap-0.5";
  /**
   * Every row in the rail shares one hover ghost that glides from row to row
   * across the groups; the nav and each session list carry their own
   * selection pill under it (components/ui/highlight).
   */
  /** Every clickable row in the rail: menu rows, session rows, "Show N more". */
  const ROWS = "[data-rail-row]";
  const PILL = { rows: ROWS, selected: '[data-active="true"]', ghost: false };
  /**
   * The lead column, 18px, on EVERY row in the rail — nav, machines, projects,
   * sessions, the brand tile and the footer avatar alike. What sits in it
   * varies; the column does not, which is the only reason every label in the
   * rail starts at the same x (10px of row padding + 18 + 10 of gap = 38px).
   */
  const SLOT = "inline-flex size-[18px] shrink-0 items-center justify-center";
  /** A line glyph in the slot: 16px, 1px of air. */
  const SLOT_GLYPH = "size-4";
  /** An identity chip fills the slot, and carries a 12px glyph — 3px of
   *  inset, which is the difference between a mark and a glyph in a box. */
  const MARK = `${SLOT} rounded-[var(--radius-xs)]`;
  const MARK_GLYPH = "size-3";
  /** The trailing column: one 16px box, so a 6px dot, an 8px dot and a 16px
   *  warning triangle all hang off the same right edge. */
  const TRAIL = "flex size-4 shrink-0 items-center justify-center";

  /* ---- spawn ---------------------------------------------------------- */

  let spawnOpen = $state(false);
  let spawnPrefill = $state<
    { machineId?: string; cwd?: string; projectId?: string } | undefined
  >(undefined);

  function newSession(prefill?: {
    machineId?: string;
    cwd?: string;
    projectId?: string;
  }) {
    spawnPrefill = prefill;
    spawnOpen = true;
  }

  /* ---- projects ------------------------------------------------------- */

  /** Which folders are shut is the reader's, kept in folder-prefs, so a reload keeps it. */
  function toggle(project: ProjectRow) {
    folderPrefs.setCollapsed(project.cwd, !folderPrefs.collapsed(project.cwd));
  }

  function collapseOthers(id: string) {
    for (const project of orderedProjects) {
      folderPrefs.setCollapsed(project.cwd, project.id !== id);
    }
  }

  const inProject = (row: InstanceRow, project: ProjectRow): boolean =>
    row.projectId === project.id ||
    (row.machineId === project.machineId &&
      !!row.cwd &&
      (row.cwd === project.cwd || row.cwd.startsWith(`${project.cwd}/`)));

  const running = $derived(whiffle.runningInstances);

  const orderedProjects = $derived.by(() =>
    [...whiffle.projects].sort((a, b) => {
      const pa = rail.isPinned(a.id) ? 0 : 1;
      const pb = rail.isPinned(b.id) ? 0 : 1;
      if (pa !== pb) {
        return pa - pb;
      }
      return a.name.localeCompare(b.name);
    })
  );

  /**
   * Every session list in the rail passes through here. A delegate is work the
   * reader handed off — six of them under one session is six rows about one
   * thing — so unless they asked for them (the Delegates checkbox in the
   * Projects label), the rail lists only sessions nobody delegated. Every list
   * and not just the running one: "Not running" is where delegates pile up by
   * the hundred, and a filter that left it alone would not be a filter.
   */
  const shown = (rows: InstanceRow[]): InstanceRow[] =>
    rows.filter(
      (row) => !row.workflowRunId && (rail.delegates || !row.parentInstanceId)
    );

  const sessionsOf = (project: ProjectRow): InstanceRow[] =>
    shown(running.filter((row) => inProject(row, project)));

  /* ---- recent and older ------------------------------------------------
   * A project lists what is recent — running, waiting on you, or moved in
   * the last day — and folds the rest under one "N older" row. Opened, the
   * older ones scroll in a box six rows tall, so they never push the
   * projects under them down the rail.
   */
  const DAY_MS = 24 * 60 * 60 * 1000;
  function splitOf(project: ProjectRow): {
    recent: InstanceRow[];
    older: InstanceRow[];
  } {
    const live = sessionsOf(project);
    const liveIds = new Set(live.map((row) => row.id));
    const resting = notRunning.filter(
      (row) => inProject(row, project) && !liveIds.has(row.id)
    );
    const recent = [...live];
    const older: InstanceRow[] = [];
    for (const row of resting) {
      if (
        whiffle.activityOf(row.id) === "blocked" ||
        now - lastAt(row) < DAY_MS
      ) {
        recent.push(row);
      } else {
        older.push(row);
      }
    }
    return { recent, older };
  }

  /** Projects whose older list is open; in memory, so a reload shuts them. */
  const olderOpen = new SvelteSet<string>();
  function toggleOlder(id: string) {
    if (olderOpen.has(id)) {
      olderOpen.delete(id);
    } else {
      olderOpen.add(id);
    }
  }
  /** Open by hand, or because the conversation in front is one of them. */
  const olderShown = (project: ProjectRow, older: InstanceRow[]): boolean =>
    olderOpen.has(project.id) ||
    (activeSession !== null && older.some((row) => row.id === activeSession));

  // The conversation in front stays in view inside its older box.
  $effect(() => {
    const id = activeSession;
    if (!id) {
      return;
    }
    requestAnimationFrame(() => {
      document
        .querySelector(`.older [data-session-row="${CSS.escape(id)}"]`)
        ?.scrollIntoView({ block: "nearest" });
    });
  });

  /** Marks which edges of a scroll box have more past them, for the fade. */
  const scrollEdges: Attachment<HTMLElement> = (node) => {
    const mark = () => {
      node.toggleAttribute("data-more-above", node.scrollTop > 0);
      node.toggleAttribute(
        "data-more-below",
        node.scrollTop + node.clientHeight < node.scrollHeight - 1
      );
    };
    mark();
    const sizes = new ResizeObserver(mark);
    sizes.observe(node);
    node.addEventListener("scroll", mark, { passive: true });
    return () => {
      sizes.disconnect();
      node.removeEventListener("scroll", mark);
    };
  };

  /** What a project says when nothing in it runs: how much of it is resumable. */
  const notRunning = $derived(
    shown(
      whiffle.listedInstances.filter(
        (row) => isResumable(row) || isStale(row) || isFailed(row)
      )
    )
  );

  /* ---- order -----------------------------------------------------------
   *
   * The rail could not answer "which one was I just in": every list was
   * alphabetical-by-project then arbitrary, and no row carried a time. Both
   * are fixed here — one `lastAt` per session, one comparator over it, and a
   * sort the reader picks once and the rail remembers.
   */

  /**
   * When a session last moved. The daemon's pulse is the freshest signal a
   * rail has (it is broadcast for every session, subscribed or not); a row
   * with no pulse yet falls back to the hub's own `updatedAt`, and one with
   * neither sorts to the bottom rather than pretending to be new.
   */
  function lastAt(row: InstanceRow): number {
    const pulse = whiffle.pulseAt(row.id);
    if (pulse !== undefined) {
      return pulse;
    }
    const moved = row.updatedAt;
    if (moved === null || moved === undefined) {
      return 0;
    }
    const at = new Date(moved).getTime();
    return Number.isNaN(at) ? 0 : at;
  }

  const SORT_LABEL: Record<RailSort, string> = {
    recent: "Last activity",
    name: "Name",
    state: "State",
  };

  /** Blocked before working before idle — the triage order, for `state`. */
  const STATE_ORDER: Record<Activity, number> = {
    blocked: 0,
    working: 1,
    idle: 2,
  };

  /**
   * One comparator for every session list in the rail, so "Running now" and a
   * project's sub-list and "Not running" never disagree about what first means.
   * Recency is the tiebreak under `name` and `state` alike: two idle sessions
   * in one project are still told apart by which one you touched last.
   */
  function ordered(rows: InstanceRow[], key: string): InstanceRow[] {
    // Held (motion/held-order): activity never moves a row, and a settled
    // re-sort lands only while the pointer is away from the rail's lists.
    return heldOrder(key, sorted(rows), (row) => row.id);
  }

  function sorted(rows: InstanceRow[]): InstanceRow[] {
    const by = rail.sort;
    return [...rows].sort((a, b) => {
      if (by === "name") {
        const cmp = sessionName(a).localeCompare(sessionName(b));
        if (cmp !== 0) {
          return cmp;
        }
      }
      if (by === "state") {
        const cmp =
          STATE_ORDER[whiffle.activityOf(a.id)] -
          STATE_ORDER[whiffle.activityOf(b.id)];
        if (cmp !== 0) {
          return cmp;
        }
      }
      return lastAt(b) - lastAt(a);
    });
  }

  /**
   * A session and how deep to indent it. A delegate names its parent
   * (`parentInstanceId`), and the rail was drawing every one of them at the
   * root — a project with one session and six delegates read as seven peers,
   * which is exactly backwards about what is running.
   */
  interface Nested {
    depth: number;
    row: InstanceRow;
  }

  /** Past this the indent eats the name; the tree keeps nesting, the offset stops. */
  const MAX_INDENT = 3;

  /**
   * `rows` in tree order (tree.ts), siblings sorted by the reader's
   * {@link ordered}.
   */
  function nested(rows: InstanceRow[], key: string): Nested[] {
    return tree(rows, (list, under) => ordered(list, `${key}:${under}`)).map(
      (line) => ({ row: line.row, depth: Math.min(line.depth, MAX_INDENT) })
    );
  }

  /** The row's own left inset — `px-2.5` plus one 13px step per generation. */
  const indent = (depth: number): string =>
    depth === 0 ? "" : `padding-left: calc(0.625rem + ${depth * 13}px)`;

  /**
   * One clock for every row in the rail. A row that ticked for itself would
   * put a timer per session on a list of two hundred, and they all read the
   * same minute. Same rule as LiveSessionRow's module clock.
   */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 30_000);
    return () => clearInterval(timer);
  });

  /** The age column, and the full sentence behind it on hover. */
  const ageOf = (row: InstanceRow): string => {
    const at = lastAt(row);
    return at === 0 ? "" : formatAgeShort(at, now);
  };
  const ageHint = (row: InstanceRow): string => {
    const at = lastAt(row);
    return at === 0
      ? "No activity recorded"
      : `Last activity ${formatDistanceToNow(new Date(at))}`;
  };

  /* ---- helpers -------------------------------------------------------- */

  const sessionName = (row: InstanceRow): string =>
    row.title?.trim() ||
    row.cwd.split("/").filter(Boolean).pop() ||
    row.id.slice(0, 8);

  const fleetCount = $derived(
    whiffle.blockedCount || whiffle.runningInstances.length
  );

  /** TextMorph's length, read from the token once the stylesheet is there. */
  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });
</script>

{#snippet pending(rows: number, height: string)}
  <!-- Rows where the next groups will stand, while their read is out, at the
       height of the rows that replace them. Each stage has its own, gone when
       that stage's groups arrive, so nothing drawn is ever pushed down. -->
  <Sidebar.Group aria-busy="true" aria-label="Loading" class={GROUP} data-flip>
    <div class="flex h-8 items-center {GROUP_LABEL}">
      <Skeleton class="h-3 w-20" />
    </div>
    <div class="flex flex-col gap-0.5">
      {#each Array.from({ length: rows }, (_, row) => row) as row (row)}
        <Skeleton class="{height} w-full" />
      {/each}
    </div>
  </Sidebar.Group>
{/snippet}

<!-- The sidebar primitives (Header, Content, Footer) expect a flex-column
     parent — the old `.rail` class provided this; now it's an explicit wrapper
     since the Shell's own `<aside>` doesn't set the direction. -->
<!-- When a session last moved, in the ~28px a rail can spare. Every session
     row in the rail renders this, so "which one was I just in" is answered by
     looking down one column instead of opening six of them. -->

{#snippet subRow(row: InstanceRow, depth: number, place: string)}
  {@const Sprite = sessionSprite(row.id)}
  {@const activity = whiffle.activityOf(row.id)}
  <li
    class="group/menu-sub-item relative"
    data-flip
    data-session-row={row.id}
    data-sidebar="menu-sub-item"
    data-slot="sidebar-menu-sub-item"
    style={place}
  >
    <span aria-hidden="true" class="kit-nest-tip"></span>
    <Sidebar.MenuSubButton
      class={SUB_ROW}
      data-share="session:{row.id}"
      href={conversationHref(row.id, whiffle.instanceIndex)}
      isActive={activeSession === row.id}
      style={indent(depth)}
    >
      <span
        class={MARK}
        style="background-image: var(--mark-overlay); background-color: var(--mark-{markHue(row.cwd || row.machineId)});"
      >
        <Sprite
          aria-hidden="true"
          class={MARK_GLYPH}
          style="color: var(--mark-glyph);"
        />
      </span>
      <span class="min-w-0 flex-1 truncate">{sessionName(row)}</span>
      {@render age(row)}
      <span class={TRAIL}><ActivityDot {activity} /></span>
    </Sidebar.MenuSubButton>
  </li>
{/snippet}

{#snippet age(row: InstanceRow)}
  {@const label = ageOf(row)}
  {#if label}
    <span
      class="num shrink-0 text-meta text-muted-foreground"
      title={ageHint(row)}
      >{label}</span
    >
  {/if}
{/snippet}

<div
  class="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
  {@attach highlight({ rows: ROWS })}
>
  <!-- ────────────────────── header ──────────────────────── -->

  <Sidebar.Header>
    <!-- The wordmark, and in the header's corner the two things started from
         anywhere: a session (⇧⌘N) and the assistant (⌘J). Jump lives on the
         tab row (Shell), beside the conversations it jumps between. -->
    <div class="flex items-center gap-1">
      <Sidebar.Menu aria-label="Workspace" class="min-w-0 flex-1">
        <Sidebar.MenuItem>
          <Sidebar.MenuButton class={NAV_ROW} isActive={false}>
            {#snippet child({ props })}
              <a href="/session" {...props} class="{props.class} no-underline">
                <span
                  aria-hidden="true"
                  class="{SLOT} rounded-[var(--radius-xs)]"
                  style="background: var(--brand-solid); color: var(--on-brand);"
                >
                  <svg
                    aria-hidden="true"
                    class={MARK_GLYPH}
                    fill="none"
                    stroke="currentColor"
                    stroke-width="1.7"
                    viewBox="0 0 24 24"
                  >
                    <path d="M4 4h16v16H4z" />
                    <path d="M4 4h8v16H4z" fill="currentColor" />
                  </svg>
                </span>
                <span
                  class="min-w-0 truncate text-[length:var(--text-body)] font-medium text-foreground"
                  >Whiffle</span
                >
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
      <Tip keys="⌘J" label="Assistant">
        {#snippet children(tip)}
          <button
            {...tip}
            aria-expanded={assistantOpen}
            aria-label="Assistant"
            class="head-action focus-inset touch-hit"
            data-assistant-row
            data-on={assistantOpen || undefined}
            onclick={onassistant}
            type="button"
          >
            <IconAssistant class="text-[var(--coral-11)]" />
          </button>
        {/snippet}
      </Tip>
      <Tip keys="⇧⌘N" label="Start session">
        {#snippet children(tip)}
          <button
            {...tip}
            aria-label="Start session"
            class="head-action focus-inset touch-hit"
            onclick={() => newSession()}
            type="button"
          >
            <IconPlus />
          </button>
        {/snippet}
      </Tip>
    </div>
  </Sidebar.Header>

  <!-- ────────────────────── content ──────────────────────── -->

  <!-- Live data comes and goes here all day: a machine re-registering, a
       session starting, a count moving. Every group, row, count and status
       mark is `data-flip`, so it arrives and leaves in place and what it moves
       slides instead of jumping (motion/rows `reflow`). -->
  <Sidebar.Content class="gap-0 py-1" {@attach reflow()}>
    <!-- On a wide screen the home is the sidebar: what needs you, what is
         working, what finished, and the rest, while the transcripts take the
         screen. On the narrow line the home is the session surface's own
         page instead, and the rail is only navigation. -->
    <!-- The app's places, first: one compact block, no heading over it. -->
    <Sidebar.Group class={GROUP}>
      <Sidebar.Menu aria-label="Places" class={MENU} {@attach highlight(PILL)}>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={path.startsWith('/session')}
          >
            {#snippet child({ props })}
              <a href="/session" {...props}>
                <span class={SLOT}><IconBox class={SLOT_GLYPH} /></span>
                <span>Fleet</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
          {#if fleetCount}
            <Sidebar.MenuBadge
              class={whiffle.blockedCount > 0
              ? 'bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]'
              : 'bg-[var(--status-live-bg)] text-[var(--status-live-ink)]'}
              data-flip="pop box"
            >
              <TextMorph
                as="span"
                duration={morphMs}
                ease={CURVE.out}
                text={String(fleetCount)}
              />
            </Sidebar.MenuBadge>
          {/if}
        </Sidebar.MenuItem>

        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={path.startsWith('/workflows')}
          >
            {#snippet child({ props })}
              <a href="/workflows" {...props}
                ><span class={SLOT}><IconWorkflow class={SLOT_GLYPH} /></span
                ><span>Workflows</span></a
              >
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Group>
    {#if !narrow}
      <Home active variant="rail" />
    {/if}

    <!-- The groups built from the fleet come in together, once every read
         they need is in (`stage` 3): Projects straight under the home, then
         the workflow runs. Arriving each on its own, a later group pushed
         the ones before it down; arriving together, nothing drawn moves.
         Until then, rows standing where they will be. -->
    {#if stage >= 3}
      <!-- Projects -->
      <Sidebar.Group class={GROUP} data-flip>
        <Sidebar.GroupLabel class="{GROUP_LABEL} {CONTROL_LABEL}">
          <span>Projects</span>
          <!-- The sort lives here rather than once per list because it governs all
           of them at once: a rail whose projects were ordered by recency and
           whose "Not running" was ordered by name would be two rails. -->
          <div class="-mr-1 ml-auto flex items-center gap-0.5">
            <DropdownMenu.Root>
              <DropdownMenu.Trigger>
                {#snippet child({ props })}
                  <Button
                    {...props}
                    aria-label="Sort sessions — currently {SORT_LABEL[rail.sort]}"
                    size="icon-sm"
                    title="Sort sessions — {SORT_LABEL[rail.sort]}"
                    variant="ghost"
                  >
                    <IconSort />
                  </Button>
                {/snippet}
              </DropdownMenu.Trigger>
              <DropdownMenu.Content align="start" class="w-44">
                <DropdownMenu.Group>
                  <DropdownMenu.GroupHeading
                    >Sort sessions by</DropdownMenu.GroupHeading
                  >
                  <DropdownMenu.RadioGroup
                    onValueChange={(value) => rail.setSort(value as RailSort)}
                    value={rail.sort}
                  >
                    <DropdownMenu.RadioItem value="recent"
                      >Last activity</DropdownMenu.RadioItem
                    >
                    <DropdownMenu.RadioItem value="name"
                      >Name</DropdownMenu.RadioItem
                    >
                    <DropdownMenu.RadioItem value="state"
                      >State</DropdownMenu.RadioItem
                    >
                  </DropdownMenu.RadioGroup>
                </DropdownMenu.Group>
              </DropdownMenu.Content>
            </DropdownMenu.Root>
            <NewProjectPopover />
          </div>
        </Sidebar.GroupLabel>
        {#if orderedProjects.length === 0}
          <p class="px-2.5 text-meta text-muted-foreground" data-flip>
            {#if whiffle.machines.length === 0}
              Run
              <code
                class="font-mono text-[length:var(--text-label)] text-foreground"
                >whiffle</code
              >
              on a machine, then group its checkouts here.
            {:else}
              No projects yet — name a checkout to group its sessions.
            {/if}
          </p>
        {:else}
          <Sidebar.Menu
            class={MENU}
            {@attach highlight(PILL)}
            {@attach holdWhileInside('rail:')}
          >
            {#each orderedProjects as project (project.id)}
              {@const sessions = sessionsOf(project)}
              {@const expanded = !folderPrefs.collapsed(project.cwd)}
              <li
                class="group/menu-item relative"
                data-flip
                data-sidebar="menu-item"
                data-slot="sidebar-menu-item"
              >
                <FolderMenu
                  cwd={project.cwd}
                  name={project.name}
                  oncollapseothers={() => collapseOthers(project.id)}
                  onnew={() =>
                newSession({ projectId: project.id, machineId: project.machineId, cwd: project.cwd })}
                  {project}
                >
                  <Sidebar.MenuButton
                    class={LIST_ROW}
                    onclick={() => toggle(project)}
                  >
                    <ProjectMark hue={markHue(project.cwd)} />
                    <span class="min-w-0 truncate">{project.name}</span>
                    {#if sessions.length > 0}
                      {#key sessions.length}
                        <span
                          class="num ml-auto shrink-0 text-meta text-muted-foreground"
                          data-flip="pop"
                          >{sessions.length}</span
                        >
                      {/key}
                    {/if}
                  </Sidebar.MenuButton>
                </FolderMenu>

                <!-- Sub-items: sessions under this project -->
                {#if expanded}
                  <!-- The sub-list opens by growing rather than appearing, so a
                   folder toggled by mistake is legible as the thing that just
                   moved: it is uncovered top to bottom while the rows under it
                   slide down to make its room, and closes the same way. -->
                  <div data-flip>
                    <!-- The sessions hang off the project's mark on one
                         rail (app.css .kit-nest): each joins it with its
                         own elbow, and the last one ends it. -->
                    <Sidebar.MenuSub
                      class="kit-nest mx-0 translate-x-0 border-l-0 pr-0 pl-(--nest-pad)"
                      {@attach nestFrom('.project-mark')}
                    >
                      {@const lists = splitOf(project)}
                      {@const count =
                        lists.recent.length + (lists.older.length > 0 || lists.recent.length === 0 ? 1 : 0)}
                      {#each nested(lists.recent, `rail:${project.id}:recent`) as { row, depth }, i (row.id)}
                        {@render subRow(row, depth, nestPlace(i, count))}
                      {/each}
                      {#if lists.older.length > 0}
                        {@const olderVisible = olderShown(project, lists.older)}
                        <Sidebar.MenuSubItem
                          data-flip
                          style={nestPlace(lists.recent.length, count)}
                        >
                          <span aria-hidden="true" class="kit-nest-tip"></span>
                          <Sidebar.MenuSubButton
                            aria-expanded={olderVisible}
                            class="{SUB_ROW} text-muted-foreground"
                            onclick={() => toggleOlder(project.id)}
                          >
                            <span class="num">{lists.older.length} older</span>
                          </Sidebar.MenuSubButton>
                        </Sidebar.MenuSubItem>
                        {#if olderVisible}
                          <!-- Older sessions scroll in a box of their own,
                               six rows at most, so opening them never pushes
                               the projects below or the footer. -->
                          <li class="older-wrap" data-flip data-nest="through">
                            <ul
                              class="older kit-nest-inner"
                              {@attach scrollEdges}
                            >
                              {#each nested(lists.older, `rail:${project.id}:older`) as { row, depth }, i (row.id)}
                                {@render subRow(row, depth, nestPlace(i, lists.older.length))}
                              {/each}
                            </ul>
                          </li>
                        {/if}
                      {:else if lists.recent.length === 0}
                        <Sidebar.MenuSubItem data-flip style={nestPlace(0, 1)}>
                          <span aria-hidden="true" class="kit-nest-tip"></span>
                          <Sidebar.MenuSubButton
                            class="{SUB_ROW} text-muted-foreground"
                            onclick={() =>
                        newSession({
                          projectId: project.id,
                          machineId: project.machineId,
                          cwd: project.cwd,
                        })}
                          >
                            No sessions — start one
                          </Sidebar.MenuSubButton>
                        </Sidebar.MenuSubItem>
                      {/if}
                    </Sidebar.MenuSub>
                  </div>
                {/if}
              </li>
            {/each}
          </Sidebar.Menu>
        {/if}
      </Sidebar.Group>
      {#if Object.keys(workflowState.runs).length}
        <Sidebar.Group class={GROUP} data-flip>
          <Sidebar.GroupLabel class={GROUP_LABEL}
            >Workflow runs</Sidebar.GroupLabel
          >
          <Sidebar.Menu class={MENU}>
            {#each Object.values(workflowState.runs).filter((run) => !run.parentRunId).sort((a, b) => +new Date(b.startedAt) - +new Date(a.startedAt)) as run (run.id)}
              <WorkflowRail {activeSession} {run} />
            {/each}
          </Sidebar.Menu>
        </Sidebar.Group>
      {/if}
    {:else}
      {@render pending(6, LIST_ROW_H)}
    {/if}
    {#if !narrow}
      <!-- Everything else that can be opened, after the projects. -->
      <HomeRecent inset />
    {/if}
  </Sidebar.Content>

  <!-- ────────────────────── footer ──────────────────────── -->

  <Sidebar.Footer {@attach reflow()}>
    <UsageMeter />
    <div class="flex items-center gap-1" data-flip>
      <Sidebar.Menu aria-label="User" class="min-w-0 flex-1">
        <Sidebar.MenuItem>
          <Sidebar.MenuButton class={NAV_ROW}>
            <span
              aria-hidden="true"
              class="{SLOT} rounded-full bg-selected-bg text-meta text-selected-ink"
              >bw</span
            >
            <span class="min-w-0 flex-1 truncate text-foreground"
              >bewinxed</span
            >
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
      <!-- Configure and the theme: the pair of settings in the corner. -->
      <Tip label="Configure">
        {#snippet children(tip)}
          <Button
            {...tip}
            aria-current={configuring ? 'page' : undefined}
            aria-label="Configure"
            class="configure"
            href={configureHref}
            size="icon-sm"
            variant="ghost"
          >
            <IconSettings class="size-4" />
          </Button>
        {/snippet}
      </Tip>
      <ThemeSwitcher />
    </div>
  </Sidebar.Footer>
</div>
<!-- end flex column wrapper -->

<NewSessionDialog
  continueFrom={continuing.source ?? undefined}
  onclose={() => {
    spawnOpen = false;
    continuing.source = null;
    continuing.restore = null;
  }}
  onexitcontinue={() => {
    spawnOpen = true;
    continuing.source = null;
    continuing.restore = null;
  }}
  open={spawnOpen || continuing.source !== null}
  prefill={continuing.source ? undefined : spawnPrefill}
  restore={continuing.restore ?? undefined}
/>

<style>
  /* The header's corner actions: icon buttons on the nav row's height. */
  .head-action {
    display: inline-grid;
    flex: none;
    place-items: center;
    inline-size: var(--c-nav-h);
    block-size: var(--c-nav-h);
    border: 0;
    border-radius: var(--radius-sm);
    background: none;
    color: var(--ink-muted);
    cursor: pointer;
    transition: var(--transition-control);
  }
  .head-action :global(svg) {
    inline-size: 18px;
    block-size: 18px;
  }
  .head-action[data-on] {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  @media (hover: hover) and (pointer: fine) {
    .head-action:hover {
      background: var(--surface-hover);
      color: var(--ink-strong);
    }
  }
  /* A project's older sessions: six sub-rows (28px, 2px apart) at most,
     scrolling in place. The edges fade only while there is more past them. */
  .older-wrap {
    list-style: none;
  }
  /* It reaches back under the rail (and pads its rows forward again), so the
     elbows drawn left of its rows sit inside its scroll box, not clipped. */
  .older {
    --fade: var(--space-4);
    --nest-gap: 2px;
    display: flex;
    flex-direction: column;
    gap: 2px;
    max-block-size: calc(6 * 28px + 5 * 2px);
    margin: 0 0 0 calc(-1 * var(--nest-pad));
    padding: 0 0 0 var(--nest-pad);
    overflow-y: auto;
    overscroll-behavior: contain;
    scrollbar-width: thin;
    list-style: none;
  }
  .older[data-more-above] {
    mask-image: linear-gradient(transparent, #000 var(--fade));
  }
  .older[data-more-below] {
    mask-image: linear-gradient(#000 calc(100% - var(--fade)), transparent);
  }
  .older[data-more-above][data-more-below] {
    mask-image: linear-gradient(
      transparent,
      #000 var(--fade),
      #000 calc(100% - var(--fade)),
      transparent
    );
  }
  /* Configure, while a /config page is open: the selected tint, crossing
     over --dur-control like every control's colour. */
  :global(.configure[aria-current="page"]) {
    background: var(--selected-bg);
    color: var(--selected-ink);
  }
  :global(.configure) {
    transition:
      background-color var(--dur-control) var(--ease-out),
      color var(--dur-control) var(--ease-out);
  }
</style>
