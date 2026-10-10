<script lang="ts">
  import { motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { IconError } from "#lib/icons.js";
  /**
   * The update notice as a row of Caw's panel (CawPanel), its one surface,
   * until its ✕ (NoticeRow) or its act acknowledges it: Caw's mark in the
   * notice's status, the title (with the failure glyph when it says one),
   * the release notes as their sections and lists, what it says machine by
   * machine, the quiet way to Configure › Updates, and its one act (Retry,
   * Install now, Reload) when it has one (updates/model `noticeFor`).
   *
   * Reload turns the row into its goodbye (../updates/goodbye): his mark
   * waiting on his `loading`, beside "See you in a bit", and nothing else,
   * until the tab goes. The row is a `reflow` box, so its edge travels to the
   * goodbye's height and what is under it follows.
   */
  import { page } from "$app/state";
  import { arrive, GOODBYE, leaveInPlace } from "../updates/goodbye";
  import type { Notice } from "../updates/model";
  import ReleaseNotes from "../updates/ReleaseNotes.svelte";
  import Caw, { type CawStatus } from "./Caw.svelte";
  import CawMark from "./CawMark.svelte";
  import NoticeRow from "./NoticeRow.svelte";

  let {
    notice,
    ondismiss,
    onaction,
  }: {
    /** Null only once Reload was chosen and the acknowledgement dropped it: the goodbye needs none. */
    notice: Notice | null;
    ondismiss: () => void;
    onaction: (action: NonNullable<Notice["action"]>) => void;
  } = $props();

  const ACTS: Record<NonNullable<Notice["action"]>, string> = {
    retry: "Retry",
    "install-all": "Install now",
    reload: "Reload",
  };

  /** Reload was chosen: the row says its goodbye until the tab goes. */
  let leaving = $state(false);
  let card = $state<HTMLElement>();
  let layer = $state<HTMLElement>();

  /** The first line still under way carries the spinner; the rest are words. */
  const spinnerAt = $derived(
    notice?.lines.findIndex((line) => line.state === "busy") ?? -1
  );
  /** On Configure › Updates the way there is not offered. */
  const configure = $derived(
    notice?.configure === true && page.url.pathname !== "/config/updates"
  );

  /** What the row showed leaves where it stood, and the row turns into its goodbye. */
  function sayGoodbye(): void {
    if (card && layer) {
      const away = layer;
      leaveInPlace(
        [...card.children].filter(
          (child): child is HTMLElement =>
            child instanceof HTMLElement && child !== away
        ),
        away
      );
    }
    leaving = true;
  }

  function act(action: NonNullable<Notice["action"]>): void {
    if (action === "reload") {
      sayGoodbye();
    }
    onaction(action);
  }
</script>

<NoticeRow
  dismissLabel="Dismiss the update notice"
  label={leaving ? GOODBYE : (notice?.title ?? GOODBYE)}
  ondismiss={leaving ? undefined : ondismiss}
>
  {#snippet lead()}
    {#if leaving && motionOk.current}
      <!-- His wait: the page can't show its content until the tab is back. -->
      <Caw size={28} status="loading" />
    {:else}
      <CawMark
        size={28}
        status={leaving
          ? "loading"
          : ((notice?.caw.status ?? "sleeping") as CawStatus)}
      />
    {/if}
  {/snippet}
  <div class="card" bind:this={card}>
    <!-- What the row showed, copied where it stood, leaving. -->
    <div aria-hidden="true" class="leaving" inert bind:this={layer}></div>
    {#if leaving}
      <span class="line" {@attach arrive}>{GOODBYE}</span>
    {:else if notice}
      <h2 class="title">
        {#if notice.failed}
          <IconError aria-hidden="true" class="fail size-4 shrink-0" />
        {/if}
        {notice.title}
      </h2>
      {#if notice.notes}
        <div class="notes"><ReleaseNotes source={notice.notes.full} /></div>
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
      {#if configure || notice.action}
        <div class="actions">
          {#if configure}
            <Button
              class="quiet"
              href="/config/updates"
              label="Configure update behaviour"
              size="sm"
              variant="ghost"
            />
          {/if}
          {#if notice.action}
            {@const action = notice.action}
            <Button
              label={ACTS[action]}
              onclick={() => act(action)}
              size="sm"
            />
          {/if}
        </div>
      {/if}
    {/if}
  </div>
</NoticeRow>

<style>
  .card {
    position: relative;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .leaving {
    position: absolute;
    inset: 0;
    pointer-events: none;
  }
  .title {
    display: flex;
    align-items: center;
    gap: 6px;
    margin: 0;
    font: var(--type-label);
    color: var(--ink-strong);
    overflow-wrap: anywhere;
  }
  .title :global(.fail) {
    color: var(--status-fail-ink);
  }
  .notes {
    font: var(--type-body);
    color: var(--ink-row);
  }
  .body {
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
  /* The quiet way to the settings just before the act, packed to the
     trailing edge. */
  .actions {
    display: flex;
    align-items: center;
    justify-content: flex-end;
    gap: var(--space-1);
    margin-top: var(--space-1);
  }
  .actions > :global(.quiet) {
    min-inline-size: 0;
    flex-shrink: 1;
    color: var(--ink-muted);
  }
  @media (hover: hover) {
    .actions > :global(.quiet:hover) {
      color: var(--ink-strong);
    }
  }
  /* The goodbye's one line, beside his waiting mark and centred on it. */
  .line {
    display: flex;
    align-items: center;
    min-block-size: 28px;
    font: var(--type-label);
    color: var(--ink-strong);
  }
</style>
