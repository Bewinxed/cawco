<script lang="ts">
  /**
   * Option B of guiding the person after an agent answered (activity lines):
   * what changed on the page under one comment since he looked, one line
   * per element as an activity log says it ("↻ Headline: was → now"), in a
   * comment's thread card over its reply and under its row in the rail's
   * To check. A comment whose element changed with no answer says so first
   * and offers Ask again, which delivers the comment to the session again.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRefresh } from "#lib/icons.js";
  import type { GuideChange } from "./guide/fixture";

  let {
    lines,
    unanswered = false,
    inset = "card",
  }: {
    /** One per element and revision, newest first. */
    lines: (GuideChange & { revision?: number })[];
    /** Its element changed and the agent never answered it. */
    unanswered?: boolean;
    /** In a thread card, or under a rail row, on its words' column. */
    inset?: "card" | "rail";
  } = $props();
</script>

<!-- Under a rail row its lines stand on the row's words column: past the pill's cell and its gap. -->
<div
  class="flex min-w-0 gap-space-3 data-[inset=rail]:px-space-2 data-[inset=rail]:pb-space-2"
  data-inset={inset}
  data-slot="activity"
>
  {#if inset === "rail"}
    <span aria-hidden="true" class="w-c-pin flex-none"></span>
  {/if}
  <div class="flex min-w-0 flex-1 flex-col gap-space-1">
    {#if unanswered}
      <p class="m-0 text-status-attn-ink type-meta" data-slot="no-answer">
        Changed, no answer from the agent
      </p>
    {/if}
    <ul class="m-0 flex list-none flex-col gap-space-1 p-0">
      {#each lines as line, at (`${line.anchor}-${at}`)}
        <li
          class="flex min-w-0 items-start gap-space-1 type-meta mark-line"
          data-slot="activity-line"
        >
          <span aria-hidden="true" class="mark-cell text-ink-muted"
            ><IconRefresh class="size-icon-sm" /></span
          >
          <span class="min-w-0 flex-1 text-pretty wrap-anywhere" data-box>
            <span class="font-medium text-ink-strong">{line.element}</span>
            {#if line.at}
              <span class="text-ink-muted"
                >moved {line.at.before} → {line.at.after} ·</span
              >
            {/if}
            <span class="sr-only">from</span>
            <span class="text-ink-muted line-through decoration-ink-subtle"
              >{line.before}</span
            >
            <span aria-hidden="true" class="text-ink-muted">→</span>
            <span class="sr-only">to</span>
            <span class="text-ink-strong">{line.after}</span>
          </span>
          {#if line.revision !== undefined}
            <span class="flex-none text-ink-muted num">rev {line.revision}</span
            >
          {/if}
        </li>
      {/each}
    </ul>
    {#if unanswered}
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
</div>
