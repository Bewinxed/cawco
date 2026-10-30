<script lang="ts">
  /**
   * A fixture for the failure-state proposal (fault/RegionFault): the
   * dashboard's shell at one width, drawn from the tokens, with one part
   * stopped on a render error and everything outside that part standing
   * and working. The side card is the real SideSurface (its head, switch,
   * Expand and Close) and its Close works; the rest of the shell is a
   * stand-in at its real size. The records are the night he saw it
   * (2026-10-30, Cawco-Dev): the conversation "Orchestrate CawCo after
   * handover", Caw's turn and his message as they were said, and the
   * goo-card preview, its page as drawn with its pins and its four comments
   * as the hub keeps them (goo-card.pins.json), comment 4 carrying the same
   * picture twice. In the List frames the real Comments rail is given those
   * comments, and on this branch (before 3e15600b6) it throws the real
   * each_key_duplicate, caught by a real boundary. Try again rebuilds it and
   * it throws again, so the face turns to its Reload page form, live.
   *
   * Regions: `side` the card beside a conversation (the split from a 900px
   * pane, the sheet under it), `sheet` the preview sheet in a pane under
   * 900px (a desk's narrow column, a phone), `sidebar` the project tree in
   * the rail or its sheet, `tabs` a group's strip, `page` a route's page,
   * `workspace` the sessions' surface, `list` one list inside the side card
   * (the Comments rail's rows, where the duplicate key threw).
   */
  import type { Pin } from "@cawco/core/comments";
  import { sideWords } from "@cawco/core/words/side";
  import CommentRail from "#lib/cawco/preview/CommentRail.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import {
    IconClose,
    IconFiles,
    IconFolder,
    IconPaperclip,
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
  import gooPins from "./goo-card.pins.json";
  import gooCard from "./goo-card.png";

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
  /** The side card's Close, live: it puts the preview away. */
  let closed = $state(false);
  /** The real rail's boundary was tried again and threw again. */
  let railTried = $derived(again);
  const PINS = gooPins as unknown as Pin[];
  const messageOf = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  const desk = $derived(width >= 901);
  const phone = $derived(width < 640);
  /** The pane holding the side card, as the shell lays it out. */
  const pane = $derived(
    ((desk ? width - 228 : width) - (columns - 1) * 1) / columns
  );
  const split = $derived(pane >= 900);
  const today = $derived(face === "today");

  /**
   * What each part says under Show details. The side card's is the error he
   * hit, as Svelte words it in a dev build; the other parts have never
   * failed, so theirs show the shape such an error takes there.
   */
  const DETAILS = {
    side: "each_key_duplicate\nKeyed each block has duplicate key `/api/files/2e7a7e2fdcf6cbb62ab7ef11c442e40c1a86d93c7c45a543dbd3625db6167b05` at indexes 0 and 1\nhttps://svelte.dev/e/each_key_duplicate",
    sidebar:
      "TypeError: Cannot read properties of undefined (reading 'hue')\n    in ProjectMark.svelte\n    in ProjectTree.svelte\n    in Sidebar.svelte",
    tabs: "Svelte error: each_key_duplicate\nKeyed each block has duplicate key `obelisk:8f2c1a` at indexes 1 and 4\n    in PaneTabs.svelte",
    page: "TypeError: Cannot read properties of null (reading 'nextRun')\n    in RoutineRow.svelte\n    in routines/+page.svelte",
    workspace:
      "RangeError: Invalid time value\n    at formatAge (age.ts:14)\n    in SessionSurface.svelte",
  };

  /** Cawco-Dev's sessions that night, as the rail named them. */
  const SESSIONS = [
    { title: "Orchestrate CawCo after handover", on: true },
    { title: "Fix side panel duplicate key crash", on: false },
    { title: "Fix goo card double neck on scroll", on: false },
    { title: "Stop skill loads failing busy delegates", on: false },
  ];
  const TABS = SESSIONS.slice(0, 3).map((session) => session.title);
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
      {#each ["Cawco-Dev"] as project, at (project)}
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
  <!-- Caw's turn and his reply, word for word (2026-10-30 21:17Z); the
       latest stands at the composer, older turns run up under the strip. -->
  <div
    class="flex min-h-0 flex-1 flex-col justify-end gap-space-4 overflow-hidden bg-tab-sheet px-space-6 pb-space-4 max-desk:px-space-5"
  >
    <p
      class="m-0 max-w-c-measure type-body text-ink-strong text-pretty wrap-anywhere"
    >
      Agreed, and the goo fix won't do that. The card is drawn twice: an
      outline, and a shadowed copy underneath. Only the outline was redrawn as
      you scrolled, so the copy kept the old neck where the pin used to be.
    </p>
    <p
      class="m-0 max-w-c-measure type-body text-ink-strong text-pretty wrap-anywhere"
    >
      I've told the goo fix (<span class="text-link-ink"
        >Fix goo card double neck on scroll</span
      >) that the fix is a single shape for both, so the copy can't drift. It
      must not copy the copy into place from script, and nothing may keep a
      frame loop running to hide the problem. It checks the fix by scrolling the
      page with real wheel steps, not by setting values in code. I've answered
      <span class="text-link-ink">Whole page</span>.
    </p>
    <p
      class="m-0 max-w-c-measure type-body text-ink-strong text-pretty wrap-anywhere"
    >
      The side panel crash: your console shows a list that got two items with
      the same key. <span class="text-link-ink"
        >Fix side panel duplicate key crash</span
      > is rebuilding tonight's version, 6205, to map that stack to the exact list.
      It will then fix whatever put the duplicate there, rather than change the key.
      A likely lead: your goo comment is recorded with the same picture attached twice.
    </p>
    <p
      class="m-0 max-w-c-measure type-body text-ink-strong text-pretty wrap-anywhere"
    >
      The new decision-page designer was stopped by a hub bug, not by its own
      work. The skills I gave it arrived as separate messages after the brief.
      It answered each with &quot;still waiting&quot;, and the hub counted three
      of those replies as a stuck session and stopped it. I've restarted it with
      the same brief.
    </p>
    <p
      class="m-0 max-w-c-measure type-body text-ink-strong text-pretty wrap-anywhere"
    >
      Since you were last here, nightly 6205 is installed on all four machines.
      Your earlier picks are still waiting on the pages listed under &quot;Since
      21:48&quot; in my plan.
    </p>
    <div
      class="flex max-w-c-measure-short flex-col gap-space-2 self-end rounded-lg bg-surface-recess px-space-4 py-space-3"
    >
      <p class="m-0 type-body text-ink-strong text-pretty wrap-anywhere">
        and why is this error boundary shown like this? indismissable,
        irrecoverable, and not on brand :/
      </p>
      <p
        class="mark-line m-0 flex min-w-0 items-center gap-space-1 type-meta text-ink-muted"
      >
        <IconPaperclip class="size-icon-sm flex-none" data-box /><span
          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
          >picture-7a32193cc7e1.png</span
        >
      </p>
    </div>
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
  <!-- The previewed page as it was drawn, with its pins: goo-card, at its
       own scale and cut by the well, as a page wider than the well is. -->
  <img
    alt="goo-card: How a comment opens, with pins 1, 2 and 3"
    class="block w-auto max-w-none flex-none self-start"
    src={gooCard}
  />
{/snippet}

{#snippet railHead()}
  <!-- The rail's own floating group, which outlives its rows. -->
  <div class="flex items-center justify-end gap-space-1">
    <Button aria-label="Sort" icon={IconSort} size="icon-sm" variant="ghost" />
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
{/snippet}

{#snippet rail(layout: "beside" | "sheet")}
  <!-- The real rail, given goo-card's four comments as the hub keeps them.
       Comment 4 carries one picture twice, so its strip's keyed each throws
       (CommentRail.svelte:392) and this boundary holds it: the rail's
       group, its search and the page beside it keep working. -->
  <svelte:boundary>
    <CommentRail
      down={null}
      focused={null}
      hold="ready"
      {layout}
      live={new Set()}
      onclose={() => undefined}
      onhover={() => undefined}
      onopen={() => undefined}
      onpage={() => undefined}
      onresolve={() => undefined}
      onretry={() => undefined}
      onretrypin={() => undefined}
      open={null}
      pins={PINS}
      unread={new Set()}
    />
    {#snippet failed(thrown, reset)}
      <div
        data-beside={layout === "beside" || undefined}
        class="flex min-w-0 flex-1 flex-col gap-space-2 p-space-2 data-beside:w-c-comments-w data-beside:flex-none"
      >
        {@render railHead()}
        <RegionFault
          again={railTried}
          details={messageOf(thrown)}
          face="line"
          onretry={() => {
            railTried = true;
            reset();
          }}
          what="the comments"
        />
      </div>
    {/snippet}
  </svelte:boundary>
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
      onclose={() => {
        closed = true;
      }}
      {switcher}
      title="goo-card"
      beside={listOnly && !sheet ? railBeside : undefined}
    >
      {#if listOnly}
        {@render page()}
        {#if sheet}
          <!-- The rail is the well's foot sheet on a narrow pane, at most
               60% of the well, a layer over the page. -->
          <div
            class="absolute inset-x-0 bottom-0 z-2 flex max-h-3/5 rounded-t-lg border-t border-border-hairline bg-surface-raised"
          >
            {@render rail("sheet")}
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

{#snippet railBeside()}
  {@render rail("beside")}
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
    {#if withSide && split && !closed}
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
      {#if withSide && !closed}
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
