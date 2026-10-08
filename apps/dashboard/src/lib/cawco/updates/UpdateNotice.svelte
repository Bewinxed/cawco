<script lang="ts">
  /**
   * The one update notice: Caw at 48 on the leading edge, a title, the lines
   * that matter, and at most two buttons. It is a custom toast under one id,
   * so every state replaces the last in the same box. The box here is
   * presentation only: what to say comes from `noticeFor`, what the buttons
   * do from the caller.
   *
   * A build's notes show as their summary (the first section's first
   * bullets) and, when there are more, the toast opens in place to all of
   * them, as Family's trays do (https://benji.org/family-values): Caw and
   * the title hold their place and only the notes grow, the box's height
   * morphs, the rows it gains fly in on the list switch's stagger, and the
   * close glyph turns into the back chevron: the one way to close them
   * again (Family's one icon for one job). "Show all N changes" opens them
   * and is gone while they stand open. Esc closes them too.
   *
   * Reload turns the box into its goodbye (./goodbye): Caw, where he
   * stood, waiting on his `loading`, beside "See you in a bit", and nothing
   * else, until the tab goes. The height morphs, the notes and footer leave
   * on the list switch's exit while the line arrives; nothing of the notice
   * is shown after, so what the acknowledgement changes upstream never
   * reaches the box.
   */
  import { tick, untrack } from "svelte";
  import { fade } from "svelte/transition";
  import { dur, ease, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { ListSwap } from "#lib/cawco/motion/list-swap.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import CloseBack from "#lib/components/icons/CloseBack.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconError } from "#lib/icons.js";
  import Caw, { type CawStatus } from "../home/Caw.svelte";
  import CawMark from "../home/CawMark.svelte";
  import { arrive, GOODBYE, leaveInPlace } from "./goodbye";
  import type { Notice } from "./model";
  import ReleaseNotes from "./ReleaseNotes.svelte";
  import { updates } from "./updates.svelte";

  let {
    view,
    onaction,
    ondismiss,
    onsettle,
    closeToast,
  }: {
    /** Read through, so the mounted box follows when the notice changes. */
    view: { notice: Notice; onPage: boolean };
    onaction: (action: NonNullable<Notice["action"]>) => void;
    ondismiss: () => void;
    /**
     * The box stands at a new height, whatever changed it (another notice,
     * a line more or less, the notes opening or closing, the goodbye), its
     * morph run: a toaster that stacks by stored heights measures it again
     * here (`remeasure`).
     */
    onsettle?: (height: number) => void;
    /** Sonner's own, given to a custom toast. */
    closeToast?: () => void;
  } = $props();

  const notice = $derived(view.notice);
  /** Reload was chosen: the box says its goodbye until the tab goes. */
  let leaving = $state(false);
  /** The kind Caw stood for then, so a notice changing under the goodbye never swaps him. */
  let leftKind = $state<number | null>(null);
  const cawKind = $derived(leftKind ?? notice.kind);
  let layer = $state<HTMLElement>();

  function act(action: NonNullable<Notice["action"]>): void {
    if (action === "reload") {
      sayGoodbye();
    }
    onaction(action);
  }

  /** Everything but Caw leaves where it stood, and the box turns into its goodbye. */
  function sayGoodbye(): void {
    if (noticeBox && layer) {
      const away = layer;
      leaveInPlace(
        [...noticeBox.children].filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement &&
            child !== away &&
            !child.matches(".caw")
        ),
        away
      );
    }
    leftKind = notice.kind;
    leaving = true;
  }

  // The tab reloading by itself, idle, says the same goodbye.
  $effect(() => {
    if (updates.goodbye && !leaving) {
      untrack(sayGoodbye);
    }
  });
  const status = $derived(notice.caw.status as CawStatus);
  /** The first busy line takes the one spinner; the rest are plain words. */
  const spinnerAt = $derived(notice.lines.findIndex((l) => l.state === "busy"));

  const notes = $derived(notice.notes ?? null);
  /** The notes hold more than their summary, so the toast opens to them. */
  const opens = $derived(notes !== null && notes.count > notes.shown);
  /** The notice the toast stands open on; a notice that replaces it opens closed. */
  let openOn = $state<string | null>(null);
  const shownKey = $derived(`${notice.kind}:${notice.version}`);
  const open = $derived(opens && openOn === shownKey);
  const notesId = $props.id();
  let notesBox = $state<HTMLElement>();
  let noticeBox = $state<HTMLElement>();
  let closeButton = $state<HTMLButtonElement>();
  let moreButton = $state<HTMLButtonElement>();
  /** Bumped on every size change, so only the last one reports it settled. */
  let turn = 0;
  /** The height last reported, so an unchanged one is not reported again. */
  let reported = -1;

  /** Resolves once no tween is left on `box`, waiting again on one that restarted. */
  async function still(box: HTMLElement | undefined): Promise<void> {
    const tweens = box?.getAnimations() ?? [];
    if (tweens.length === 0) {
      return;
    }
    await Promise.allSettled(tweens.map((tween) => tween.finished));
    await still(box);
  }

  /** The rows of the notes: each section's heading and each bullet. */
  const ROWS = "h1, h2, h3, h4, h5, h6, li";

  /**
   * Once the box's morph has run (or at once, with nothing to run), says
   * the height it stands at. The morph starts in the microtask after the
   * content changes, so a frame later it is on the box. It can start again
   * on the way: a later change cancels the tween in flight (its `finished`
   * settles) and tweens on from where it stood. So the box is waited on
   * until no tween is left on it.
   */
  async function settle(): Promise<void> {
    turn += 1;
    const mine = turn;
    await new Promise((done) => requestAnimationFrame(done));
    await still(noticeBox);
    if (mine !== turn || !noticeBox) {
      return;
    }
    const height = Math.round(noticeBox.getBoundingClientRect().height);
    if (height !== reported) {
      reported = height;
      onsettle?.(height);
    }
  }

  // Every change of the box's size, from any cause, settles and is reported:
  // svelte-sonner stores a toast's height only when it mounts or its words
  // change, and stacks the toasts behind by what it stored.
  $effect(() => {
    const box = noticeBox;
    if (!(box && onsettle)) {
      return;
    }
    const sized = new ResizeObserver(() => {
      // biome-ignore lint/complexity/noVoid: settling reports through onsettle
      void settle();
    });
    sized.observe(box);
    return () => sized.disconnect();
  });

  /**
   * Opens or closes the notes. The box's height follows by itself (`morph`
   * hears the notes change); opening, the rows past the summary's fly in.
   * With reduced motion the notes cross-fade instead.
   */
  async function setOpen(next: boolean): Promise<void> {
    if (next === open) {
      return;
    }
    const had = notesBox?.querySelectorAll(ROWS).length ?? 0;
    // "Show all" leaves as the notes open and the chevron is the way back,
    // so the keyboard's place moves between the two.
    const focused = document.activeElement;
    openOn = next ? shownKey : null;
    await tick();
    if (next && focused === moreButton) {
      closeButton?.focus();
    } else if (!next && focused === closeButton) {
      moreButton?.focus();
    }
    const box = notesBox;
    if (!box) {
      return;
    }
    if (!motionOk.current) {
      box.animate([{ opacity: 0 }, { opacity: 1 }], {
        duration: dur("--dur-fade"),
        easing: ease("--ease-out"),
      });
    } else if (next) {
      ListSwap.reveal([...box.querySelectorAll(ROWS)].slice(had));
    }
  }
</script>

<svelte:window
  onkeydown={(event) => {
    if (open && !leaving && event.key === "Escape" && !event.defaultPrevented) {
      event.preventDefault();
      // biome-ignore lint/complexity/noVoid: closing reports nothing back
      void setOpen(false);
    }
  }}
/>

<div class="notice" role="status" bind:this={noticeBox} {@attach morph()}>
  {#key cawKind}
    <div
      aria-hidden="true"
      class="caw"
      in:fade={{ duration: dur("--dur-fade"), delay: dur("--dur-fade") }}
      out:fade={{ duration: dur("--dur-fade") }}
    >
      {#if leaving}
        <!-- His wait: the page can't show its content until the tab is back. -->
        {#if motionOk.current}
          <Caw size={48} status="loading" />
        {:else}
          <CawMark size={48} status="loading" />
        {/if}
      {:else if notice.caw.moves && motionOk.current}
        <Caw size={48} {status} />
      {:else}
        <CawMark size={48} {status} />
      {/if}
    </div>
  {/key}

  <!-- What the box showed, copied where it stood, leaving (./goodbye). -->
  <div aria-hidden="true" class="leaving" inert bind:this={layer}></div>

  {#if leaving}
    <span class="bye" {@attach arrive}>{GOODBYE}</span>
  {:else}
    <div class="title">
      {#key notice.kind}
        <span
          class="words"
          in:fade={{ duration: dur("--dur-fade") }}
          out:fade={{ duration: dur("--dur-exit") }}
        >
          {#if notice.failed}
            <IconError class="fail size-4 shrink-0" />
          {/if}
          {notice.title}
        </span>
      {/key}
    </div>
    <!-- One icon, two roles: it dismisses the notice, and while the notes
       stand open it is the way back to their summary. -->
    <button
      aria-controls={open ? notesId : undefined}
      aria-expanded={open ? true : undefined}
      aria-label={open ? "Back to the summary" : "Dismiss"}
      class="x touch-hit pointer-hit"
      onclick={() => {
        if (open) {
          // biome-ignore lint/complexity/noVoid: closing reports nothing back
          void setOpen(false);
          return;
        }
        ondismiss();
        closeToast?.();
      }}
      type="button"
      bind:this={closeButton}
    >
      <CloseBack back={open} class="size-3" />
    </button>

    {#if notes}
      <!-- A click anywhere on the summary opens it, as a convenience for the
         pointer; the keyboard's way is the button under it. -->
      <!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
      <!-- biome-ignore lint/a11y: the pointer's shortcut; the "Show all" button under it is the keyboard's and the screen reader's -->
      <div
        aria-live="off"
        class="notes"
        id={notesId}
        onclick={() => {
          if (opens && !open) {
            // biome-ignore lint/complexity/noVoid: opening reports nothing back
            void setOpen(true);
          }
        }}
        bind:this={notesBox}
        class:open
        class:opens
      >
        <ReleaseNotes source={open ? notes.full : notes.summary} />
      </div>
      {#if opens && !open}
        <button
          aria-controls={notesId}
          aria-expanded="false"
          class="more touch-hit pointer-hit"
          onclick={() => setOpen(true)}
          type="button"
          bind:this={moreButton}
        >
          Show all {notes.count} changes
        </button>
      {/if}
    {/if}

    {#if notice.lines.length > 0 || notice.closing}
      <div class="body">
        {#each notice.lines as line, i (i)}
          {#if line.state === "busy" && i === spinnerAt}
            <div class="ink busy">
              <Spinner class="size-3.5 shrink-0 text-muted-foreground" />
              {line.text}
            </div>
          {:else}
            <div class="ink">{line.text}</div>
          {/if}
        {/each}
        {#if notice.closing}
          <span class="closing">{notice.closing}</span>
        {/if}
      </div>
    {/if}

    {#if (notice.configure && !view.onPage) || notice.action}
      <div class="buttons">
        {#if notice.configure && !view.onPage}
          <Button class="quiet" href="/config/updates" size="sm" variant="ghost"
            >Configure update behaviour</Button
          >
        {/if}
        {#if notice.action === "retry"}
          <Button
            class="primary"
            label="Retry"
            onclick={() => act("retry")}
            size="sm"
          />
        {:else if notice.action === "install-all"}
          <Button
            class="primary"
            label="Install now"
            onclick={() => act("install-all")}
            size="sm"
          />
        {:else if notice.action === "reload"}
          <Button
            class="primary"
            label="Reload"
            onclick={() => act("reload")}
            size="sm"
          />
        {/if}
      </div>
    {/if}
  {/if}
</div>

<style>
  .notice {
    position: relative;
    display: grid;
    grid-template-columns: 48px 1fr;
    column-gap: var(--space-3);
    row-gap: 2px;
    inline-size: 100%;
    padding: 12px 14px;
    border: 1px solid var(--border-hairline);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-overlay);
    color: var(--ink-strong);
    font: var(--type-body);
    overflow: hidden;
  }
  @media (min-width: 640px) {
    .notice {
      inline-size: 356px;
    }
  }
  .caw {
    grid-row: 1 / 4;
    grid-column: 1;
    inline-size: 48px;
    block-size: 48px;
  }
  .leaving {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  /* The goodbye's one line, beside Caw and centred on him. */
  .bye {
    grid-row: 1 / 4;
    grid-column: 2;
    align-self: center;
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .title {
    grid-column: 2;
    display: grid;
    font: var(--type-label);
  }
  .title > :global(*) {
    grid-area: 1 / 1;
  }
  .words {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .words :global(.fail) {
    color: var(--status-fail-ink);
  }
  /* The close chip floats on Caw's top corner, out of the text's way, so
     the title keeps the whole width. A mouse finds it on hover or focus;
     touch, which has no hover and no swipe here, always sees it. */
  .x {
    position: absolute;
    inset-block-start: 6px;
    inset-inline-start: 6px;
    display: grid;
    place-items: center;
    inline-size: 20px;
    block-size: 20px;
    border: 1px solid var(--border-control);
    border-radius: var(--radius-pill);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
    color: var(--ink-muted);
    cursor: pointer;
    transition: opacity var(--dur-fade) var(--ease-out);
  }
  @media (hover: hover) and (pointer: fine) {
    .x {
      opacity: 0;
    }
    .notice:hover .x,
    .notice:focus-within .x {
      opacity: 1;
    }
    .x:hover {
      color: var(--ink-strong);
    }
  }
  .body {
    grid-column: 2;
    display: grid;
    gap: 2px;
    font: var(--type-meta);
  }
  .ink {
    color: var(--ink-strong);
  }
  .notes {
    grid-column: 2;
    min-inline-size: 0;
    margin-top: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-strong);
  }
  .notes.opens:not(.open) {
    cursor: pointer;
  }
  /* Open, the notes scroll past about two thirds of the screen, so the
     buttons under them stay on it. */
  .notes.open {
    max-block-size: 60vh;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  .more {
    grid-column: 2;
    justify-self: start;
    margin-top: var(--space-1);
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-meta);
    color: var(--ink-muted);
    cursor: pointer;
    transition: color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) {
    .more:hover {
      color: var(--ink-strong);
    }
  }
  .busy {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .closing {
    color: var(--ink-muted);
  }
  /* One footer row under Caw and the words, the whole width: the quiet way
     to the settings at the leading edge, the act at the trailing edge (also
     when it is the only one), both on one baseline at every width. */
  .buttons {
    grid-column: 1 / -1;
    display: flex;
    align-items: center;
    gap: 8px;
    margin-top: 8px;
  }
  .buttons > :global(*) {
    flex: none;
  }
  /* The way to the settings is there to be found, not to compete with the act. */
  .buttons > :global(.quiet) {
    min-inline-size: 0;
    flex-shrink: 1;
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .buttons > :global(.quiet:hover) {
      color: var(--ink-strong);
    }
  }
  .buttons > :global(.primary) {
    margin-inline-start: auto;
  }
</style>
