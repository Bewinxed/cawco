<script lang="ts">
  import { presenceWords } from "@cawco/core/words/presence";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconNotices, IconSuccess } from "#lib/icons.js";
  /**
   * The ask a browser shows as the dashboard loads, until it is answered
   * there: notifications first (what needs the person shows on this
   * computer while they are in another tab or app, instead of on their
   * phone), and on a desk this computer's presence where that is still to
   * ask. A toast of its own (notify-ask.svelte.ts puts it up), drawn on the
   * toast's floating surface: its title, what Allow lets, then Not now and
   * Allow as peers at the two ends of their row. Allow asks the browser in
   * the press itself; a refusal stands on it in Allow's place, naming each
   * blocked setting and where to turn it on; once allowed it ticks a moment, then leaves.
   */
  import type { DeskAsk } from "./presence";

  let {
    ask,
    phone,
    pending,
    refusal,
    done,
    onallow,
    onskip,
  }: {
    /** What Allow asks this browser for. */
    ask: DeskAsk;
    /** The dashboard is on a phone: its words name the phone. */
    phone: boolean;
    /** Allow's press is on its way. */
    pending: boolean;
    /** The browser's or the hub's refusal of Allow, in words. */
    refusal: { title: string; message: string } | null;
    /** Allowed: it ticks a moment, then leaves. */
    done: boolean;
    /** Allow: the browser's own prompts, asked in the press. */
    onallow: () => void;
    /** Not now: the answer kept in this browser; the presence menu still offers Allow. */
    onskip: () => void;
  } = $props();

  const titleId = $props.id();
  const asking = $derived(ask.agent !== null || ask.idle || ask.notify);
</script>

<section
  class="flex w-full flex-col gap-space-1 rounded-lg border border-border-control bg-surface-raised p-space-4 text-ink-strong shadow-overlay"
  aria-labelledby={titleId}
  data-slot="notify-ask"
>
  {#if done}
    <div class="mark-line flex items-start gap-space-2">
      <span class="mark-cell">
        <IconSuccess
          aria-hidden="true"
          class="size-icon-md text-status-done-ink"
        />
      </span>
      <p class="m-0 type-label text-pretty" role="status">
        {presenceWords.done(ask, phone)}
      </p>
    </div>
  {:else}
    <div class="mark-line flex items-start gap-space-2">
      <span class="mark-cell">
        <IconNotices aria-hidden="true" class="size-icon-md text-ink-muted" />
      </span>
      <h2 class="m-0 type-label text-pretty" id={titleId}>
        {presenceWords.title(ask, phone)}
      </h2>
    </div>
    {#if asking}
      <p class="m-0 type-meta text-pretty text-ink-muted">
        {presenceWords.lead(ask, phone)}
      </p>
    {/if}
    {#if refusal}
      <!-- Wrapped, never cut: the setting's name and where to turn it on
           are the whole point of it. -->
      <p
        class="m-0 type-meta text-pretty wrap-anywhere text-status-fail-ink"
        data-slot="notify-ask-refusal"
        role="alert"
      >
        {refusal.title}. {refusal.message}
      </p>
    {/if}
    <!-- Not now and Allow are peers (DESIGN.md, Permissions): the same
         size, type and fill, at the two ends of their row. On a finger the
         gap opens (The 44 Touch Rule). -->
    <div
      class="mt-space-2 flex items-center justify-between gap-space-2 coarse:gap-space-4"
      data-slot="peers"
    >
      <Button
        data-skip
        disabled={pending}
        label={presenceWords.notNow}
        onclick={onskip}
        size="sm"
        variant="secondary"
      />
      {#if asking && !refusal}
        <Button
          data-allow
          disabled={pending}
          label={presenceWords.allow}
          onclick={onallow}
          {pending}
          pendingLabel={presenceWords.allowing}
          size="sm"
          variant="secondary"
        />
      {/if}
    </div>
  {/if}
</section>
