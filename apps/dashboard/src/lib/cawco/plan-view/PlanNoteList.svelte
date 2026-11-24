<script lang="ts">
  import type { PlanComment } from "@cawco/core/plan";
  import { IconComment } from "#lib/icons.js";

  let {
    comments,
    prefix = "",
    surface = "recess",
    accentIcon = false,
  }: {
    accentIcon?: boolean;
    comments: PlanComment[];
    prefix?: string;
    surface?: "raised" | "recess";
  } = $props();
</script>

{#if comments.length > 0}
  <div class="flex flex-col gap-space-1">
    {#each comments as note, idx (`${note.at}-${idx}`)}
      <div
        class={[
          "mark-line flex items-start gap-space-2 rounded-xs px-space-2 py-space-1 text-ink-muted type-meta",
          surface === "raised" ? "bg-surface-raised" : "bg-surface-recess",
        ]}
      >
        <IconComment
          aria-hidden="true"
          class={[
            "mt-0.5 size-icon-sm shrink-0",
            accentIcon ? "text-brand-ink" : "text-ink-subtle",
          ]}
        />
        <span class="min-w-0 break-word">{prefix}{note.text}</span>
      </div>
    {/each}
  </div>
{/if}
