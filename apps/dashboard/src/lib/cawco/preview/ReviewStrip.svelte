<script lang="ts">
  /**
   * Option A of guiding the person after an agent answered (the review
   * strip): under the Changed since you looked tag, while he steps, one
   * stop's whole story on the raised card recipe: the element, what it was
   * and what it is now (from → to), the comment it answers and the agent's
   * reply, or that his comment on it got no reply; then Reply (Ask again
   * for an unanswered one) and Looks right, which marks the stop seen and
   * resolves the pin it answers. The page under it scrolls to the element
   * with its wash. One stop per element across revisions: `times` says how
   * often it changed since he looked.
   */
  import { badgeVariants } from "#lib/components/ui/badge/badge.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconAgent,
    IconArrowRight,
    IconChat,
    IconRefresh,
    IconSuccess,
  } from "#lib/icons.js";
  import MessageBody from "../MessageBody.svelte";
  import type { GuideChange } from "./guide/fixture";
  import PinMark from "./PinMark.svelte";

  let {
    change,
    comment = null,
    reply = null,
    files = [],
    compact = false,
  }: {
    change: GuideChange;
    /** The words of the comment it answers or stands under. */
    comment?: string | null;
    /** The agent's reply in that thread, when one came. */
    reply?: string | null;
    /** Files the reply names. */
    files?: string[];
    /** A phone's strip: his comment and the reply's files fold away, its padding tightens. */
    compact?: boolean;
  } = $props();

  const unanswered = $derived(change.kind === "unanswered");
</script>

<section
  aria-label={`${change.element}: what changed`}
  class="flex flex-col gap-space-2 rounded-md border border-border-hairline bg-surface-raised p-space-3 data-compact:gap-space-1 data-compact:p-space-2"
  data-compact={compact || undefined}
  data-kind={change.kind}
  data-slot="review-strip"
>
  <header class="flex min-w-0 items-baseline gap-space-2">
    <h3 class="m-0 min-w-0 truncate text-ink-strong type-label">
      {change.element}
    </h3>
    {#if change.times && change.times.count > 1}
      <span class="ms-auto flex-none text-ink-muted type-meta num"
        >Changed {change.times.count} times · last {change.times.last} ago</span
      >
    {/if}
  </header>
  <!-- From → to: what it was when he last looked, and what it is now. -->
  <p
    class="m-0 flex min-w-0 flex-wrap items-center gap-x-space-1 gap-y-space-1"
    data-slot="from-to"
  >
    <span class="sr-only">From</span>
    <span
      class={[
        badgeVariants({ variant: "secondary", size: "cell-tall" }),
        "max-w-full line-through decoration-ink-subtle",
      ]}
      data-slot="before"
      title={change.before}
      ><span class="leading-body text-pretty wrap-anywhere"
        >{change.before}</span
      ></span
    >
    <IconArrowRight
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-muted"
    />
    <span class="sr-only">to</span>
    <span
      class={[
        badgeVariants({ variant: "done", size: "cell-tall" }),
        "max-w-full",
      ]}
      data-slot="after"
      ><span class="leading-body text-pretty wrap-anywhere">{change.after}</span
      ></span
    >
  </p>
  {#if change.at}
    <p class="m-0 text-ink-muted type-meta" data-slot="moved">
      Moved from {change.at.before} to {change.at.after}
    </p>
  {/if}
  {#if comment && change.pin !== null && !compact}
    <!-- His comment, by its pill: what this stop answers, or what got no answer. -->
    <p
      class="m-0 flex min-w-0 items-start gap-space-2 type-meta mark-line"
      data-slot="comment"
    >
      <PinMark number={change.pin} size="inline" tail="none" />
      <span class="min-w-0 text-pretty text-ink-strong">{comment}</span>
    </p>
  {/if}
  {#if reply}
    <div class="flex min-w-0 items-start gap-space-2" data-slot="reply">
      <span
        aria-hidden="true"
        class="grid size-(--row-mark-box) flex-none place-items-center rounded-xs bg-brand-solid text-on-brand"
        ><IconAgent class="size-icon-sm" /></span
      >
      <span class="sr-only">The agent:</span>
      <div class="min-w-0 flex-1 type-body">
        <MessageBody source={reply} wrap="pretty" />
        {#if files.length > 0 && !compact}
          <p class="m-0 mt-space-1 flex flex-wrap gap-space-1">
            {#each files as file (file)}
              <code
                class="min-w-0 wrap-anywhere rounded-xs bg-code-bg px-space-1 type-code"
                >{file}</code
              >
            {/each}
          </p>
        {/if}
      </div>
    </div>
  {:else if unanswered}
    <p class="m-0 text-status-attn-ink type-meta" data-slot="no-reply">
      Your comment {change.pin} got no reply from the agent
    </p>
  {/if}
  <footer class="flex flex-wrap items-center justify-end gap-space-2">
    {#if unanswered}
      <Button
        icon={IconRefresh}
        label="Ask again"
        size="sm"
        variant="outline"
      />
    {:else}
      <Button icon={IconChat} label="Reply" size="sm" variant="outline" />
    {/if}
    <Button
      icon={IconSuccess}
      label="Looks right"
      size="sm"
      variant="default"
    />
  </footer>
</section>
