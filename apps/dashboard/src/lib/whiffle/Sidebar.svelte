<script lang="ts">
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
   * space-efficient and less noisy. Idle sessions are capped per project with a
   * "+ N more" disclosure.
   */
  import { cubicOut } from "svelte/easing";
  import { slide } from "svelte/transition";
  import { Virtualizer } from "virtua/svelte";
  import { page } from "$app/state";
  import WorkflowRail from "$lib/components/features/workflows/WorkflowRail.svelte";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as DropdownMenu from "$lib/components/ui/dropdown-menu";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as Sidebar from "$lib/components/ui/sidebar";
  import ThemeSwitcher from "$lib/components/ui/ThemeSwitcher.svelte";
  import { Toggle } from "$lib/components/ui/toggle";
  import {
    IconAssistantDuo,
    IconBoxDuo,
    IconChevronRight,
    IconFolderDuo,
    IconPlus,
    IconSearch,
    IconSettingsDuo,
    IconSort,
    IconUsage,
    IconWarningTriangle,
    IconWorkflow,
  } from "$lib/icons";
  import { formatAgeShort, formatDistanceToNow } from "$lib/utils/time";
  import ActivityDot from "./ActivityDot.svelte";
  import {
    type Activity,
    MACHINE_UNREACHABLE_HINT,
    SLEEPING_HINT,
    UNKNOWN_HINT,
  } from "./activity";
  import {
    type InstanceRow,
    isResumable,
    isStale,
    type ProjectRow,
    whiffle,
  } from "./client.svelte";
  import { LAST_KEY as CONFIG_LAST_KEY, SECTIONS } from "./config/sections";
  import { continuing } from "./continue.svelte";
  import FolderMenu from "./FolderMenu.svelte";
  import { conversationHref } from "./links";
  import MachineMenu from "./MachineMenu.svelte";
  import { machineLabel } from "./machine";
  import { markHue, sessionSprite } from "./mark";
  import NewProjectPopover from "./NewProjectPopover.svelte";
  import OsMark from "./OsMark.svelte";
  import { type RailSort, rail } from "./rail.svelte";
  import NewSessionDialog from "./spawn/NewSessionDialog.svelte";
  import UsageMeter from "./UsageMeter.svelte";
  import { workflowState } from "./workflow-state.svelte";
  import { workspace } from "./workspace/workspace.svelte";

  /** Opens the Jump palette, which Shell owns so ⌘K and this field open the same one. */
  let {
    onjump,
    onassistant,
    assistantOpen,
  }: {
    onjump: () => void;
    /** Toggles the assistant, which Shell owns so ⌘J and this row share it. */
    onassistant: () => void;
    assistantOpen: boolean;
  } = $props();

  const path = $derived(page.url.pathname);
  /**
   * Configure opens on the section last visited, re-read on every navigation
   * so leaving one section for the board and coming back returns to it.
   */
  const configureHref = $derived.by(() => {
    let last: string | null = null;
    if (path.startsWith("/config/")) {
      [, , last] = path.split("/");
    } else if (typeof localStorage !== "undefined") {
      last = localStorage.getItem(CONFIG_LAST_KEY);
    }
    return `/config/${SECTIONS.some((section) => section.slug === last) ? last : "rules"}`;
  });
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
  const NAV_ROW =
    "h-[var(--c-nav-h)] gap-2.5 px-2.5 text-[length:var(--text-body)]";
  const LIST_ROW =
    "h-[30px] gap-2.5 px-2.5 py-0 text-[length:var(--text-label)]";
  const SUB_ROW =
    "h-[28px] gap-2.5 px-2.5 data-[size=md]:text-[length:var(--text-label)]";
  /** `Sidebar.Group`'s own `p-2` plus `Sidebar.Content`'s `gap-2` stacked to
   *  24px of nothing between every section; the label already separates them. */
  const GROUP = "px-2 py-1";
  const GROUP_LABEL = "px-2.5 text-[length:var(--text-label)]";
  /** A label carrying a control (the sort, the delegates toggle): on a coarse
   *  pointer it takes a 44px row, so the control's touch area stays inside
   *  it, clear of the session row below. */
  const CONTROL_LABEL = "pr-1 pointer-coarse:h-11";
  /** 2px, not 4: these are rows of one list, not six unrelated buttons. */
  const MENU = "gap-0.5";
  /**
   * The lead column, 18px, on EVERY row in the rail — nav, machines, projects,
   * sessions, the brand tile and the footer avatar alike. What sits in it
   * varies; the column does not, which is the only reason every label in the
   * rail starts at the same x (10px of row padding + 18 + 10 of gap = 38px).
   */
  const SLOT = "inline-flex size-[18px] shrink-0 items-center justify-center";
  /** A line glyph in the slot: 16px, 1px of air. */
  const SLOT_GLYPH = "size-4";
  /** An identity chip fills the slot, and carries an 11px glyph — 3.5px of
   *  inset, which is the difference between a mark and a glyph in a box. */
  const MARK = `${SLOT} rounded-[var(--radius-xs)]`;
  const MARK_GLYPH = "size-[11px]";
  /** The trailing column: one 16px box, so a 6px dot, an 8px dot and a 14px
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

  let collapsed = $state<Set<string>>(new Set());

  function toggle(id: string) {
    const next = new Set(collapsed);
    if (next.has(id)) {
      next.delete(id);
    } else {
      next.add(id);
    }
    collapsed = next;
  }

  function collapseOthers(id: string) {
    collapsed = new Set(
      orderedProjects.filter((p) => p.id !== id).map((p) => p.id)
    );
  }

  const inProject = (row: InstanceRow, project: ProjectRow): boolean =>
    row.projectId === project.id ||
    (row.machineId === project.machineId &&
      !!row.cwd &&
      (row.cwd === project.cwd || row.cwd.startsWith(`${project.cwd}/`)));

  const running = $derived(whiffle.runningInstances);

  const orderedProjects = $derived.by(() =>
    [...whiffle.projects].sort((a, b) => {
      const pa = rail.isPinned("project", a.id) ? 0 : 1;
      const pb = rail.isPinned("project", b.id) ? 0 : 1;
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
    ordered(shown(running.filter((row) => inProject(row, project))));

  const recentCountOf = (project: ProjectRow): number =>
    notRunning.filter((row) => inProject(row, project)).length;

  /**
   * Each section keeps its unfiltered list beside its filtered one. Two reasons,
   * both about the checkbox that sits on the section's own label: the group has
   * to draw while its every row is hidden, or the control that hid them goes
   * with them and there is no way back — and the count beside the checkbox is
   * the difference between the two lists.
   */
  const ungroupedAll = $derived(
    running.filter(
      (row) => !whiffle.projects.some((project) => inProject(row, project))
    )
  );

  const ungrouped = $derived(ordered(shown(ungroupedAll)));

  const notRunningAll = $derived(
    whiffle.listedInstances.filter((row) => isResumable(row) || isStale(row))
  );

  const notRunning = $derived(ordered(shown(notRunningAll)));

  const notRunningHint = (row: InstanceRow): string =>
    isResumable(row) ? SLEEPING_HINT : UNKNOWN_HINT;

  /** Flattened once per change rather than per scroll frame — the virtualizer
   *  re-reads `data` on every visible-range update. */
  const nestedNotRunning = $derived(nested(notRunning));

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
  function ordered(rows: InstanceRow[]): InstanceRow[] {
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
   * `rows` in tree order, siblings sorted by the reader's {@link ordered}.
   * A delegate whose parent is not in this same list — filtered out, sleeping
   * while the child runs, living under a different project — is drawn at the
   * root rather than dropped: a session the rail can reach is never hidden
   * because its parent is not on screen.
   */
  function nested(rows: InstanceRow[]): Nested[] {
    const present = new Set(rows.map((row) => row.id));
    const children = new Map<string, InstanceRow[]>();
    const roots: InstanceRow[] = [];
    for (const row of rows) {
      const parent = row.parentInstanceId;
      if (parent && present.has(parent) && parent !== row.id) {
        const siblings = children.get(parent);
        if (siblings) {
          siblings.push(row);
        } else {
          children.set(parent, [row]);
        }
      } else {
        roots.push(row);
      }
    }
    const out: Nested[] = [];
    const walk = (list: InstanceRow[], depth: number): void => {
      for (const row of ordered(list)) {
        out.push({ row, depth: Math.min(depth, MAX_INDENT) });
        const kids = children.get(row.id);
        if (kids) {
          walk(kids, depth + 1);
        }
      }
    };
    walk(roots, 0);
    return out;
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

  const online = $derived(
    new Set(whiffle.onlineMachines.map((machine) => machine.machineId))
  );
</script>

<!-- The sidebar primitives (Header, Content, Footer) expect a flex-column
     parent — the old `.rail` class provided this; now it's an explicit wrapper
     since the Shell's own `<aside>` doesn't set the direction. -->
<!-- When a session last moved, in the ~28px a rail can spare. Every session
     row in the rail renders this, so "which one was I just in" is answered by
     looking down one column instead of opening six of them. -->
<!-- The delegates toggle, on the label of every section it filters. One
     switch behind both: "do I want the work I handed off in this rail" is a
     single question, and a reader who asks it of the running list means it of
     the sleeping one too. The number is what the section is not showing. -->
{#snippet delegates(hidden: number)}
  <Toggle
    class="-mr-1 ml-auto border border-transparent font-normal aria-pressed:border-[var(--border-control)] data-[state=off]:text-muted-foreground"
    onPressedChange={(value) => rail.setDelegates(value)}
    pressed={rail.delegates}
    size="xs"
    title={rail.delegates
      ? 'Listing delegate sessions, nested under the session that spawned them'
      : 'Delegate sessions are hidden — this lists only sessions nobody delegated'}
  >
    Delegates
    {#if hidden > 0}
      <span class="tabular-nums opacity-70">{hidden}</span>
    {/if}
  </Toggle>
{/snippet}

{#snippet age(row: InstanceRow)}
  {@const label = ageOf(row)}
  {#if label}
    <span
      class="shrink-0 text-[length:var(--text-label)] tabular-nums text-muted-foreground"
      title={ageHint(row)}
      >{label}</span
    >
  {/if}
{/snippet}

<div
  class="flex h-full min-w-0 flex-1 flex-col overflow-hidden bg-sidebar text-sidebar-foreground"
>
  <!-- ────────────────────── header ──────────────────────── -->

  <Sidebar.Header>
    <!-- Brand tile — matches the FF preset's workspace-switcher anatomy -->
    <Sidebar.Menu aria-label="Workspace">
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

    <!-- Search + New session row — one visual block -->
    <div class="flex flex-col gap-0.5">
      <div class="group/search relative">
        <span
          class="{SLOT} pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-muted-foreground"
        >
          <IconSearch class={SLOT_GLYPH} />
        </span>
        <!-- A button dressed as the field: it opens the palette, which has
             the real input. A bare input here took typing and did nothing. -->
        <button
          aria-label="Jump to session"
          class="focus-ring touch-hit flex h-9 w-full items-center rounded-md border border-[var(--border-control)] bg-[var(--surface-raised)] pr-14 pl-[38px] text-left text-body text-muted-foreground shadow-xs outline-none [transition:var(--transition-control)]"
          onclick={onjump}
          type="button"
        >
          Jump…
        </button>
        <kbd
          class="pointer-events-none absolute right-2 top-1/2 -translate-y-1/2 font-sans
                  text-[length:var(--text-label)] text-muted-foreground opacity-0 transition-opacity duration-75
                  group-hover/search:opacity-100 group-focus-within/search:opacity-100"
          >⌘K</kbd
        >
      </div>
      <Sidebar.Menu>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton class={NAV_ROW} onclick={() => newSession()}>
            {#snippet child({ props })}
              <button {...props} type="button">
                <span class={SLOT}><IconPlus class={SLOT_GLYPH} /></span>
                <span class="flex-1">New session</span>
                <span
                  class="inline-flex opacity-0 transition-opacity duration-75
                           group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                >
                  <kbd
                    class="font-sans text-[length:var(--text-label)] text-muted-foreground"
                    >⇧⌘N</kbd
                  >
                </span>
              </button>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
        <!-- The assistant beside "New session": the two things you start
             from anywhere. Its glyph keeps the accent the summon has always
             carried; the row is otherwise a row like any other. -->
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={assistantOpen}
            onclick={onassistant}
          >
            {#snippet child({ props })}
              <button {...props} aria-expanded={assistantOpen} type="button">
                <span class="{SLOT} text-[var(--accent-11)]"
                  ><IconAssistantDuo class={SLOT_GLYPH} /></span
                >
                <span class="flex-1">Assistant</span>
                <span
                  class="inline-flex opacity-0 transition-opacity duration-75
                           group-hover/menu-item:opacity-100 group-focus-within/menu-item:opacity-100"
                >
                  <kbd
                    class="font-sans text-[length:var(--text-label)] text-muted-foreground"
                    >⌘J</kbd
                  >
                </span>
              </button>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </div>
  </Sidebar.Header>

  <!-- ────────────────────── content ──────────────────────── -->

  <Sidebar.Content class="gap-0 py-1">
    <!-- Fleet nav -->
    <Sidebar.Group class={GROUP}>
      <Sidebar.GroupLabel class={GROUP_LABEL}>Fleet</Sidebar.GroupLabel>
      <Sidebar.Menu class={MENU}>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={path.startsWith('/session')}
          >
            {#snippet child({ props })}
              <a href="/session" {...props}>
                <span class={SLOT}><IconBoxDuo class={SLOT_GLYPH} /></span>
                <span>Fleet</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
          {#if fleetCount}
            <Sidebar.MenuBadge
              class={whiffle.blockedCount > 0
              ? 'bg-[var(--status-attn-bg)] text-[var(--status-attn-ink)]'
              : 'bg-[var(--status-live-bg)] text-[var(--status-live-ink)]'}
            >
              {fleetCount}
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
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={path.startsWith('/usage')}
          >
            {#snippet child({ props })}
              <a href="/usage" {...props}>
                <span class={SLOT}><IconUsage class={SLOT_GLYPH} /></span>
                <span>Usage</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
        <Sidebar.MenuItem>
          <Sidebar.MenuButton
            class={NAV_ROW}
            isActive={path.startsWith('/config')}
          >
            {#snippet child({ props })}
              <a href={configureHref} {...props}>
                <span class={SLOT}><IconSettingsDuo class={SLOT_GLYPH} /></span>
                <span>Configure</span>
              </a>
            {/snippet}
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
    </Sidebar.Group>

    {#if Object.keys(workflowState.runs).length}
      <Sidebar.Group class={GROUP}>
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
    <!-- Machines -->
    {#if whiffle.machines.length > 0}
      <Sidebar.Group class={GROUP}>
        <Sidebar.GroupLabel class={GROUP_LABEL}>Machines</Sidebar.GroupLabel>
        <Sidebar.Menu class={MENU}>
          {#each whiffle.machines as machine (machine.machineId)}
            <Sidebar.MenuItem>
              <MachineMenu {machine}>
                <Sidebar.MenuButton class="{LIST_ROW} cursor-default">
                  {#snippet child({ props })}
                    <div {...props}>
                      <span class={SLOT}>
                        <OsMark
                          class="{SLOT_GLYPH} text-muted-foreground"
                          os={machine.os}
                        />
                      </span>
                      <span class="min-w-0 flex-1 truncate"
                        >{machineLabel(machine.hostname)}</span
                      >
                      {#if online.has(machine.machineId)}
                        <span class={TRAIL} title="Online">
                          <span
                            class="size-2 rounded-full bg-[var(--hue-green-500)]"
                          ></span>
                          <span class="sr-only">Online</span>
                        </span>
                      {:else}
                        <span class={TRAIL} title={MACHINE_UNREACHABLE_HINT}>
                          <IconWarningTriangle
                            aria-hidden="true"
                            class="size-3.5 text-warning"
                          />
                          <span class="sr-only">Unreachable</span>
                        </span>
                      {/if}
                    </div>
                  {/snippet}
                </Sidebar.MenuButton>
              </MachineMenu>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.Group>
    {/if}

    <!-- Projects -->
    <Sidebar.Group class={GROUP}>
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
        <p
          class="px-2.5 text-[length:var(--text-label)] leading-relaxed text-muted-foreground"
        >
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
        <Sidebar.Menu class={MENU}>
          {#each orderedProjects as project (project.id)}
            {@const sessions = sessionsOf(project)}
            {@const expanded = !collapsed.has(project.id)}
            <Sidebar.MenuItem>
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
                  onclick={() => toggle(project.id)}
                >
                  <span
                    aria-hidden="true"
                    class="-ml-1 inline-flex size-[14px] shrink-0 items-center justify-center transition-transform duration-150"
                    class:rotate-90={expanded}
                  >
                    <IconChevronRight class="size-3 text-muted-foreground" />
                  </span>
                  <span
                    class={MARK}
                    style="background-image: var(--mark-overlay); background-color: var(--mark-{markHue(project.cwd)});"
                  >
                    <IconFolderDuo
                      class={MARK_GLYPH}
                      style="color: var(--mark-glyph);"
                    />
                  </span>
                  <span class="min-w-0 truncate">{project.name}</span>
                  {#if sessions.length > 0}
                    <span
                      class="ml-auto shrink-0 text-[length:var(--text-label)] tabular-nums text-muted-foreground"
                      >{sessions.length}</span
                    >
                  {/if}
                </Sidebar.MenuButton>
              </FolderMenu>

              <!-- Sub-items: sessions under this project -->
              {#if expanded}
                <!-- The rail's one piece of choreography: the sub-list opens by
                   growing rather than appearing, so a folder toggled by mistake
                   is legible as the thing that just moved. `cubicOut` and 180ms
                   match the chevron rotating above it. -->
                <div transition:slide={{ duration: 180, easing: cubicOut }}>
                  <Sidebar.MenuSub>
                    {#each nested(sessions) as { row, depth } (row.id)}
                      {@const Sprite = sessionSprite(row.id)}
                      {@const activity = whiffle.activityOf(row.id)}
                      <Sidebar.MenuSubItem>
                        <Sidebar.MenuSubButton
                          class={SUB_ROW}
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
                          <span class="min-w-0 flex-1 truncate"
                            >{sessionName(row)}</span
                          >
                          {@render age(row)}
                          <span class={TRAIL}><ActivityDot {activity} /></span>
                        </Sidebar.MenuSubButton>
                      </Sidebar.MenuSubItem>
                    {:else}
                      {@const recent = recentCountOf(project)}
                      <Sidebar.MenuSubItem>
                        <Sidebar.MenuSubButton
                          class="{SUB_ROW} text-muted-foreground"
                          onclick={() =>
                        newSession({
                          projectId: project.id,
                          machineId: project.machineId,
                          cwd: project.cwd,
                        })}
                        >
                          {recent > 0 ? `${recent} recent — none running` : 'No sessions — start one'}
                        </Sidebar.MenuSubButton>
                      </Sidebar.MenuSubItem>
                    {/each}
                  </Sidebar.MenuSub>
                </div>
              {/if}
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      {/if}
    </Sidebar.Group>

    <!-- Running now (ungrouped sessions) -->
    {#if ungroupedAll.length > 0}
      <Sidebar.Group class={GROUP}>
        <Sidebar.GroupLabel class="{GROUP_LABEL} {CONTROL_LABEL}">
          <span>Running now</span>
          {@render delegates(
            ungroupedAll.length - ungrouped.length
          )}
        </Sidebar.GroupLabel>
        <Sidebar.Menu class={MENU}>
          {#each nested(ungrouped) as { row, depth } (row.id)}
            {@const activity = whiffle.activityOf(row.id)}
            {@const Sprite = sessionSprite(row.id)}
            <Sidebar.MenuItem>
              <Sidebar.MenuButton
                class={LIST_ROW}
                isActive={activeSession === row.id}
              >
                {#snippet child({ props })}
                  <a
                    href={conversationHref(row.id, whiffle.instanceIndex)}
                    style={indent(depth)}
                    {...props}
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
                    <span class="min-w-0 flex-1 truncate"
                      >{sessionName(row)}</span
                    >
                    {@render age(row)}
                    <span class={TRAIL}><ActivityDot {activity} /></span>
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            </Sidebar.MenuItem>
          {/each}
        </Sidebar.Menu>
      </Sidebar.Group>
    {/if}

    <!-- Not running -->
    {#if notRunningAll.length > 0}
      <Sidebar.Group class="{GROUP} min-h-0 flex-1">
        <Sidebar.GroupLabel class="{GROUP_LABEL} {CONTROL_LABEL}">
          <span>Not running</span>
          <span class="ml-1.5 tabular-nums opacity-70"
            >{notRunning.length}</span
          >
          {@render delegates(
            notRunningAll.length - notRunning.length
          )}
        </Sidebar.GroupLabel>
        <!-- Virtualized rather than capped. This list is the whole history of the
           fleet — two hundred rows on this machine today — and "15 more…" is
           not a shorter list, it is the same list with the interesting part
           hidden behind a click. `LIST_ROW` is a fixed 30px, so `itemSize` is
           exact and the scrollbar never jumps as rows measure.
           
           It scrolls in its own pane rather than in the rail's. Virtua measures
           a list from the top of its scroller, so pointed at the rail's
           scroller it would need `startMargin` — the exact height of the four
           groups above it, which changes every time a folder is toggled or a
           machine arrives. A pane of its own has no such number to keep
           correct, and it earns its keep anyway: the fleet's whole history
           scrolls without pushing the nav, the machines and the projects off
           the top of the rail. -->
        <div class="no-scrollbar min-h-40 flex-1 overflow-y-auto">
          <Virtualizer
            as="ul"
            bufferSize={12}
            data={nestedNotRunning}
            getKey={({ row }: Nested) => row.id}
            item="li"
            itemProps={() => ({ class: 'group/menu-item relative' })}
            itemSize={30}
          >
            {#snippet children({ row, depth }: Nested)}
              {@const Sprite = sessionSprite(row.id)}
              {@const rowStale = isStale(row)}
              <Sidebar.MenuButton
                class={LIST_ROW}
                isActive={activeSession === row.id}
              >
                {#snippet child({ props })}
                  <a
                    href={conversationHref(row.id, whiffle.instanceIndex)}
                    style={indent(depth)}
                    title={notRunningHint(row)}
                    {...props}
                  >
                    <span
                      class="{MARK} opacity-60"
                      style="background-image: var(--mark-overlay); background-color: var(--mark-{markHue(row.cwd || row.machineId)});"
                    >
                      <Sprite
                        aria-hidden="true"
                        class={MARK_GLYPH}
                        style="color: var(--mark-glyph);"
                      />
                    </span>
                    <span class="min-w-0 flex-1 truncate"
                      >{sessionName(row)}</span
                    >
                    {@render age(row)}
                    <span class={TRAIL}
                      ><ActivityDot
                        activity="idle"
                        sleeping={!rowStale}
                        stale={rowStale}
                      /></span
                    >
                  </a>
                {/snippet}
              </Sidebar.MenuButton>
            {/snippet}
          </Virtualizer>
        </div>
      </Sidebar.Group>
    {/if}
  </Sidebar.Content>

  <!-- ────────────────────── footer ──────────────────────── -->

  <Sidebar.Footer>
    <UsageMeter />
    <div class="flex items-center gap-1">
      <Sidebar.Menu aria-label="User" class="min-w-0 flex-1">
        <Sidebar.MenuItem>
          <Sidebar.MenuButton class={NAV_ROW}>
            <span
              aria-hidden="true"
              class="{SLOT} rounded-full bg-sidebar-accent text-[length:var(--text-meta)] font-medium text-sidebar-accent-foreground"
              >bw</span
            >
            <span class="min-w-0 flex-1 truncate text-foreground"
              >bewinxed</span
            >
            <span
              class="shrink-0 text-[length:var(--text-label)] text-muted-foreground"
            >
              {whiffle.machines.length}
              machine{whiffle.machines.length === 1 ? '' : 's'}
            </span>
          </Sidebar.MenuButton>
        </Sidebar.MenuItem>
      </Sidebar.Menu>
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
  }}
  onexitcontinue={() => {
    spawnOpen = true;
    continuing.source = null;
  }}
  open={spawnOpen || continuing.source !== null}
  prefill={continuing.source ? undefined : spawnPrefill}
/>
