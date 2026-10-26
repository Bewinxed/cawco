<script lang="ts">
  import type { StageKind } from "@cawco/core";
  /**
   * A decision page opened in the Decisions tab's pane (Open Page Rule: in
   * place, nothing modal). Its bar is one row with no ground of its own
   * (DESIGN.md, The Title Bars Follow Liquid Glass Rule): the back symbol,
   * named "Back to Decisions", and the page's title. Its facts are content
   * under it: the ring and its figure, its state pill, and the pages it
   * links to as words ("After: …", "Unlocks: …"), each opening that page
   * here. Under them, while it
   * is picked on, the page itself, live (PageFrame); once decided, its
   * record: the cards as they were settled (RecordCard), on the page's own
   * grid. At its foot, one docked composer: a note for the session (its
   * send says the words to the session and never sends the page's picks:
   * talk is never a Send) and the page's one coral act, the next step: I'm
   * done picking, which decides it; then Make tasks, a decided page's
   * optional next step, until its tasks are filed; then none. A refusal
   * stays the page as it was and says why in the composer's line.
   */
  import { decisionsWords as words } from "@cawco/core";
  import type {
    DecisionPageRead,
    DecisionPageSummary,
  } from "@cawco/core/decisions";
  import { untrack } from "svelte";
  import { cawco } from "#lib/cawco/client.svelte.js";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import {
    appear,
    reveal,
    revealOut,
  } from "#lib/cawco/motion/curves.svelte.js";
  import TaskRing from "#lib/cawco/TaskRing.svelte";
  import FootFade from "#lib/cawco/transcript/FootFade.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { dockShellVariants } from "#lib/components/ui/dock-shell/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
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
    pageHref,
    onopentask,
    onopenpage,
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
    /** Another decision page's address in the tab. */
    pageHref: (name: string) => string;
    onopentask: (taskId: string) => void;
    /** A linked page pressed: it opens here. */
    onopenpage: (name: string) => void;
    onback: () => void;
  } = $props();

  let read = $state<DecisionPageRead | null>(null);
  let unread = $state<string | null>(null);
  const shown = $derived<DecisionPageSummary | DecisionPageRead | undefined>(
    read ?? summary
  );

  /** Reads of the page so far: only the newest one's answer is kept. */
  let reads = 0;
  async function load(page: string) {
    reads += 1;
    const ticket = reads;
    try {
      const next = await readDecision(projectId, page);
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
    cawco.decisionsChangedOf(projectId);
    cawco.tasksChangedOf(projectId);
    const page = name;
    untrack(() => load(page));
  });

  /** Its record shows while it is decided; a page its session asked again is picked on live, its record kept. */
  const decided = $derived(!!read?.record && isDecided(read));
  const working = $derived(
    !!shown?.writer && cawco.activityOf(shown.writer.instanceId) === "working"
  );
  const pill = $derived(shown ? pillOf(shown, working, false) : null);
  const figure = $derived.by(() => {
    if (!shown) {
      return "";
    }
    return decided && read?.record
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
  /**
   * What the live page keeps clear at its foot: the dock, and the foot
   * fade's dissolve over it (FootFade, `--space-8` above what it holds
   * solid), so the page's own foot (its Send picks bar) stands above the
   * fade, never under its gradient.
   */
  let pageInset = $state(0);

  // What the dock covers of the pane's foot: the page pads for it, the fade stands to it.
  $effect(() => {
    const node = dock;
    if (!node) {
      return;
    }
    const measure = () => {
      const style = getComputedStyle(node);
      const below = Number.parseFloat(style.bottom) || 0;
      dockRoom = Math.round(node.offsetHeight + below);
      pageInset =
        dockRoom +
        (Number.parseFloat(style.getPropertyValue("--space-8")) || 0);
    };
    // Read now, and a change in the next frame (frameObserver): the page
    // pads for it.
    measure();
    const watch = frameObserver(measure);
    watch.observe(node);
    return () => watch.disconnect();
  });

  /** The page's one act, the next step: Make tasks once decided, none once its tasks are filed. */
  const primary = $derived.by(() => {
    if (!shown || shown.tasks > 0) {
      return null;
    }
    if (shown.state === "picking") {
      return {
        label: words.done,
        pendingLabel: words.sending,
        act: "send" as const,
      };
    }
    return {
      label: words.makeTasks,
      pendingLabel: words.making,
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
      await load(name);
    } catch (error) {
      failed = true;
      refusal = failureWords(error);
    } finally {
      acting = false;
    }
  }

  async function sendNote() {
    const said = note.trim();
    if (!said || sendingNote) {
      return;
    }
    sendingNote = true;
    refusal = null;
    try {
      await sendDecision(projectId, name, said);
      note = "";
      await load(name);
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
    <!-- The bar: one row, no ground; the back symbol and the title. -->
    <div data-slot="page-head" class="flex flex-none items-center gap-space-2">
      <Button
        aria-label={words.back}
        class="-ms-space-2 flex-none"
        icon={IconChevronLeft}
        onclick={onback}
        size="icon-sm"
        title={words.back}
        variant="ghost"
      />
      <h2
        data-slot="title"
        class="m-0 min-w-0 type-label text-pretty wrap-anywhere text-ink-strong"
      >
        {shown?.title ?? name}
      </h2>
    </div>
    {#if shown}
      <!-- What the page stands at, as content under the bar. -->
      <div
        data-slot="page-facts"
        class="flex flex-none flex-wrap items-center gap-x-space-3 gap-y-space-2"
      >
        <span
          class="mark-line inline-flex items-center gap-space-2 text-ink-strong"
        >
          <TaskRing
            done={isDecided(shown) ? 1 : shown.picked}
            total={isDecided(shown) ? 1 : shown.cards}
          />
          <span data-slot="num" class="type-meta num text-ink-muted"
            >{figure}</span
          >
        </span>
        {#if pill}
          <StatePill
            tone={pill.tone}
            title={pill.title}
            who={pill.who}
            word={pill.word}
          />
        {/if}
        {#each [{ label: words.after, to: summary?.after ?? [], kind: "after" }, { label: words.unlocks, to: summary?.unlocks ?? [], kind: "unlocks" }] as group (group.kind)}
          {#if group.to.length > 0}
            <span class="type-meta text-pretty" data-links={group.kind}>
              <span class="text-ink-muted">{group.label}</span>
              {#each group.to as link, index (link.name)}
                <a
                  class="rounded-xs text-ink-strong underline decoration-border-control underline-offset-(--underline-offset) wrap-anywhere hover:decoration-ink-muted focus-visible:outline-(length:--focus-ring-width) focus-visible:outline-solid focus-visible:outline-focus-ring"
                  data-link-to={link.name}
                  href={pageHref(link.name)}
                  onclick={(event) => {
                    if (
                      event.metaKey ||
                      event.ctrlKey ||
                      event.shiftKey ||
                      event.altKey ||
                      event.button !== 0
                    ) {
                      return;
                    }
                    event.preventDefault();
                    onopenpage(link.name);
                  }}>{link.title}</a
                >{index < group.to.length - 1 ? ", " : ""}
              {/each}
            </span>
          {/if}
        {/each}
      </div>
    {/if}

    {#if unread && !read}
      <p class="type-body py-space-5 text-ink-muted" role="alert">
        {words.unread(unread)}
      </p>
    {:else if decided && read?.record}
      <!-- The record on the page's own grid: two across on a desk, one under;
           the cards stretch to their row, their content at its top. -->
      <div class="grid grid-cols-1 gap-space-3 wide:grid-cols-2" in:reveal>
        {#each read.record.cards as each (each.id)}
          <RecordCard card={each} {hrefOf} {onopentask} {taskOf} />
        {/each}
      </div>
    {:else if read?.artifactId}
      <PageFrame
        artifactId={read.artifactId}
        {card}
        insetBottom={pageInset}
        {projectId}
        name={read.name}
        title={read.title}
      />
    {:else if read}
      <p class="type-body py-space-5 text-ink-muted" in:reveal>{words.gone}</p>
    {:else}
      <div aria-hidden="true" class="p-space-5" out:revealOut>
        <Skeleton class="w-2/5" data-slot="block" line="body" radius="text" />
      </div>
    {/if}
  </div>

  <FootFade solid="calc({dockRoom}px)" />
  <!-- The Composer recipe, docked: 720 wide, centred, 14px above the foot;
       the pane's width under 900. -->
  <form
    data-slot="dock"
    class="absolute inset-x-0 bottom-(--dock-bottom) z-(--layer-dock) mx-auto flex w-c-composer-w max-w-full flex-col gap-space-2 max-desk:w-full"
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
    <!-- Its shell is the composer's (ui/dock-shell). The note's
         sizes stand on the shell, so the field and the twin its autosize
         measures on (motion/autosize.svelte.ts, which writes the twin's own
         style whole) inherit them alike. The phone's 16px floor is app.css's
         for every field. -->
    <div
      data-slot="cin"
      class={dockShellVariants({
        class: "flex items-end gap-space-2 p-c-composer-inset ps-space-3",
      })}
      style:--note-leading="var(--leading-ui)"
      style:--note-fs="var(--text-body)"
    >
      <Textarea
        data-note
        aria-label={words.noteLabel}
        class="flex-auto"
        look="note"
        oninput={() => {
          refusal = null;
        }}
        onkeydown={(event) => {
          if (event.key === "Enter" && !event.shiftKey && !event.isComposing) {
            event.preventDefault();
            sendNote();
          }
        }}
        placeholder={words.note}
        rows={1}
        bind:value={note}
      />
      <Button
        aria-label={words.send}
        class="flex-none"
        disabled={!note.trim()}
        icon={IconSend}
        pending={sendingNote}
        shape="inset"
        size="icon-composer"
        style="--btn-icon: var(--icon-md)"
        type="submit"
        variant="outline"
      />
      {#if primary}
        <span class="flex flex-none overflow-hidden">
          <Button
            data-primary
            {failed}
            label={primary.label}
            onclick={() => act(primary.act)}
            pending={acting || shown?.state === "making"}
            pendingLabel={primary.pendingLabel}
            shape="inset"
            size="composer"
          />
        </span>
      {/if}
    </div>
  </form>
</div>
