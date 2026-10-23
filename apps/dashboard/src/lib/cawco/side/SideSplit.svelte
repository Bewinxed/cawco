<script lang="ts">
  /**
   * A conversation and the surface beside it (PRD §5.2): the transcript in
   * one side of the resizable split (Split), and on the other, inset on the
   * preview sheet's recipe, what the conversation has to show — its
   * preview, a task one of its cards opened, or both under a switch. On a
   * desk and at an iPad's regular width it is the split. On a phone, or in
   * a desk's pane under 900px (layoutPolicy.sideDrawer), the preview rises
   * as a sheet standing on the composer (SideSheet), so the reader can
   * write while it is up. A task there is its own page (the project page's
   * `?task=`), never a sheet: the thread's cards link to it, as a thread's
   * file chips link to the page's `?file=`. A session and a thread draw it
   * alike. The plan is not here: its ring is the composer's, so it opens
   * as a layer of the composer over the transcript (plan/PlanPane), never
   * beside it.
   *
   * The split opens when there is something to show and the reader or the
   * agent asked for it: an agent showing a preview opens it on Preview, a
   * task card on the task. Each
   * pane closes its own content; with nothing left the split collapses. Its
   * width and expansion are the conversation's own, kept across visits.
   */
  import { sideWords } from "@cawco/core";
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { cawco } from "../client.svelte";
  import { dur, motionOk } from "../motion/curves.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";
  import RegionBoundary from "../RegionBoundary.svelte";
  import SideSheet from "./SideSheet.svelte";
  import Split from "./Split.svelte";

  type Shown = "preview" | "task";

  let {
    viewId,
    previewOf,
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
     * The session whose preview shows here, when it is not the conversation
     * itself: a thread shows its project's lead's (his setup page).
     */
    previewOf?: string | null;
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

  const previewId = $derived(previewOf ?? viewId);
  const previewOpen = $derived(cawco.previews[previewId]?.state === "open");
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
      instanceId={previewId}
      linkSession={previewId !== viewId}
      onScreen={visible}
      switcher={switched}
      bind:this={previewPane}
    />
  {/if}
{/snippet}

<!-- A render error in what stands beside the conversation stays there: a
     worded line with Try again, the conversation working (RegionBoundary). -->
{#snippet bounded()}
  <RegionBoundary region="side panel">{@render surface()}</RegionBoundary>
{/snippet}

{#snippet sheets()}
  {#if sheetMounted && phone}
    <!-- The preview's sheet on the composer. Off screen it stays, closed,
         with its page held. -->
    <SideSheet
      content={root}
      instanceId={previewId}
      onkeyescape={(event) => previewPane?.parentEscape(event)}
      open={sheetOpen}
    >
      <RegionBoundary region="preview">
        <PreviewPane
          instanceId={previewId}
          linkSession={previewId !== viewId}
          onScreen={visible && active}
          sheet
          bind:this={previewPane}
        />
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
