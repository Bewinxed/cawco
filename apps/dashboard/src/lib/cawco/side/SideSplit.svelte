<script lang="ts">
  /**
   * A conversation and the surface beside it (PRD §5.2): the transcript in
   * one side of the resizable split (Split), and on the other, inset on the
   * preview sheet's recipe, what the conversation has to show — its plan,
   * its preview, a task one of its cards opened, a project folder's file
   * one of its chips opened, or more than one under a switch. On a desk it
   * is the split. Under 900px each rises on its own: the preview or the
   * file as a sheet standing on the composer (SideSheet), so the reader can
   * write while it is up; the plan as the house bottom sheet
   * (the kit Drawer), from the screen's foot over the composer, as tall as
   * what it holds. A task there is its own page (the project page's
   * `?task=`), never a sheet: the thread's cards link to it. A session and
   * a thread (whose plan is its project's lead's) draw it alike. A page can
   * stand its own surface there instead (`side`, a project's Caw dock): the
   * split on a desk, the kit's bottom sheet under 900px.
   *
   * The split opens when there is something to show and the reader or the
   * agent asked for it: an agent showing a preview opens it on Preview, the
   * plan's ring (`openPlan`) opens it on Plan, a task card on the task. Each
   * pane closes its own content; with nothing left the split collapses. Its
   * width and expansion are the conversation's own, kept across visits.
   */
  import type { Snippet } from "svelte";
  import { untrack } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import {
    TabItem,
    Tabs,
    TabsList,
  } from "#lib/components/ui/fluid-tabs/index.js";
  import { cawco } from "../client.svelte";
  import { dur, motionOk } from "../motion/curves.svelte";
  import PlanPane, { planShows } from "../plan/PlanPane.svelte";
  import PreviewPane from "../preview/PreviewPane.svelte";
  import RegionBoundary from "../RegionBoundary.svelte";
  import SideSheet from "./SideSheet.svelte";
  import Split from "./Split.svelte";

  type Shown = "plan" | "preview" | "task" | "file";

  let {
    viewId,
    planOf,
    previewOf,
    visible,
    active,
    phone,
    taskOpen = false,
    task,
    fileOpen = false,
    file,
    share = $bindable(0),
    side,
    sideOpen = false,
    onsideclose,
    children,
  }: {
    /** The conversation: its preview, and the key its width is kept under. */
    viewId: string;
    /** The session whose plan shows here; null when the conversation has none. */
    planOf: string | null;
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
    /** Under 900px: the surface is a sheet, not a split. */
    phone: boolean;
    /** A task one of the conversation's cards opened stands beside it (a desk only). */
    taskOpen?: boolean;
    /** The task's card, handed the switch while another surface is open too. */
    task?: Snippet<[Snippet | undefined]>;
    /**
     * A file of the project's folder one of a thread's chips opened
     * (FolderFile): beside the conversation on a desk, on the sheet over the
     * composer under 900px.
     */
    fileOpen?: boolean;
    /** The file's card, handed the switch while another surface is open too. */
    file?: Snippet<[Snippet | undefined]>;
    /** The surface's share of the width, in percent: 0 while closed or a sheet. */
    share?: number;
    /**
     * A page's own surface in place of the plan, preview and task (a
     * project's Caw dock): drawn in the split on a desk, in the kit's bottom
     * sheet under 900px (`true`: in the sheet). Open while `sideOpen`; the
     * sheet dismissed says so through `onsideclose`.
     */
    side?: Snippet<[boolean]>;
    sideOpen?: boolean;
    onsideclose?: () => void;
    /** The transcript's side. */
    children: Snippet;
  } = $props();

  let root = $state<HTMLDivElement>();
  /** The preview on show, for the sheet's Escape (its Comment mode and card). */
  let previewPane = $state<ReturnType<typeof PreviewPane>>();

  // --- what the surface holds --------------------------------------------------

  const previewId = $derived(previewOf ?? viewId);
  const previewOpen = $derived(cawco.previews[previewId]?.state === "open");
  const plan = $derived(planOf ? cawco.planOf(planOf) : undefined);
  const hasPlan = $derived(planShows(plan));
  /** The reader asked for the plan (its ring) and has not closed it. */
  let planAsked = $state(false);
  const planOpen = $derived(planAsked && hasPlan);
  const taskShown = $derived(taskOpen && !!task && !phone);
  const fileShown = $derived(fileOpen && !!file);
  const open = $derived(
    side ? sideOpen : previewOpen || planOpen || taskShown || fileShown
  );
  /** What is open, in the switch's order. */
  const opened = $derived<Shown[]>([
    ...(planOpen ? (["plan"] as const) : []),
    ...(previewOpen ? (["preview"] as const) : []),
    ...(taskShown ? (["task"] as const) : []),
    ...(fileShown && !phone ? (["file"] as const) : []),
  ]);
  let tab = $state<Shown>("plan");
  /** The one on show: the one chosen while it is open, else the newest there is. */
  const shown = $derived<Shown>(
    opened.includes(tab) ? tab : (opened.at(-1) ?? "plan")
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
  let fileWas = untrack(() => fileShown);
  $effect(() => {
    const now = fileShown;
    if (now && !fileWas) {
      tab = "file";
    }
    fileWas = now;
  });

  /** Opens the surface on the plan: the plan's ring. */
  export function openPlan(): void {
    planAsked = true;
    tab = "plan";
  }

  /** The plan is on show beside the conversation (its ring is pressed). */
  export function planShowing(): boolean {
    return planOpen && (phone || shown === "plan");
  }

  /** The surface beside the transcript, on screen or not. */
  const desktopOpen = $derived(open && !phone);

  let sheetMounted = $state(false);
  $effect(() => {
    if (phone && (previewOpen || fileShown) && visible && active) {
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
    plan: "Plan",
    preview: "Preview",
    task: "Task",
    file: "File",
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
    <TabsList aria-label="Beside the conversation">
      {#each opened as each (each)}
        <TabItem label={LABEL[each]} value={each} />
      {/each}
    </TabsList>
  </Tabs>
{/snippet}

{#snippet surface()}
  {@const switched = opened.length > 1 ? switcher : undefined}
  {#if side}
    {@render side(false)}
  {:else if shown === "task" && taskShown && task}
    {@render task(switched)}
  {:else if shown === "file" && fileShown && file}
    {@render file(switched)}
  {:else if shown === "plan" && planOf && planOpen}
    <PlanPane
      instanceId={planOf}
      onclose={() => {
        planAsked = false;
      }}
      switcher={switched}
    />
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
  {#if sheetMounted && phone && visible && active}
    <!-- One sheet on the composer: the file while one is open, else the
         preview; Escape closes the file from its own Close. -->
    <SideSheet
      content={root}
      instanceId={previewId}
      onkeyescape={(event) => {
        if (!fileShown) {
          previewPane?.parentEscape(event);
        }
      }}
      open={previewOpen || fileShown}
    >
      {#if fileShown && file}
        <RegionBoundary region="file">
          {@render file(undefined)}
        </RegionBoundary>
      {:else}
        <RegionBoundary region="preview">
          <PreviewPane
            instanceId={previewId}
            linkSession={previewId !== viewId}
            sheet
            bind:this={previewPane}
          />
        </RegionBoundary>
      {/if}
    </SideSheet>
  {/if}
  {#if side && phone && visible && active}
    <Drawer.Root
      onOpenChange={(next) => {
        if (!next) {
          onsideclose?.();
        }
      }}
      open={sideOpen}
    >
      <Drawer.Content>
        <RegionBoundary region="side sheet">
          {@render side(true)}
        </RegionBoundary>
      </Drawer.Content>
    </Drawer.Root>
  {/if}
  {#if phone && visible && active && planOf && hasPlan}
    <Drawer.Root
      onOpenChange={(next) => {
        planAsked = next;
      }}
      open={planAsked}
    >
      <Drawer.Content>
        <RegionBoundary region="plan">
          <PlanPane
            instanceId={planOf}
            onclose={() => {
              planAsked = false;
            }}
            sheet
          />
        </RegionBoundary>
      </Drawer.Content>
    </Drawer.Root>
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
