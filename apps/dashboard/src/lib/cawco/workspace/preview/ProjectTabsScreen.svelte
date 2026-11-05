<script lang="ts" module>
  /** Where an open project stands in the strip: among the chats, leading them, or heading its own chats. */
  export type ProjectTabsDirection = "beside" | "lead" | "gather";
  /** The moment of the walk: chats only, a project opened from the rail, Caw's chat opened from it, a project split beside the chats. */
  export type ProjectTabsStep = "chats" | "project" | "caw" | "split";
  /** What Full size has done: nothing yet, the window, the workspace, or the project's own page. */
  export type ProjectTabsFull = "none" | "window" | "workspace" | "page";
</script>

<script lang="ts">
  import { markHue } from "#lib/cawco/mark.js";
  import NeedsYouChip from "#lib/cawco/project/NeedsYouChip.svelte";
  import ViewBar, { type BarView } from "#lib/cawco/project/ViewBar.svelte";
  import ViewTabs from "#lib/cawco/project/ViewTabs.svelte";
  import SessionMark from "#lib/cawco/SessionMark.svelte";
  import TreeMark from "#lib/cawco/TreeMark.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import TaskBoard from "#lib/cawco/tasks/TaskBoard.svelte";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconClose,
    IconFilter,
    IconFolder,
    IconMaximize,
    IconMinimize,
    IconMore,
    IconNeedsYou,
    IconPlus,
    IconRenew,
    IconSearch,
    IconServer,
    IconSidebar,
    IconSparkles,
  } from "#lib/icons.js";
  /**
   * The workspace with a project open in a tab, in a frame of its own (the
   * project-tab states files'), at the desk's 1440 or the phone's 390. What
   * the choice rests on is the house's own: the strip is fluid-tabs' folder
   * variant as PaneTabs wraps it, a project tab leads with the project's
   * mark (TreeMark), Caw's with his face (SessionMark), and the project is
   * its head row with ViewTabs, NeedsYouChip and BarGlass over TaskBoard fed
   * Cawco-Dev's real stages and tasks (project-tabs.fixtures). The rail, the
   * transcript and the composer are stand-ins in the house's type and
   * surfaces, as hang-card-tab-frame stands in for SessionDetails: each
   * reads the live fleet, and none differs between the options.
   */
  import type { StatusTone } from "../session-status";
  import { MOVES, PROJECT, STAGES, TASKS } from "./project-tabs.fixtures";

  let {
    direction = "beside",
    step = "chats",
    full = "none",
    phone = false,
  }: {
    direction?: ProjectTabsDirection;
    step?: ProjectTabsStep;
    full?: ProjectTabsFull;
    /** The phone's 390 frame: the tab row on top, the views at the foot. */
    phone?: boolean;
  } = $props();

  interface Tab {
    id: string;
    kind: "chat" | "project" | "caw";
    label: string;
    /** The project the chat belongs to (its hue), for a gathered strip. */
    of: string;
    tone: StatusTone;
  }

  const COMPOSER: Tab = {
    id: "e0dcf519",
    label: "Fix composer boilerplate and auto-template",
    kind: "chat",
    tone: "working",
    of: PROJECT.name,
  };
  const OPEN_TASKS: Tab = {
    id: "f8ff171c",
    label: "Continue CawCo open tasks",
    kind: "chat",
    tone: "working",
    of: PROJECT.name,
  };
  const LORAS: Tab = {
    id: "ef2901c9",
    label: "video loras aren't showing for some reason in genreate screen",
    kind: "chat",
    tone: "attention",
    of: "HyucksField",
  };
  const CAW: Tab = {
    id: "9baf5017",
    label: "are you able to use agy? and is agy able to generate images",
    kind: "caw",
    tone: "working",
    of: PROJECT.name,
  };
  const PROJECT_TAB: Tab = {
    id: PROJECT.id,
    label: PROJECT.name,
    kind: "project",
    tone: "quiet",
    of: PROJECT.name,
  };

  const RIM_INK: Record<StatusTone, string> = {
    working: "var(--status-live-glyph)",
    attention: "var(--tab-rim-attn)",
    failed: "var(--status-fail-glyph)",
    quiet: "var(--ink-muted)",
  };
  const RIM_STRENGTH: Record<StatusTone, { full: string; rest: string }> = {
    working: { rest: "var(--rim-subtle)", full: "var(--rim-chosen)" },
    attention: { rest: "var(--rim-subtle)", full: "var(--rim-chosen)" },
    failed: { rest: "var(--rim-subtle)", full: "var(--rim-chosen)" },
    quiet: { rest: "0", full: "var(--rim-idle)" },
  };

  const hue = markHue(PROJECT.name);

  /** Each group's tabs and the one in front, as the walk has them. */
  const groups = $derived.by((): { tabs: Tab[]; active: string }[] => {
    if (step === "chats") {
      return [{ tabs: [COMPOSER, OPEN_TASKS, LORAS], active: OPEN_TASKS.id }];
    }
    if (step === "split") {
      return full === "workspace"
        ? [{ tabs: [PROJECT_TAB], active: PROJECT_TAB.id }]
        : [
            { tabs: [PROJECT_TAB], active: PROJECT_TAB.id },
            { tabs: [COMPOSER, OPEN_TASKS, LORAS], active: OPEN_TASKS.id },
          ];
    }
    const caw = step === "caw";
    const active = caw ? CAW.id : PROJECT_TAB.id;
    switch (direction) {
      case "lead":
        return [
          {
            tabs: caw
              ? [PROJECT_TAB, CAW, COMPOSER, OPEN_TASKS, LORAS]
              : [PROJECT_TAB, COMPOSER, OPEN_TASKS, LORAS],
            active,
          },
        ];
      case "gather":
        return [
          {
            tabs: caw
              ? [PROJECT_TAB, CAW, COMPOSER, OPEN_TASKS, LORAS]
              : [PROJECT_TAB, COMPOSER, OPEN_TASKS, LORAS],
            active,
          },
        ];
      default:
        return [
          {
            tabs: caw
              ? [COMPOSER, OPEN_TASKS, PROJECT_TAB, CAW, LORAS]
              : [COMPOSER, OPEN_TASKS, PROJECT_TAB, LORAS],
            active,
          },
        ];
    }
  });

  /** Whether a tab stands in the project's gathered run (gather). */
  const gathered = (tab: Tab) =>
    direction === "gather" && step !== "chats" && tab.of === PROJECT.name;

  const views: BarView[] = [
    { value: "board", label: "Board", count: 0, draft: false },
    { value: "table", label: "Table", count: 0, draft: false },
    { value: "routines", label: "Routines", count: 0, draft: false },
    { value: "decisions", label: "Decisions", count: 30, draft: false },
    { value: "canvas", label: "Canvas", count: 0, draft: false },
    { value: "calendar", label: "Calendar", count: 0, draft: false },
  ];
  const needs = TASKS.filter((task) => task.needsYou).length;
  const newIn = STAGES.find((stage) => stage.kind === "todo")?.name;
  const allowedFrom = (from: string) =>
    new Set(
      STAGES.filter(
        (to) =>
          to.name !== from &&
          MOVES.some(
            (move) =>
              (move.from === "*" || move.from === from) &&
              (move.to === "*" || move.to === to.name)
          )
      ).map((stage) => stage.name)
    );
  const noop = () => undefined;

  /** What stands in front: a project, Caw's chat or a chat. */
  const front = $derived(
    full === "page"
      ? "project"
      : (groups[0].tabs.find((tab) => tab.id === groups[0].active)?.kind ??
          "chat")
  );
  /** Places the run's band over the gathered tabs, once they are laid out. */
  const runBand = (node: HTMLElement) => {
    // biome-ignore lint/complexity/noVoid: read-only dependencies
    void [step, direction, phone];
    const frame = requestAnimationFrame(() => {
      const band = node.querySelector<HTMLElement>("[data-run-band]");
      const run = [
        ...node.querySelectorAll<HTMLElement>("[data-gathered]"),
      ].map((tab) => tab.getBoundingClientRect());
      if (!band || run.length === 0) {
        band?.removeAttribute("data-placed");
        return;
      }
      const box = node.getBoundingClientRect();
      const start = Math.min(...run.map((rect) => rect.left));
      const end = Math.max(...run.map((rect) => rect.right));
      band.style.left = `${start - box.left}px`;
      band.style.width = `${end - start}px`;
      band.style.top = `${run[0].top - box.top - 6}px`;
      band.toggleAttribute("data-placed", true);
    });
    return () => cancelAnimationFrame(frame);
  };
  const railShown = $derived(!phone && full !== "window");
  const barShown = $derived(full !== "window");
</script>

<div
  class="flex w-full overflow-hidden bg-surface-recess text-ink-strong"
  style:height={phone ? "844px" : "900px"}
>
  {#if railShown}
    {@render rail()}
  {/if}
  <!-- A container, so the bar's columns stand over the groups below. -->
  <div class="@container flex min-w-0 flex-auto flex-col">
    {#if barShown}
      {@render bar()}
    {/if}
    <div class="flex min-h-0 flex-auto">
      {#if step === "split" && full !== "workspace"}
        <div class="flex min-w-0 basis-3/5 flex-col">
          {@render projectPane(true)}
        </div>
        <div class="w-px flex-none bg-border-hairline"></div>
        <div class="flex min-w-0 basis-2/5 flex-col">
          {@render chatPane(OPEN_TASKS)}
        </div>
      {:else if front === "project"}
        <div class="flex min-w-0 flex-auto flex-col">
          {@render projectPane(false)}
        </div>
      {:else if front === "caw"}
        {@render chatPane(CAW)}
      {:else}
        {@render chatPane(OPEN_TASKS)}
      {/if}
    </div>
  </div>
</div>

<!-- The rail, standing in for Sidebar (which reads the live fleet): its
     rows as the rail draws them, Cawco-Dev pressed while it is open. -->
{#snippet rail()}
  <aside
    class="flex w-(--c-sidebar-w) flex-none flex-col gap-space-2 border-e border-e-border-hairline bg-(--sidebar) px-space-2 pt-space-3"
  >
    <div class="flex h-c-btn-h-sm items-center px-space-2 type-label">
      Caw&amp;Co
    </div>
    <div class="flex h-c-btn-h-sm items-center gap-space-3 px-space-2 type-row">
      <IconServer aria-hidden="true" class="size-icon-md text-ink-muted" />
      Fleet
    </div>
    <div class="mt-space-4 px-space-2 type-meta text-ink-muted">Projects</div>
    {#each [{ name: PROJECT.name, rows: [COMPOSER, OPEN_TASKS, CAW] }, { name: "HyucksField", rows: [LORAS] }, { name: "anbar", rows: [] }, { name: "petralab", rows: [] }] as project (project.name)}
      {@const open = project.name === PROJECT.name && step !== "chats"}
      <div
        class={[
          "flex h-c-btn-h-sm items-center gap-space-3 rounded-md px-space-2 type-row",
          open && "bg-surface-hover",
        ]}
      >
        <TreeMark faceAlways fill="var(--mark-{markHue(project.name)})">
          {#snippet face()}
            <IconFolder aria-hidden="true" class="size-icon-sm" />
          {/snippet}
        </TreeMark>
        <span class="truncate">{project.name}</span>
      </div>
      {#each project.rows as row (row.id)}
        <div
          class="ms-space-6 flex h-c-btn-h-sm items-center gap-space-3 px-space-2 type-row text-ink-muted"
        >
          <span class="truncate">{row.label}</span>
        </div>
      {/each}
    {/each}
  </aside>
{/snippet}

<!-- The bar: each group's tabs in a column over it, then the glass. On the
     project's own page (Full size as a page) the views stand in the bar
     and the tabs are gone, as the page stands today. -->
{#snippet bar()}
  <header
    class={[
      "relative flex h-c-top-bar-h flex-none items-center gap-space-2",
      !phone && "shelf-hairline pe-space-6",
    ]}
  >
    {#if phone}
      <!-- The phone's bar floats over the tab row's two ends, as the
           Shell's does: the strip leaves them room. -->
      <span
        class="absolute inset-y-0 start-0 z-(--layer-bar) grid w-c-btn-h-lg place-items-center"
      >
        <IconSidebar
          aria-hidden="true"
          class="size-c-bar-toggle-glyph text-ink-muted"
        />
      </span>
    {/if}
    {#if full === "page"}
      <div class="flex min-w-0 flex-auto items-center ps-space-7">
        <ViewTabs current="board" hrefOf={() => "#"} onchoose={noop} {views} />
      </div>
    {:else}
      <div class="flex min-w-0 flex-auto self-stretch">
        {#each groups as group, g (g)}
          <div
            class={[
              "relative flex min-w-0 self-stretch",
              groups.length > 1 && g === 0 && "flex-none basis-[60cqi]",
              groups.length > 1 && g === 1 && "flex-auto shadow-(--seam)",
              groups.length === 1 && "flex-auto",
            ]}
            style:--seam="-1px 0 0 var(--border-hairline)"
            {@attach runBand}
          >
            {@render strip(group.tabs, group.active)}
            <!-- The project's run: one band in its hue over the tabs it
                 gathers, placed from their boxes. -->
            <span
              aria-hidden="true"
              class="pointer-events-none absolute z-10 hidden h-space-row rounded-pill data-placed:block"
              data-run-band
              style:background="var(--mark-{hue})"
            ></span>
          </div>
        {/each}
      </div>
    {/if}
    <div
      class={[
        "flex flex-none items-center",
        phone
          ? "absolute inset-y-0 end-(--c-bar-phone-edge) z-(--layer-bar)"
          : "ms-auto",
      ]}
    >
      <BarGlass>
        {#snippet head()}
          <button
            data-bar-item
            aria-label="Caw"
            class="select-none touch-hit press-tint"
            type="button"
          >
            <span
              data-slot="bar-symbol"
              aria-hidden="true"
              class="block rounded-pill bg-ink-muted"
            ></span>
          </button>
        {/snippet}
        {#if !phone}
          <button
            data-bar-item
            aria-label="Jump to session"
            class="select-none touch-hit press-tint"
            type="button"
          >
            <IconSearch aria-hidden="true" class="size-icon-md text-ink-muted" />
          </button>
          <button
            data-bar-item
            aria-label="Machines"
            class="select-none touch-hit press-tint"
            type="button"
          >
            <IconServer data-slot="bar-symbol" aria-hidden="true" />
          </button>
        {/if}
      </BarGlass>
    </div>
  </header>
{/snippet}

<!-- One group's strip, as PaneTabs draws it: fluid-tabs' folder tabs, each
     in the tab box PaneTabs wraps it in, its rim in its status. -->
{#snippet strip(tabs: Tab[], active: string)}
  <Tabs
    class="min-w-0 flex-auto"
    data-session-tabs
    strip={phone ? "session" : "hosted"}
    value={active}
    values={tabs.map((tab) => tab.id)}
    variant="folder"
  >
    <TabsList aria-label="Open tabs" scrollable>
      {#each tabs as tab, i (tab.id)}
        {@const chosen = tab.id === active}
        {@const compact = direction === "lead" && tab.kind === "project"}
        {@const leadEnds =
          direction === "lead" &&
          tab.kind === "project" &&
          tabs[i + 1]?.kind !== "project"}
        <div
          class={[
            "group/tab pane-tab-pads pane-tab-rims relative flex min-w-0 flex-none",
            "max-w-c-tab-max-w",
            leadEnds && "me-space-4",
          ]}
          data-chosen={chosen ? "" : undefined}
          data-gathered={gathered(tab) || undefined}
          data-slot="tab"
          style:--lone-end={Number(i === tabs.length - 1)}
          style:--lone-start={Number(i === 0)}
          style:--rim-full={RIM_STRENGTH[tab.tone].full}
          style:--rim-ink="var(--tone)"
          style:--rim-rest={RIM_STRENGTH[tab.tone].rest}
          style:--tone={RIM_INK[tab.tone]}
        >
          <TabItem
            data-session-tab={tab.id}
            label={tab.label}
            value={tab.id}
          >
            {#snippet lead()}
              {#if tab.kind === "project"}
                <TreeMark faceAlways fill="var(--mark-{hue})">
                  {#snippet face()}
                    <IconFolder aria-hidden="true" class="size-icon-sm" />
                  {/snippet}
                </TreeMark>
              {:else if tab.kind === "caw"}
                <span class="max-desk:hidden">
                  <SessionMark
                    caw="working"
                    id={tab.id}
                    place={PROJECT.name}
                    status="idle"
                  />
                </span>
              {:else}
                <span
                  class={[
                    "inline-grid flex-none max-desk:hidden",
                    tab.tone === "working" && "text-status-live-glyph",
                    tab.tone === "attention" && "text-status-attn-glyph",
                  ]}
                >
                  {#if tab.tone === "attention"}
                    <IconNeedsYou aria-hidden="true" class="size-icon-md" />
                  {:else}
                    <IconRenew aria-hidden="true" class="size-icon-md" />
                  {/if}
                </span>
              {/if}
            {/snippet}
            {#snippet trail()}
              {#if !compact}
                <span
                  class="ms-space-row flex flex-none max-desk:hidden coarse:hidden"
                >
                  <Button
                    aria-hidden="true"
                    size="icon-xs"
                    tabindex={-1}
                    tone="quiet"
                    variant="ghost"
                  >
                    <IconClose />
                  </Button>
                </span>
              {/if}
            {/snippet}
          </TabItem>
        </div>
      {/each}
    </TabsList>
  </Tabs>
{/snippet}

<!-- A conversation, standing in for SessionPane and the Composer (both read
     the live session): its last turn and the composer at the foot. -->
{#snippet chatPane(tab: Tab)}
  <div class="relative flex min-w-0 flex-auto flex-col">
    <div
      class="flex min-h-0 flex-auto flex-col justify-end gap-space-3 overflow-hidden px-space-7 pb-space-8"
    >
      {#if tab.kind !== "caw"}
        <div class="type-label">You</div>
        <p
          class="m-0 rounded-md bg-surface-hover px-space-3 py-space-2 type-body"
        >
          HM?
        </p>
      {/if}
      <div class="flex items-center gap-space-3 type-label">
        {#if tab.kind === "caw"}
          <SessionMark
            caw="working"
            id={tab.id}
            place={PROJECT.name}
            status="idle"
          />
          Caw
        {:else}
          Claude Code
        {/if}
      </div>
      <p class="m-0 max-w-c-measure type-body">
        {#if tab.kind === "caw"}
          I've started Fix agy sign-in read: tether needs detached. It makes
          the tether start its command the required way itself, so no future
          caller can get this wrong. Once it lands, I'll ship it and check
          that obelisk shows agy as signed in.
        {:else}
          Sorry, that was too much. In short: in the design graph's
          inspector, the class and style rows are gone, except on a story
          that actually sets one. Then the row shows, so you can see why the
          component looks different. It reaches your machines with the next
          nightly.
        {/if}
      </p>
    </div>
    <div class="flex-none px-space-5 pb-space-5">
      <div
        class="mx-auto flex h-c-composer-field max-w-c-composer-w items-center rounded-lg border border-border-control bg-surface-raised px-space-4 type-body text-ink-muted shadow-tile"
      >
        {tab.kind === "caw" ? "Message Caw…" : "Message the agent…"}
      </div>
    </div>
  </div>
{/snippet}

<!-- The project in its tab: one head row (its name, its views and what
     acts on them, Caw's seat, then Full size and More in one glass group),
     the board under it. -->
{#snippet projectPane(narrow: boolean)}
  <div
    class={[
      "flex flex-none items-center gap-space-3",
      phone ? "px-space-5 pt-space-4 pb-space-3" : "ps-space-7 pe-space-6 pt-space-4 pb-space-4",
    ]}
  >
    <h2 class="m-0 flex-none truncate type-title">{PROJECT.name}</h2>
    {#if !phone && full !== "page"}
      <div class="flex min-w-0 flex-auto items-center gap-space-3">
        <ViewTabs current="board" hrefOf={() => "#"} onchoose={noop} {views} />
        {#if !narrow}
          <span aria-hidden="true" class="h-c-btn-h-sm w-px flex-none bg-border-hairline"></span>
          <div data-form="compact" class="flex flex-none items-center gap-space-2">
            <Button aria-label="Filter" size="sm" variant="ghost">
              <IconFilter />
            </Button>
            <NeedsYouChip count={needs} on={false} ontoggle={noop} />
            <Button aria-label="New task" size="sm" variant="ghost">
              <IconPlus />
            </Button>
            <Button aria-label="Ask Caw for a view" size="sm" variant="ghost">
              <IconSparkles />
            </Button>
          </div>
        {/if}
      </div>
    {:else}
      <span class="flex-auto"></span>
    {/if}
    <div class="flex flex-none items-center gap-space-3">
      <CawFace size={32} status="working" />
      <BarGlass form="group">
        {#if full !== "page" && !phone}
          <button
            data-bar-item
            aria-label={full === "window" ? "Exit full size" : "Full size"}
            class="select-none touch-hit press-tint"
            type="button"
          >
            {#if full === "window" || full === "workspace"}
              <IconMinimize aria-hidden="true" class="size-icon-md text-ink-muted" />
            {:else}
              <IconMaximize aria-hidden="true" class="size-icon-md text-ink-muted" />
            {/if}
          </button>
        {/if}
        <button
          data-bar-item
          aria-label="More"
          class="select-none touch-hit press-tint"
          type="button"
        >
          <IconMore aria-hidden="true" class="size-icon-md text-ink-muted" />
        </button>
      </BarGlass>
    </div>
  </div>
  <div
    class={[
      "min-h-0 flex-auto overflow-hidden",
      phone ? "px-space-4" : "ps-space-7 pe-space-6",
    ]}
  >
    <TaskBoard
      {allowedFrom}
      hrefOf={() => "#"}
      {newIn}
      oncreate={async () => undefined}
      onmove={noop}
      onopen={noop}
      stages={STAGES}
      tasks={TASKS}
    />
  </div>
  {#if phone}
    <ViewBar
      current="board"
      {needs}
      needsOn={false}
      onchoose={noop}
      onnewsession={noop}
      ontoggleneeds={noop}
      {views}
    />
  {/if}
{/snippet}
