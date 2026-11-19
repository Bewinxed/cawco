<script lang="ts">
  import { cardWords } from "@cawco/core/words/project-details";
  /**
   * The card's top line: is it all right. One line with its glyph: whether
   * agents can start, and the section in trouble by name, a press that moves
   * focus to that section's troubled row (the row holds the full message
   * and its fix). Work running says what it does with the live mark; the
   * hub out of reach says which computer stopped answering and when the
   * details were read, with Try again, before any change is tried. Until
   * both the folders and the AI account are read it is a skeleton.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconCloudCross,
    IconError,
    IconRefresh,
    IconSuccess,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { crossIn } from "#lib/platform/motion/curves.svelte.js";
  import { sectionName, type Trouble, type Verdict } from "./verdict";

  let {
    verdict,
    onjump,
    ontry,
  }: {
    verdict: Verdict;
    /** The named section's press: focus moves to its troubled row. */
    onjump: (section: Trouble) => void;
    /** Ask the hub again. */
    ontry: () => void;
  } = $props();
</script>

<div
  aria-live="polite"
  class="flex min-h-c-btn-h-sm min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1"
  data-slot="verdict"
  data-tone={verdict.tone}
>
  {#key verdict.tone}
    <span class="mark-line flex min-w-0 items-center gap-space-2" in:crossIn>
      {#if verdict.tone === "reading"}
        <span class="sr-only">{cardWords.reading}</span>
        <Skeleton data-box line="label" width="title" />
      {:else if verdict.tone === "running"}
        <LiveDot />
        <span class="type-label font-medium text-ink-strong"
          >{verdict.text}</span
        >
      {:else if verdict.tone === "away"}
        <IconCloudCross
          aria-hidden="true"
          class="size-icon-md flex-none text-status-attn-ink"
        />
        <span class="type-label font-medium text-pretty text-ink-strong"
          >{verdict.text}</span
        >
      {:else}
        {#if verdict.tone === "blocked"}
          <IconError
            aria-hidden="true"
            class="size-icon-md flex-none text-status-fail-ink"
          />
        {:else if verdict.tone === "look"}
          <IconWarningTriangle
            aria-hidden="true"
            class="size-icon-md flex-none text-status-attn-ink"
          />
        {:else}
          <IconSuccess
            aria-hidden="true"
            class="size-icon-md flex-none text-status-done-ink"
          />
        {/if}
        <span class="type-label font-medium text-ink-strong"
          >{verdict.text}</span
        >
      {/if}
    </span>
  {/key}
  {#if verdict.tone === "blocked" || verdict.tone === "look"}
    {@const section = verdict.section}
    <span aria-hidden="true" class="type-label text-ink-subtle">·</span>
    <Button onclick={() => onjump(section)} size="xs" variant="link"
      >{verdict.tone === "blocked"
        ? sectionName(section)
        : cardWords.needsLook(sectionName(section))}</Button
    >
  {:else if verdict.tone === "away"}
    <Button
      icon={IconRefresh}
      label={cardWords.tryAgain}
      onclick={ontry}
      size="xs"
      variant="outline"
    />
  {/if}
</div>
