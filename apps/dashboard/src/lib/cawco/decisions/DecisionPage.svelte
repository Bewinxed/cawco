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

<div class="page-view">
  <div
    class="page-scroll"
    data-live={!decided || undefined}
    style:--dock-room="{dockRoom}px"
    bind:this={scroller}
  >
    <div class="page-head">
      <div class="head-row">
        <Button class="back" onclick={onback} size="sm" variant="ghost">
          <IconChevronLeft />
          <span>Decisions</span>
        </Button>
        <div class="what">
          <span
            class="title"
            data-share="dpage:{name}:title"
            {@attach land(() => `dpage:${name}:title`)}
            >{shown?.title ?? name}</span
          >
          {#if shown}
            <span
              class="progress mark-line"
              data-share="dpage:{name}:progress"
              {@attach land(() => `dpage:${name}:progress`)}
            >
              <TaskRing
                done={isDecided(shown) ? 1 : shown.picked}
                total={isDecided(shown) ? 1 : shown.cards}
              />
              <span class="num">{figure}</span>
            </span>
          {/if}
          {#if pill}
            <span class="pill-end" data-box>
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
      <p class="problem" role="alert">This page didn't read: {unread}</p>
    {:else if read?.record}
      <div class="records">
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
      <p class="problem">
        This page's session is gone from the hub, so the page can't be shown
        here.
      </p>
    {:else}
      <div aria-hidden="true" class="opening">
        <span
          class="kit-skeleton block h-[11px] w-[42%] rounded-[var(--radius-xs)]"
        ></span>
      </div>
    {/if}
  </div>

  <FootFade solid="calc({dockRoom}px)" />
  <form
    class="dock"
    onsubmit={(event) => {
      event.preventDefault();
      sendNote();
    }}
    bind:this={dock}
  >
    {#if refusal}
      <p class="feedback" role="alert" in:appear>{refusal}</p>
    {/if}
    <div class="cin kit-dock-shell">
      <Textarea
        aria-label="Add a note for the session"
        class="note"
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
        class="ctl"
        disabled={!note.trim()}
        icon={IconSend}
        pending={sendingNote}
        size="icon"
        type="submit"
        variant="outline"
      />
      {#if primary}
        <span class="primary-slot">
          <Button
            class="primary"
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

<style>
  .page-view {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  .page-scroll {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    gap: var(--space-3);
    min-block-size: 0;
    padding-block-end: calc(var(--dock-room) + var(--space-4));
    overflow-y: auto;
  }
  /* The live page scrolls itself and pads for the dock (its inset): it runs
     under the dock to the pane's foot. */
  .page-scroll[data-live] {
    padding-block-end: 0;
    overflow: hidden;
  }
  /* The draft-bar recipe: surface-band, a hairline inside, 12px. */
  .page-head {
    display: flex;
    flex: none;
    flex-direction: column;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-3);
    border-radius: var(--radius-lg);
    background: var(--surface-band);
    box-shadow: inset 0 0 0 1px var(--border-hairline);
  }
  .head-row {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2) var(--space-3);
  }
  .head-row :global(.back) {
    flex: none;
    margin-inline-start: calc(var(--space-2) * -1);
  }
  .what {
    display: flex;
    flex: 1 1 14rem;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-1) var(--space-3);
    min-inline-size: 0;
  }
  .title {
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .progress {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    color: var(--ink-strong);
  }
  .num {
    font: var(--type-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  /* The pill ends the title's group: at the row's end on a desk, and on a
     phone, where the group wraps, beside the figure or under the title,
     never alone under the back button. */
  .pill-end {
    display: flex;
    margin-inline-start: auto;
  }
  /* The record on the page's own grid: two across on a desk, one under; the
     cards stretch to their row, their content at its top. */
  .records {
    display: grid;
    grid-template-columns: minmax(0, 1fr);
    gap: var(--space-3);
  }
  @media (min-width: 1024px) {
    .records {
      grid-template-columns: repeat(2, minmax(0, 1fr));
    }
  }
  .opening {
    padding: var(--space-5);
  }
  .problem {
    margin: 0;
    padding: var(--space-5) 0;
    font: var(--type-body);
    color: var(--ink-muted);
  }
  /* The Composer recipe, docked: 720 wide, centred, 14px above the foot;
     the pane's width under 900. */
  .dock {
    position: absolute;
    inset-inline: 0;
    inset-block-end: calc(var(--space-4) + var(--safe-bottom));
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    inline-size: var(--c-composer-w);
    max-inline-size: 100%;
    margin-inline: auto;
  }
  /* Its shell is the composer's (app.css `.kit-dock-shell`). */
  .cin {
    display: flex;
    align-items: flex-end;
    gap: var(--space-2);
    padding: var(--c-composer-inset) var(--c-composer-inset)
      var(--c-composer-inset) var(--space-3);
  }
  .cin :global(.note) {
    flex: 1 1 auto;
    min-inline-size: 0;
    min-block-size: var(--c-composer-field);
    max-block-size: 200px;
    padding-block: 7px;
    padding-inline: 0;
    border-color: transparent;
    background: transparent;
    box-shadow: none;
    line-height: 1.25;
  }
  .cin :global(.note:placeholder-shown) {
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .cin :global(.ctl) {
    --btn-icon: 16px;
    flex: none;
    inline-size: var(--c-composer-field);
    block-size: var(--c-composer-field);
    border-radius: var(--radius-xs);
  }
  .primary-slot {
    display: flex;
    flex: none;
    overflow: hidden;
  }
  .primary-slot :global(.primary) {
    block-size: var(--c-composer-field);
    border-radius: var(--radius-xs);
  }
  .feedback {
    margin: 0;
    padding-inline: var(--space-3);
    font: var(--type-meta);
    color: var(--error-11);
  }
  @media (pointer: coarse), (max-width: 639px) {
    .cin :global(.note) {
      font-size: max(16px, var(--text-body));
    }
  }
  @media (max-width: 899px) {
    .dock {
      inline-size: 100%;
    }
  }
</style>
