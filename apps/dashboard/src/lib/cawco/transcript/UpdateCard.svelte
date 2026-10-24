<script lang="ts">
  /**
   * Option C of guiding the person after an agent answered (the update
   * card): under the agent's turn that made a revision of a page, what it
   * changed there, one row per element: answered his comment (✓ with the
   * comment's pill), changed under his comment with no answer (! with Ask
   * again), or asked by no one; each with what it was and what it is now.
   * Review opens the panel at the first stop. A revision he has looked at
   * since folds to its head; the newest says how much changed since he
   * last looked (`since`).
   */
  import { badgeVariants } from "#lib/components/ui/badge/badge.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    IconAlert,
    IconArrowRight,
    IconDocument,
    IconRefresh,
    IconSuccess,
  } from "#lib/icons.js";
  import type { GuideChange } from "../preview/guide/fixture";
  import PinMark from "../preview/PinMark.svelte";

  let {
    page,
    revision,
    changes,
    count = changes.length,
    since = null,
    folded = false,
  }: {
    /** The page's name. */
    page: string;
    revision: number;
    /** What the revision changed, in the check order. */
    changes: GuideChange[];
    /** How many it changed, when the rows are folded away. */
    count?: number;
    /** The rollup since he last looked: "7 changes across 4 updates". */
    since?: string | null;
    /** Looked at, or older than the newest: its head alone. */
    folded?: boolean;
  } = $props();
</script>

<section
  aria-label={`Updated ${page}, revision ${revision}`}
  class="mt-space-2 flex flex-col overflow-clip rounded-md border border-border-hairline bg-surface-raised"
  data-folded={folded || undefined}
  data-slot="update-card"
>
  <header
    class="flex min-h-c-btn-h-lg flex-wrap items-center gap-x-space-2 gap-y-space-1 py-space-1 ps-space-3 pe-space-1 mark-line"
  >
    <span aria-hidden="true" class="mark-cell text-ink-muted"
      ><IconDocument class="size-icon-md" /></span
    >
    <p class="m-0 min-w-0 flex-1 type-label text-ink-strong">
      Updated {page}
      <span class="font-normal text-ink-muted num"
        >· {count} {count === 1 ? "change" : "changes"} · rev {revision}</span
      >
    </p>
    <Button
      data-box
      label="Review"
      size="sm"
      variant={folded ? "ghost" : "outline"}
    />
  </header>
  {#if since && !folded}
    <p
      class="m-0 border-t border-border-hairline bg-surface-recess px-space-3 py-space-1 text-ink-strong type-meta"
      data-slot="since"
    >
      Since you looked: {since}
    </p>
  {/if}
  {#if !folded}
    <ol class="m-0 flex list-none flex-col border-t border-border-hairline p-0">
      {#each changes as change (change.anchor)}
        <li
          class="flex min-w-0 items-start gap-space-2 px-space-3 py-space-2 not-last:border-b not-last:border-border-hairline"
          data-kind={change.kind}
          data-slot="update-row"
        >
          <span
            aria-hidden="true"
            class="mark-cell text-status-done-glyph data-[kind=unanswered]:text-status-attn-glyph data-[kind=unasked]:text-ink-muted"
            data-kind={change.kind}
          >
            {#if change.kind === "unanswered"}<IconAlert
                class="size-icon-sm"
              />{:else}<IconSuccess class="size-icon-sm" />{/if}
          </span>
          <div class="flex min-w-0 flex-1 flex-col gap-space-1">
            <p
              class="m-0 flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
            >
              <span class="type-label text-ink-strong">{change.element}</span>
              {#if change.pin !== null}
                <span
                  class="inline-flex items-center gap-space-1 type-meta data-[kind=unanswered]:text-status-attn-ink text-ink-muted mark-line"
                  data-kind={change.kind}
                >
                  <PinMark number={change.pin} size="inline" tail="none" />
                  <span
                    >{change.kind === "answers"
                      ? "answers your comment"
                      : "your comment, not answered"}</span
                  >
                </span>
              {:else}
                <span class="type-meta text-ink-muted">nobody asked</span>
              {/if}
            </p>
            <p class="m-0 flex min-w-0 flex-wrap items-center gap-space-1">
              <span class="sr-only">From</span>
              <span
                class={[
                  badgeVariants({ variant: "secondary", size: "cell-tall" }),
                  "max-w-full line-through decoration-ink-subtle",
                ]}
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
                ><span class="leading-body text-pretty wrap-anywhere"
                  >{change.after}</span
                ></span
              >
            </p>
            {#if change.at}
              <p class="m-0 text-ink-muted type-meta">
                Moved from {change.at.before} to {change.at.after}
              </p>
            {/if}
            {#if change.kind === "unanswered"}
              <div class="flex justify-end">
                <Button
                  icon={IconRefresh}
                  label="Ask again"
                  size="sm"
                  variant="secondary"
                />
              </div>
            {/if}
          </div>
        </li>
      {/each}
    </ol>
  {/if}
</section>
