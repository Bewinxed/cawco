<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconCpu, IconFolder, IconKey } from "#lib/icons.js";
  import { Row, RowList } from "./index.js";

  let { withBelow = false }: { withBelow?: boolean } = $props();
</script>

<div
  class="w-full max-w-sm rounded-lg border border-border-hairline bg-surface-raised px-space-3 py-space-2"
>
  <RowList aria-label="Aligned rows">
    <Row>
      {#snippet lead()}
        <span
          class="grid size-row-compact place-items-center rounded-sm bg-surface-recess text-ink-muted"
        >
          <IconCpu class="size-icon-md" />
        </span>
      {/snippet}
      <div class="flex min-w-0 flex-col">
        <span class="truncate type-label text-ink-strong"
          >Local workstation</span
        >
        <span class="truncate type-meta text-ink-muted">macOS · Connected</span>
      </div>
      {#snippet trail()}
        <Badge variant="done">Live</Badge>
      {/snippet}
      {#snippet below()}
        {#if withBelow}
          <span class="type-meta text-ink-muted"
            >Aligned to the body track with subgrid, zero inset arithmetic.</span
          >
        {/if}
      {/snippet}
    </Row>
    <Row>
      {#snippet lead()}
        <span
          class="grid size-row-compact place-items-center rounded-sm bg-surface-recess text-ink-muted"
        >
          <IconKey class="size-icon-md" />
        </span>
      {/snippet}
      <div class="flex min-w-0 flex-col">
        <span class="truncate type-label text-ink-strong"
          >Anthropic API key</span
        >
        <span class="truncate type-meta text-ink-muted"
          >Used by 3 harnesses</span
        >
      </div>
      {#snippet trail()}
        <Badge variant="secondary">Primary</Badge>
      {/snippet}
    </Row>
    <Row>
      {#snippet lead()}
        <span
          class="grid size-row-compact place-items-center rounded-sm bg-surface-recess text-ink-muted"
        >
          <IconFolder class="size-icon-md" />
        </span>
      {/snippet}
      <span class="truncate type-label text-ink-strong"
        >Workspace directory</span
      >
    </Row>
  </RowList>
</div>
