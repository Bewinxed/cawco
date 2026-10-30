<script lang="ts">
  /**
   * A fixture for the failure-state proposal (fault/RegionFault): the
   * dashboard's shell at one width, drawn from the tokens, with one part
   * stopped on a render error and everything outside that part standing
   * and working. The side card is the real SideSurface (its head, switch,
   * Expand and Close); the rest of the shell is a stand-in at its real size
   * with the owner's own fleet (cockpit on obelisk). Try again throws again
   * on the same data, as a duplicate key does, so the face turns to its
   * Reload page form, live.
   *
   * Regions: `side` the card beside a conversation (the split from a 900px
   * pane, the sheet under it), `sheet` the preview sheet in a pane under
   * 900px (a desk's narrow column, a phone), `sidebar` the project tree in
   * the rail or its sheet, `tabs` a group's strip, `page` a route's page,
   * `workspace` the sessions' surface, `list` one list inside the side card
   * (the Comments rail's rows, where the duplicate key threw).
   */
  import { sideWords } from "@cawco/core/words/side";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconChat,
    IconClose,
    IconFiles,
    IconFolder,
    IconPlus,
    IconSearch,
    IconServer,
    IconSessionAdd,
    IconSettings,
    IconSidebar,
    IconSort,
    IconTaskList,
    IconUsage,
  } from "#lib/icons.js";
  import SideSurface from "../../side/SideSurface.svelte";
  import RegionFault from "../RegionFault.svelte";

  type Region =
    "side" | "sheet" | "sidebar" | "tabs" | "page" | "workspace" | "list";

  let {
    region,
    width,
    height,
    face = "region",
    again = false,
    askCaw = false,
    columns = 1,
  }: {
    region: Region;
    /** The window's width, as the story's viewport. */
    width: number;
    height: number;
    /** `region` / `line`: the proposal's two faces; `today`: what ships. */
    face?: "region" | "line" | "today";
    /** The rebuild threw again on the same data. */
    again?: boolean;
    askCaw?: boolean;
    /** Columns in the workspace: a desk's narrow pane gets the sheet. */
    columns?: number;
  } = $props();

  /** Try again rebuilds from the same data, which throws again. */
  let stopped = $derived(again);
  const retry = () => {
    stopped = true;
  };

  const desk = $derived(width >= 901);
  const phone = $derived(width < 640);
  /** The pane holding the side card, as the shell lays it out. */
  const pane = $derived(
    ((desk ? width - 228 : width) - (columns - 1) * 1) / columns
  );
  const split = $derived(pane >= 900);
  const today = $derived(face === "today");

  const DETAILS = {
    side: "Svelte error: each_key_duplicate\nKeyed each block has duplicate key `pin-12` at indexes 3 and 7\n    in CommentRail.svelte\n    in PreviewPane.svelte\n    in SideSplit.svelte",
    sidebar:
      "TypeError: Cannot read properties of undefined (reading 'hue')\n    in ProjectMark.svelte\n    in ProjectTree.svelte\n    in Sidebar.svelte",
    tabs: "Svelte error: each_key_duplicate\nKeyed each block has duplicate key `obelisk:8f2c1a` at indexes 1 and 4\n    in PaneTabs.svelte",
    page: "TypeError: Cannot read properties of null (reading 'nextRun')\n    in RoutineRow.svelte\n    in routines/+page.svelte",
    workspace:
      "RangeError: Invalid time value\n    at formatAge (age.ts:14)\n    in SessionSurface.svelte",
  };

  const SESSIONS = [
    { title: "Design dashboard failure states", on: true },
    { title: "Fix tray chip overflow", on: false },
    { title: "Ship the stream relay journey", on: false },
    { title: "Name the Caw-off tray's states", on: false },
  ];
  const TABS = [
    "Design dashboard failure states",
    "Fix tray chip overflow",
    "Caw · cockpit",
  ];
</script>

<!-- ---------- the shell's parts, standing ---------- -->

{#snippet spokes()}
  <nav class="flex flex-col gap-space-1 px-space-2" aria-label="Spokes">
    {#each [{ icon: IconSessionAdd, label: "New session" }, { icon: IconTaskList, label: "Board" }, { icon: IconUsage, label: "Usage" }, { icon: IconSettings, label: "Configure" }] as spoke (spoke.label)}
      <a
        class="mark-line flex h-c-rail-row-h items-center gap-space-2 rounded-sm px-space-2 text-ink-row type-label hover:bg-surface-hover"
        href="#{spoke.label}"
        ><spoke.icon class="size-icon-md text-ink-muted" data-box /><span
          >{spoke.label}</span
        ></a
      >
    {/each}
  </nav>
{/snippet}

{#snippet tree()}
  <div class="flex flex-col gap-space-1 px-space-2">
    <p class="m-0 px-space-2 py-space-1 type-meta text-ink-muted">Projects</p>
    {#if region === "sidebar" && !today}
      <RegionFault
        again={stopped}
        details={DETAILS.sidebar}
        face="line"
        onretry={retry}
        what="the projects"
      />
    {:else}
      {#each ["cockpit", "backlot"] as project, at (project)}
        <div
          class="mark-line flex h-c-rail-row-h items-center gap-space-2 rounded-sm px-space-2 text-ink-row type-label"
        >
          <IconFolder class="size-icon-md text-ink-muted" /><span
            >{project}</span
          >
        </div>
        {#if at === 0}
          {#each SESSIONS as session (session.title)}
            <div
              data-on={session.on || undefined}
              class="flex h-c-rail-row-h min-w-0 items-center rounded-sm ps-space-7 pe-space-2 text-ink-row type-label data-on:bg-selected-bg data-on:text-selected-ink"
            >
              <span class="truncate">{session.title}</span>
            </div>
          {/each}
        {/if}
      {/each}
    {/if}
  </div>
{/snippet}

{#snippet railBody()}
  <div class="flex h-full min-h-0 flex-col gap-space-3 py-space-3">
    <p class="m-0 px-space-4 font-wordmark text-ink-strong">Caw&amp;Co</p>
    <div class="px-space-3">
      <div
        class="mark-line flex h-c-input-h items-center gap-space-2 rounded-md border border-border-control bg-surface-raised px-space-3 text-ink-subtle type-body"
      >
        <IconSearch class="size-icon-md" /><span>Jump to session</span>
      </div>
    </div>
    {#if region === "sidebar" && today}
      <RegionFault
        details={DETAILS.sidebar}
        face="today"
        todayName="sidebar"
        what="the sidebar"
      />
    {:else}
      {@render spokes()}
      {@render tree()}
    {/if}
  </div>
{/snippet}

{#snippet bar()}
  <header
    class="relative flex h-c-top-bar-h flex-none items-center gap-space-2 px-space-3"
  >
    {#if !desk}
      <Button
        aria-label="Navigation"
        icon={IconSidebar}
        size="icon-sm"
        variant="ghost"
      />
    {/if}
    <span class="min-w-0 flex-1 truncate type-label text-ink-strong"
      >{region === "page" ? "Routines" : ""}</span
    >
    <div
      class="flex flex-none items-center gap-space-1 rounded-full border border-border-hairline bg-surface-raised p-space-1 shadow-tile"
    >
      {#if desk}
        <Button
          aria-label="Files, 20"
          icon={IconFiles}
          size="icon-sm"
          variant="ghost"
        />
        <Button
          aria-label="Jump to session"
          icon={IconSearch}
          size="icon-sm"
          variant="ghost"
        />
        <Button
          aria-label="3 machines"
          icon={IconServer}
          size="icon-sm"
          variant="ghost"
        />
      {/if}
      <span
        aria-label="Caw"
        class="block size-c-bar-item rounded-full bg-brand-solid"
        role="img"
      ></span>
    </div>
  </header>
{/snippet}

{#snippet strip()}
  <!-- A strip that failed grows to hold its details, moving the pane down. -->
  <div
    data-failed={region === "tabs" || undefined}
    class="flex h-c-tab-row-h flex-none items-end gap-space-1 bg-surface-shelf px-space-3 data-failed:h-auto data-failed:min-h-c-tab-row-h"
  >
    {#if region === "tabs"}
      <div class="min-w-0 flex-1 self-center">
        <RegionFault
          again={stopped}
          details={DETAILS.tabs}
          face={today ? "today" : "line"}
          onretry={retry}
          todayName="tabs"
          what="these tabs"
        />
      </div>
    {:else}
      {#each TABS.slice(0, phone ? 2 : 3) as tab, at (tab)}
        <div
          data-chosen={at === 0 || undefined}
          class="flex h-c-tab-row-h min-w-0 max-w-c-tab-max-w items-center rounded-t-md bg-surface-recess-deep px-space-3 type-label text-ink-muted data-chosen:bg-tab-sheet data-chosen:text-ink-strong"
        >
          <span class="truncate">{tab}</span>
        </div>
      {/each}
    {/if}
  </div>
{/snippet}

{#snippet transcript()}
  <div
    class="flex min-h-0 flex-1 flex-col gap-space-4 overflow-hidden bg-tab-sheet px-space-6 pt-space-5 max-desk:px-space-5"
  >
    <div
      class="self-end rounded-lg bg-surface-recess px-space-4 py-space-3 type-body text-ink-strong max-w-c-measure-short"
    >
      The side panel went blank with a pink banner again. Can you look at why?
    </div>
    <p class="m-0 type-body text-ink-strong max-w-c-measure text-pretty">
      The Comments rail threw a duplicate key: two pins came back from the hub
      with the same id after the reconnect. I'm fixing the dedupe in the rail's
      read.
    </p>
    <p
      class="mark-line m-0 flex items-center gap-space-2 type-label text-ink-muted"
    >
      <IconChat class="size-icon-md" /><span class="font-mono type-code"
        >Read apps/dashboard/src/lib/cawco/preview/CommentRail.svelte</span
      >
    </p>
  </div>
  <div class="flex-none bg-tab-sheet px-space-3 pb-space-3 desk:px-space-6">
    <div
      class="mx-auto flex h-c-input-h max-w-c-composer-w items-center rounded-lg border border-border-control bg-surface-raised px-space-3 text-ink-subtle type-body shadow-tile"
    >
      <span>Write to Claude Code</span>
    </div>
  </div>
{/snippet}

<!-- ---------- the side card ---------- -->

{#snippet switcher()}
  <Tabs size="compact" value="preview">
    <TabsList aria-label={sideWords.label}>
      <TabItem label={sideWords.preview} value="preview" />
      <TabItem label={sideWords.task} value="task" />
    </TabsList>
  </Tabs>
{/snippet}

{#snippet page()}
  <!-- The previewed page, standing: a decision page's first cards. -->
  <div class="flex flex-col gap-space-3 p-space-5">
    <p class="m-0 type-title text-ink-strong">Failure states</p>
    <div class="h-c-row-h-two rounded-md bg-surface-raised shadow-tile"></div>
    <div class="h-c-row-h-two rounded-md bg-surface-raised shadow-tile"></div>
  </div>
{/snippet}

{#snippet rail()}
  <aside
    aria-label="Comments"
    class="flex w-c-comments-w flex-none flex-col gap-space-2 rounded-sm border border-border-well bg-surface-raised p-space-2 max-phone:hidden"
  >
    <div class="flex items-center justify-end gap-space-1">
      <Button
        aria-label="Sort"
        icon={IconSort}
        size="icon-sm"
        variant="ghost"
      />
      <Button
        aria-label="Comment on the whole page"
        icon={IconPlus}
        size="icon-sm"
        variant="ghost"
      />
      <Button
        aria-label="Close comments"
        icon={IconClose}
        size="icon-sm"
        variant="ghost"
      />
    </div>
    <div
      class="mark-line flex h-c-input-h items-center gap-space-2 rounded-md border border-border-control px-space-3 text-ink-subtle type-body"
    >
      <IconSearch class="size-icon-md" /><span>Search comments</span>
    </div>
    <RegionFault
      again={stopped}
      details={DETAILS.side}
      face="line"
      onretry={retry}
      what="the comments"
    />
  </aside>
{/snippet}

{#snippet sideCard(sheet: boolean)}
  {@const listOnly = region === "list"}
  {#if today}
    <!-- What ships: the boundary stands outside the card, so the card's
         head and Close go with what failed. -->
    <div class="h-full min-h-0">
      <RegionFault
        details={DETAILS.side}
        face="today"
        todayName="side panel"
        what="the preview"
      />
    </div>
  {:else}
    <SideSurface
      label="Preview"
      onclose={() => undefined}
      {switcher}
      title="Failure states"
      beside={listOnly && !sheet ? rail : undefined}
    >
      {#if listOnly}
        {@render page()}
        {#if sheet}
          <!-- The rail is the well's foot sheet on a narrow pane. -->
          <div
            class="absolute inset-x-0 bottom-0 rounded-t-lg border-t border-border-hairline bg-surface-raised pt-space-2"
          >
            <RegionFault
              again={stopped}
              details={DETAILS.side}
              face="line"
              onretry={retry}
              what="the comments"
            />
          </div>
        {/if}
      {:else}
        <RegionFault
          again={stopped}
          {askCaw}
          details={DETAILS.side}
          {face}
          kept="Its page and comments are kept."
          onretry={retry}
          what="the preview"
        />
      {/if}
    </SideSurface>
  {/if}
{/snippet}

{#snippet sideSheet()}
  <!-- The preview sheet (SideSheet): standing on the composer in a desk's
       narrow pane, over it to the screen's foot on a phone. -->
  <div
    class="absolute inset-x-0 top-2/5 bottom-(--sheet-foot) flex flex-col"
    style:--sheet-foot={phone
      ? "0px"
      : "calc(var(--c-input-h) + var(--space-3) + var(--space-2))"}
  >
    <div
      data-preview-sheet
      class="relative flex min-h-0 flex-1 flex-col rounded-t-lg bg-surface-raised pt-space-3 shadow-drawer"
    >
      <span
        aria-hidden="true"
        class="mx-auto mb-space-1 block h-c-grabber-h w-c-grabber-w flex-none rounded-full bg-border-control"
      ></span>
      {@render sideCard(true)}
    </div>
  </div>
{/snippet}

{#snippet conversation(withSide: boolean)}
  <div class="relative flex min-h-0 min-w-0 flex-1 flex-col">
    {#if withSide && split}
      <div class="flex min-h-0 flex-1 gap-space-2 bg-tab-sheet">
        <div class="flex min-h-0 min-w-0 flex-1 flex-col">
          {@render transcript()}
        </div>
        <div
          class="flex min-h-0 w-9/20 flex-none flex-col py-space-2 pe-space-2"
        >
          {@render sideCard(false)}
        </div>
      </div>
    {:else}
      {@render transcript()}
      {#if withSide}
        {@render sideSheet()}
      {/if}
    {/if}
  </div>
{/snippet}

{#snippet workspaceBody()}
  {#if region === "workspace"}
    <div class="min-h-0 flex-1 overflow-auto bg-surface-recess">
      <RegionFault
        again={stopped}
        {askCaw}
        details={DETAILS.workspace}
        {face}
        kept="Your sessions keep running on their machines."
        onretry={retry}
        todayName="workspace"
        what="your sessions"
      />
    </div>
  {:else}
    <div class="flex min-h-0 flex-1">
      {#each Array.from({ length: columns }, (_, at) => at) as at (at)}
        <div
          data-seam={at > 0 || undefined}
          class="flex min-h-0 min-w-0 flex-1 flex-col data-seam:border-s data-seam:border-border-hairline"
        >
          {@render strip()}
          {@render conversation(
            (region === "side" || region === "sheet" || region === "list") &&
              at === columns - 1
          )}
        </div>
      {/each}
    </div>
  {/if}
{/snippet}

{#snippet pageBody()}
  <div class="min-h-0 flex-1 overflow-auto">
    <RegionFault
      again={stopped}
      {askCaw}
      details={DETAILS.page}
      {face}
      onretry={retry}
      todayName="page"
      what="Routines"
    />
  </div>
{/snippet}

<!-- ---------- the window ---------- -->

<div
  data-slot="fault-fixture"
  class="relative flex h-(--frame-h) w-(--frame-w) overflow-hidden bg-surface-recess text-ink-strong"
  style:--frame-w="{width}px"
  style:--frame-h="{height}px"
>
  {#if desk}
    <aside
      class="flex w-c-sidebar-w flex-none flex-col border-e border-e-border-hairline bg-(--sidebar)"
    >
      {@render railBody()}
    </aside>
  {/if}
  <div class="flex min-w-0 flex-1 flex-col">
    {@render bar()}
    {#if region === "page"}
      {@render pageBody()}
    {:else}
      {@render workspaceBody()}
    {/if}
  </div>
  {#if !desk && region === "sidebar"}
    <!-- The rail's sheet, open from the burger, its Close the kit's. -->
    <div class="absolute inset-0 bg-scrim"></div>
    <div
      class="absolute inset-y-0 start-0 flex w-c-rail-sheet-w max-w-full flex-col bg-(--sidebar) shadow-drawer"
    >
      <div class="absolute end-space-2 top-space-2 z-1">
        <Button
          aria-label="Close navigation"
          icon={IconClose}
          size="icon-sm"
          variant="ghost"
        />
      </div>
      {@render railBody()}
    </div>
  {/if}
</div>
