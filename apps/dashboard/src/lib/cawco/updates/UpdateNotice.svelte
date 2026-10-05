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
    onaction: (action: "retry" | "install-all") => void;
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
    class="x"
    onclick={() => {
      ondismiss();
      closeToast?.();
    }}
    type="button"
  >
    <IconClose class="size-4" />
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
        <Button href="/config/updates" size="sm" variant="outline"
          >Configure updates</Button
        >
      {/if}
      {#if notice.action === "retry"}
        <Button label="Retry" onclick={() => onaction("retry")} size="sm" />
      {:else if notice.action === "install-all"}
        <Button
          label="Install now"
          onclick={() => onaction("install-all")}
          size="sm"
        />
      {/if}
    </div>
  {/if}
</div>

<style>
  .notice {
    display: grid;
    grid-template-columns: 48px 1fr 20px;
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
  .x {
    grid-column: 3;
    align-self: start;
    color: var(--ink-muted);
    cursor: pointer;
  }
  .body {
    grid-column: 2 / 4;
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
  .buttons {
    grid-column: 2 / 4;
    display: flex;
    justify-content: space-between;
    gap: 8px;
    margin-top: 8px;
  }
  .buttons > :global(*) {
    flex: 1;
  }
  @media (min-width: 640px) {
    .buttons > :global(*) {
      flex: none;
    }
    .buttons {
      justify-content: space-between;
    }
  }
</style>
