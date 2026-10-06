<script lang="ts">
  /**
   * The one update notice: Caw at 48 on the leading edge, a title, the lines
   * that matter, and at most two buttons. It is a custom toast under one id,
   * so every state replaces the last in the same box. The box here is
   * presentation only: what to say comes from `noticeFor`, what the buttons
   * do from the caller.
   */
  import { fade } from "svelte/transition";
  import { dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { morph } from "#lib/cawco/motion/morph.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconClose, IconError } from "#lib/icons.js";
  import Caw, { type CawStatus } from "../home/Caw.svelte";
  import CawMark from "../home/CawMark.svelte";
  import type { Notice } from "./model";

  let {
    view,
    onaction,
    ondismiss,
    closeToast,
  }: {
    /** Read through, so the mounted box follows when the notice changes. */
    view: { notice: Notice; onPage: boolean };
    onaction: (action: NonNullable<Notice["action"]>) => void;
    ondismiss: () => void;
    /** Sonner's own, given to a custom toast. */
    closeToast?: () => void;
  } = $props();

  const notice = $derived(view.notice);
  const status = $derived(notice.caw.status as CawStatus);
  /** The first busy line takes the one spinner; the rest are plain words. */
  const spinnerAt = $derived(notice.lines.findIndex((l) => l.state === "busy"));
</script>

<div class="notice" role="status" {@attach morph()}>
  {#key notice.kind}
    <div
      aria-hidden="true"
      class="caw"
      in:fade={{ duration: dur("--dur-fade"), delay: dur("--dur-fade") }}
      out:fade={{ duration: dur("--dur-fade") }}
    >
      {#if notice.caw.moves && motionOk.current}
        <Caw size={48} {status} />
      {:else}
        <CawMark size={48} {status} />
      {/if}
    </div>
  {/key}

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
  <button
    aria-label="Dismiss"
    class="x touch-hit pointer-hit"
    onclick={() => {
      ondismiss();
      closeToast?.();
    }}
    type="button"
  >
    <IconClose class="size-3" />
  </button>

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
          onclick={() => onaction("retry")}
          size="sm"
        />
      {:else if notice.action === "install-all"}
        <Button
          class="primary"
          label="Install now"
          onclick={() => onaction("install-all")}
          size="sm"
        />
      {:else if notice.action === "reload"}
        <Button
          class="primary"
          label="Reload"
          onclick={() => onaction("reload")}
          size="sm"
        />
      {/if}
    </div>
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
  .busy {
    display: flex;
    align-items: center;
    gap: 6px;
  }
  .closing {
    color: var(--ink-muted);
  }
  /* The words keep one left edge beside Caw; the buttons need no such edge,
     so their row takes the whole width under him. */
  .buttons {
    grid-column: 1 / -1;
    display: flex;
    flex-wrap: wrap;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
  }
  /* The way to the settings is there to be found, not to compete with the act. */
  .buttons > :global(.quiet) {
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .buttons > :global(.quiet:hover) {
      color: var(--ink-strong);
    }
  }
  .buttons > :global(*) {
    flex: 1;
  }
  /* The quiet way to the settings hugs its words at the leading edge at every width. */
  .buttons > :global(.quiet) {
    flex: none;
  }
  @media (min-width: 640px) {
    .buttons > :global(*) {
      flex: none;
    }
    .buttons {
      justify-content: space-between;
    }
    /* The primary stands at the trailing edge, also when it is the only button. */
    .buttons > :global(.primary) {
      margin-inline-start: auto;
    }
  }
</style>
