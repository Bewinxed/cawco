<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { IconCpu, IconFolder, IconKey } from "#lib/icons.js";
  import { Row, RowList } from "./index.js";

  let { withBelow = false }: { withBelow?: boolean } = $props();
</script>

<div
  class="w-full max-w-sm rounded-lg border border-ui bg-bg px-space-3 py-space-2"
>
  <RowList aria-label="Aligned rows">
    <Row>
      {#snippet lead()}
        <span
          class="grid size-row-compact place-items-center rounded-sm bg-bg-2 text-tx-2"
        >
          <IconCpu class="size-icon-md" />
        </span>
      {/snippet}
      <div class="flex min-w-0 flex-col">
        <span class="truncate type-label text-tx">Local workstation</span>
        <span class="truncate type-meta text-tx-2">macOS · Connected</span>
      </div>
      {#snippet trail()}
        <Badge variant="done"><span>Live</span></Badge>
      {/snippet}
      {#snippet below()}
        {#if withBelow}
          <span class="type-meta text-tx-2"
            >Aligned to the body track with subgrid, zero inset arithmetic.</span
          >
        {/if}
      {/snippet}
    </Row>
    <Row>
      {#snippet lead()}
        <span
          class="grid size-row-compact place-items-center rounded-sm bg-bg-2 text-tx-2"
        >
          <IconKey class="size-icon-md" />
        </span>
      {/snippet}
      <div class="flex min-w-0 flex-col">
        <span class="truncate type-label text-tx">Anthropic API key</span>
        <span class="truncate type-meta text-tx-2">Used by 3 harnesses</span>
      </div>
      {#snippet trail()}
        <Badge variant="secondary"><span>Primary</span></Badge>
      {/snippet}
    </Row>
    <Row>
      {#snippet lead()}
        <span
          class="grid size-row-compact place-items-center rounded-sm bg-bg-2 text-tx-2"
        >
          <IconFolder class="size-icon-md" />
        </span>
      {/snippet}
      <span class="truncate type-label text-tx">Workspace directory</span>
    </Row>
  </RowList>
</div>
