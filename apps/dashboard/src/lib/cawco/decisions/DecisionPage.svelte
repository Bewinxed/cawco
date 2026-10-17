<script lang="ts">
  /**
   * A decision page opened in the Decisions tab's pane (Open Page Rule: in
   * place, nothing modal). The draft-bar head: ‹ Decisions, the page's title
   * and its figure (flown from the tile), its state pill. Under it, while it
   * is picked on, the page itself, live (PageFrame); once decided, its
   * record: the cards as they were settled (RecordCard), on the page's own
   * grid. At its foot, one docked composer: a note for the session (Send)
   * and the page's one coral act, the next step: I'm done picking, then
   * Make tasks, then none. A refusal stays the page as it was and says why
   * in the composer's line.
   */
  import type {
    DecisionPageRead,
    DecisionPageSummary,
  } from "@cawco/core/decisions";
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { land } from "#lib/cawco/motion/share.svelte.js";
  import type { StageKind } from "#lib/cawco/project-tasks.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import FootFade from "#lib/cawco/transcript/FootFade.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconChevronLeft, IconSend } from "#lib/icons.js";
  import {
    makeDecisionTasks,
    readDecision,
    sendDecision,
  } from "./decisions-api";
  import PageFrame from "./PageFrame.svelte";
  import RecordCard from "./RecordCard.svelte";
  import StatePill from "./StatePill.svelte";
  import { decidedMeta, isDecided, pillOf, progressWords } from "./words";

  let {
    projectId,
    name,
    summary,
    card = null,
    now,
    taskOf,
    hrefOf,
    onopentask,
    onback,
  }: {
    projectId: string;
    name: string;
    /** The page as the list had it: the head stands at once, before its read. */
    summary: DecisionPageSummary | undefined;
    /** The card it opens scrolled to. */
    card?: string | null;
    now: number;
    taskOf: (
      id: string
    ) => { kind: StageKind | null; title: string } | undefined;
    hrefOf: (taskId: string) => string;
    onopentask: (taskId: string) => void;
    onback: () => void;
  } = $props();

  let read = $state<DecisionPageRead | null>(null);
  let unread = $state<string | null>(null);
  const shown = $derived<DecisionPageSummary | DecisionPageRead | undefined>(
    read ?? summary
  );

  /** Reads of the page so far: only the newest one's answer is kept. */
  let reads = 0;
  async function load() {
    reads += 1;
    const ticket = reads;
    try {
      const next = await readDecision(projectId, name);
      if (ticket === reads) {
        read = next;
        unread = null;
      }
    } catch (error) {
      if (ticket === reads) {
        unread = failureWords(error);
      }
    }
  }

  // Read on arrival, and again whenever the hub says its pages or tasks moved.
  $effect(() => {
    const _moves =
      cawco.decisionsChangedOf(projectId) + cawco.tasksChangedOf(projectId);
    const _page = name;
    untrack(() => load());
  });

  const decided = $derived(!!read?.record);
  const working = $derived(
    !!shown?.writer && cawco.activityOf(shown.writer.instanceId) === "working"
  );
  const pill = $derived(shown ? pillOf(shown, working, false) : null);
  const figure = $derived.by(() => {
    if (!shown) {
      return "";
    }
    return read?.record
      ? decidedMeta(shown, read.record.madeAt, now)
      : progressWords(shown);
  });

  // --- the composer ---------------------------------------------------------------

  let note = $state("");
  let sendingNote = $state(false);
  let acting = $state(false);
  let failed = $state(false);
  let refusal = $state<string | null>(null);
  let dock = $state<HTMLFormElement | null>(null);
  let dockRoom = $state(0);

  // What the dock covers of the pane's foot: the page pads for it, the fade stands to it.
  $effect(() => {
    const node = dock;
    if (!node) {
      return;
    }
    const measure = () => {
      const below = Number.parseFloat(getComputedStyle(node).bottom) || 0;
      dockRoom = Math.round(node.offsetHeight + below);
    };
    const watch = new ResizeObserver(measure);
    watch.observe(node);
    measure();
    return () => watch.disconnect();
  });

  /** The page's one act, the next step: none once decided. */
  const primary = $derived.by(() => {
    if (!shown || decided || shown.state === "decided") {
      return null;
    }
    if (shown.state === "picking") {
      return {
        label: "I'm done picking",
        pendingLabel: "Sending…",
        act: "send" as const,
      };
    }
    return {
      label: "Make tasks",
      pendingLabel: "Making tasks…",
      act: "tasks" as const,
    };
  });

  async function act(which: "send" | "tasks") {
    acting = true;
    failed = false;
    refusal = null;
    try {
      if (which === "send") {
        await sendDecision(projectId, name);
      } else {
        read = await makeDecisionTasks(projectId, name);
      }
      await load();
    } catch (error) {
      failed = true;
      refusal = failureWords(error);
    } finally {
      acting = false;
    }
  }

  async function sendNote() {
    const words = note.trim();
    if (!words || sendingNote) {
      return;
    }
    sendingNote = true;
    refusal = null;
    try {
      await sendDecision(projectId, name, words);
      note = "";
      await load();
    } catch (error) {
      refusal = failureWords(error);
    } finally {
      sendingNote = false;
    }
  }

  // A record's card named in the address stands in view once the record is drawn.
  let scroller = $state<HTMLDivElement | null>(null);
  $effect(() => {
    const target = card;
    if (!(target && decided && scroller)) {
      return;
    }
    untrack(() => {
      scroller
        ?.querySelector<HTMLElement>(`#${CSS.escape(target)}`)
        ?.scrollIntoView({ block: "start" });
    });
  });
</script>

<div class="relative flex min-h-0 flex-auto flex-col" data-slot="page-view">
  <!-- Its own stacking (isolate): nothing in it rises over the foot fade. The
       live page scrolls itself and pads for the dock (its inset): it runs
       under the dock to the pane's foot. -->
  <div
    class="flex min-h-0 flex-auto isolate flex-col gap-space-3 overflow-y-auto pb-(--scroll-pad) data-live:overflow-hidden data-live:pb-0"
    data-live={!decided || undefined}
    data-slot="page-scroll"
    style:--dock-room="{dockRoom}px"
    style:--scroll-pad="calc(var(--dock-room) + var(--space-4))"
    bind:this={scroller}
  >
    <!-- The draft-bar recipe: surface-band, a hairline inside, 12px.
         literal: inset 0 0 0 1px -->
    <div
      data-slot="page-head"
      class="flex flex-none flex-col gap-space-2 rounded-lg bg-surface-band px-space-3 py-space-2 shadow-(--head-ring)"
      style:--head-ring="inset 0 0 0 1px var(--border-hairline)"
    >
      <div class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2">
        <Button
          class="-ms-space-2 flex-none"
          onclick={onback}
          size="sm"
          variant="ghost"
        >
          <IconChevronLeft />
          <span>Decisions</span>
        </Button>
        <!-- literal: 1 1 14rem -->
        <div
          data-slot="what"
          class="flex min-w-0 flex-(--what-flex) flex-wrap items-center gap-x-space-3 gap-y-space-1"
          style:--what-flex="1 1 14rem"
        >
          <span
            data-slot="title"
            class="type-label text-ink-strong"
            data-share="dpage:{name}:title"
            {@attach land(() => `dpage:${name}:title`)}
            >{shown?.title ?? name}</span
          >
          {#if shown}
            <span
              class="mark-line inline-flex items-center gap-space-2 text-ink-strong"
              data-share="dpage:{name}:progress"
              {@attach land(() => `dpage:${name}:progress`)}
            >
              <TaskRing
                done={isDecided(shown) ? 1 : shown.picked}
                total={isDecided(shown) ? 1 : shown.cards}
              />
              <span data-slot="num" class="type-meta num text-ink-muted"
                >{figure}</span
              >
            </span>
          {/if}
          {#if pill}
            <!-- The pill ends the title's group: at the row's end on a desk,
                 and on a phone, where the group wraps, beside the figure or
                 under the title, never alone under the back button. -->
            <span class="ms-auto flex" data-box>
              <StatePill
                tone={pill.tone}
                title={pill.title}
                who={pill.who}
                word={pill.word}
              />
            </span>
          {/if}
        </div>
      </div>
    </div>

    {#if unread && !read}
      <p class="type-body m-0 py-space-5 text-ink-muted" role="alert">
        This page didn't read: {unread}
      </p>
    {:else if read?.record}
      <!-- The record on the page's own grid: two across on a desk, one under;
           the cards stretch to their row, their content at its top. -->
      <div class="grid grid-cols-1 gap-space-3 wide:grid-cols-2">
        {#each read.record.cards as each (each.id)}
          <RecordCard card={each} {hrefOf} {onopentask} {taskOf} />
        {/each}
      </div>
    {:else if read?.artifactId && read.writer}
      <PageFrame
        artifactId={read.artifactId}
        {card}
        insetBottom={dockRoom}
        instanceId={read.writer.instanceId}
        name={read.name}
        title={read.title}
      />
    {:else if read}
      <p class="type-body m-0 py-space-5 text-ink-muted">
        This page's session is gone from the hub, so the page can't be shown
        here.
      </p>
    {:else}
      <div aria-hidden="true" class="p-space-5">
        <!-- literal: 11px, 42% -->
        <span
          data-slot="block"
          class="kit-skeleton block h-(--skeleton-h) w-(--skeleton-w) rounded-xs"
          style:--skeleton-h="11px"
          style:--skeleton-w="42%"
        ></span>
      </div>
    {/if}
  </div>

  <FootFade solid="calc({dockRoom}px)" />
  <!-- The Composer recipe, docked: 720 wide, centred, 14px above the foot;
       the pane's width under 900. -->
  <form
    data-slot="dock"
    class="absolute inset-x-0 bottom-(--dock-bottom) z-20 mx-auto flex w-c-composer-w max-w-full flex-col gap-space-2 max-desk:w-full"
    style:--dock-bottom="calc(var(--space-4) + var(--safe-bottom))"
    onsubmit={(event) => {
      event.preventDefault();
      sendNote();
    }}
    bind:this={dock}
  >
    {#if refusal}
      <p
        data-slot="feedback"
        class="type-meta m-0 px-space-3 text-error-11"
        role="alert"
        in:appear
      >
        {refusal}
      </p>
    {/if}
    <!-- Its shell is the composer's (app.css `.kit-dock-shell`). -->
    <div
      data-slot="cin"
      class="kit-dock-shell flex items-end gap-space-2 p-c-composer-inset ps-space-3"
    >
      <!-- literal: 200px, 1.25, max(16px, var(--text-body)) -->
      <Textarea
        data-note
        aria-label="Add a note for the session"
        class="max-h-(--note-max-h) min-h-c-composer-field min-w-0 flex-auto border-transparent bg-transparent px-0 py-space-2 leading-(--note-leading) shadow-none coarse:text-(length:--note-fs) max-phone:text-(length:--note-fs) placeholder-shown:truncate"
        style="--note-max-h: 200px; --note-leading: 1.25; --note-fs: max(16px, var(--text-body))"
        oninput={() => {
          refusal = null;
        }}
        onkeydown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            sendNote();
          }
        }}
        placeholder="Add a note…"
        rows={1}
        bind:value={note}
      />
      <Button
        aria-label="Send"
        class="size-c-composer-field flex-none rounded-xs"
        disabled={!note.trim()}
        icon={IconSend}
        pending={sendingNote}
        size="icon"
        style="--btn-icon: 16px"
        type="submit"
        variant="outline"
      />
      {#if primary}
        <span class="flex flex-none overflow-hidden">
          <Button
            data-primary
            class="h-c-composer-field rounded-xs"
            {failed}
            label={primary.label}
            onclick={() => act(primary.act)}
            pending={acting || shown?.state === "making"}
            pendingLabel={primary.pendingLabel}
          />
        </span>
      {/if}
    </div>
  </form>
</div>
