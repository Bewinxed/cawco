<script lang="ts">
  /**
   * A conversation and the surface beside it (PRD §5.2): the transcript in
   * one side of the resizable split (Split), and on the other, inset on the
   * preview sheet's recipe, what the conversation has to show — its
   * preview, a task one of its cards opened, or both under a switch. On a
   * desk and at an iPad's regular width it is the split. On a phone, or in
   * a desk's pane under 900px (layoutPolicy.sideDrawer), the preview rises
   * as a sheet (SideSheet): on a phone over the composer, which it covers
   * while it is up; in the desk's narrow pane standing on it, so the mouse
   * can write while it is up. A task there is its own page (the project page's
   * `?task=`), never a sheet. The plan is not here: its ring is the composer's, so it opens
   * as a layer of the composer over the transcript (plan/PlanPane), never
   * beside it.
   *
   * The split opens when there is something to show and the reader or the
   * agent asked for it: an agent showing a preview opens it on Preview, a
   * task card on the task. Each
   * pane closes its own content; with nothing left the split collapses. Its
   * width and expansion are the conversation's own, kept across visits.
   */
  import { sideWords } from "@cawco/core/words/side";
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { cawco, closePreview } from "../client.svelte";
  import { dur, motionOk } from "../motion/curves.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";
  import RegionBoundary from "../RegionBoundary.svelte";
  import { besideOf, putAway } from "../tasks/beside.svelte";
  import FailedSurface from "./FailedSurface.svelte";
  import SideSheet from "./SideSheet.svelte";
  import Split from "./Split.svelte";

  type Shown = "preview" | "task";

  let {
    viewId,
    visible,
    active,
    phone,
    taskOpen = false,
    task,
    share = $bindable(0),
    children,
  }: {
    /** The conversation: its preview, and the key its width is kept under. */
    viewId: string;
    /**
     * The conversation is its group's active tab. A phone's sheet is laid
     * over the whole screen, outside the pane, so only the active tab's
     * stands there; a neighbour the swipe strip keeps shown has none.
     */
    active: boolean;
    visible: boolean;
    /**
     * The surface is a sheet, not a split (layoutPolicy.sideDrawer): a phone,
     * or a fine pointer's pane under 900px; an iPad's regular width splits a
     * pane 640px or wider. `null` until the pane is measured: neither the
     * split nor a sheet opens before it is known which one the pane asks for.
     */
    phone: boolean | null;
    /** A task one of the conversation's cards opened stands beside it (a desk only). */
    taskOpen?: boolean;
    /** The task's card, handed the switch while another surface is open too. */
    task?: Snippet<[Snippet | undefined]>;
    /** The surface's share of the width, in percent: 0 while closed or a sheet. */
    share?: number;
    /** The transcript's side. */
    children: Snippet;
  } = $props();

  let root = $state<HTMLDivElement>();
  /** The preview on show, for the sheet's Escape (its Comment mode and card). */
  let previewPane = $state<ReturnType<typeof PreviewPane>>();

  // --- what the surface holds --------------------------------------------------

  const previewOpen = $derived(cawco.previews[viewId]?.state === "open");
  const taskShown = $derived(taskOpen && !!task && phone === false);
  const open = $derived(previewOpen || taskShown);
  /** What is open, in the switch's order. */
  const opened = $derived<Shown[]>([
    ...(previewOpen ? (["preview"] as const) : []),
    ...(taskShown ? (["task"] as const) : []),
  ]);
  let tab = $state<Shown>("preview");
  /** The one on show: the one chosen while it is open, else the newest there is. */
  const shown = $derived<Shown>(
    opened.includes(tab) ? tab : (opened.at(-1) ?? "preview")
  );
  // An agent showing a preview brings it to the front; so does a task card.
  let previewWas = untrack(() => previewOpen);
  $effect(() => {
    const now = previewOpen;
    if (now && !previewWas) {
      tab = "preview";
    }
    previewWas = now;
  });
  let taskWas = untrack(() => taskShown);
  $effect(() => {
    const now = taskShown;
    if (now && !taskWas) {
      tab = "task";
    }
    taskWas = now;
  });

  /** The surface beside the transcript, on screen or not: a measured pane that splits. */
  const desktopOpen = $derived(open && phone === false);

  /**
   * The sheet stays mounted while its conversation's tab is off screen,
   * closed (SideSheet), so its preview keeps its page as a desk's split
   * does (preview/loaded.svelte.ts holds or unloads it); only the sheet of
   * the tab in front is open.
   */
  let sheetMounted = $state(false);
  const sheetOpen = $derived(previewOpen && visible && active);
  $effect(() => {
    if (phone && previewOpen) {
      sheetMounted = true;
      return;
    }
    const timer = setTimeout(
      () => {
        sheetMounted = false;
      },
      motionOk.current ? dur("--dur-panel") : 1
    );
    return () => clearTimeout(timer);
  });

  const LABEL: Record<Shown, string> = {
    preview: sideWords.preview,
    task: sideWords.task,
  };

  /** What a failed card's head names (FailedSurface): the artifact, or the task's id where no switch says Task. */
  function failedTitle(what: Shown, switched: boolean): string | undefined {
    if (what === "task") {
      return switched ? undefined : besideOf(viewId)?.taskId;
    }
    const preview = cawco.previews[viewId];
    return preview?.artifact?.name ?? preview?.title;
  }
  /** A failed card's Close: what was on show goes, as its own Close puts it away. */
  const closeFailed = (what: Shown) =>
    what === "task" ? putAway(viewId) : closePreview(viewId);
</script>

<!-- The switch, while more than one has something to show. -->
{#snippet switcher()}
  <Tabs
    onValueChange={(next) => {
      tab = next as Shown;
    }}
    size="compact"
    value={shown}
  >
    <TabsList aria-label={sideWords.label}>
      {#each opened as each (each)}
        <TabItem label={LABEL[each]} value={each} />
      {/each}
    </TabsList>
  </Tabs>
{/snippet}

{#snippet surface()}
  {@const switched = opened.length > 1 ? switcher : undefined}
  {#if shown === "task" && taskShown && task}
    {@render task(switched)}
  {:else if previewOpen}
    <PreviewPane
      instanceId={viewId}
      onScreen={visible}
      switcher={switched}
      bind:this={previewPane}
    />
  {/if}
{/snippet}

<!-- What stood beside the conversation, stopped on a render error: its
     card's switch, name and Close outlive it, round its face (RegionBoundary,
     FailedSurface). A press on the switch builds the other one afresh. -->
{#snippet bounded()}
  {@const switched = opened.length > 1 ? switcher : undefined}
  {#key shown}
    <RegionBoundary part={shown}>
      {@render surface()}
      {#snippet chrome(face)}
        <FailedSurface
          onclose={() => closeFailed(shown)}
          switcher={switched}
          title={failedTitle(shown, !!switched)}
          what={shown}
        >
          {@render face()}
        </FailedSurface>
      {/snippet}
    </RegionBoundary>
  {/key}
{/snippet}

{#snippet sheets()}
  {#if sheetMounted && phone}
    <!-- The preview's sheet on the composer. Off screen it stays, closed,
         with its page held. -->
    <SideSheet
      content={root}
      instanceId={viewId}
      onkeyescape={(event) => previewPane?.parentEscape(event)}
      open={sheetOpen}
    >
      <RegionBoundary part="preview">
        <PreviewPane
          instanceId={viewId}
          onScreen={visible && active}
          sheet
          bind:this={previewPane}
        />
        {#snippet chrome(face)}
          <FailedSurface
            onclose={() => closeFailed("preview")}
            title={failedTitle("preview", false)}
            what="preview"
          >
            {@render face()}
          </FailedSurface>
        {/snippet}
      </RegionBoundary>
    </SideSheet>
  {/if}
{/snippet}

<Split
  {active}
  after={sheets}
  backLabel="Back to conversation"
  keys={{
    width: `cawco.preview.width.${viewId}`,
    expanded: `cawco.preview.expanded.${viewId}`,
  }}
  landKey="preview:{viewId}"
  main={children}
  onescape={(event) => previewPane?.parentEscape(event)}
  open={desktopOpen}
  side={bounded}
  {visible}
  bind:root
  bind:share
/>
