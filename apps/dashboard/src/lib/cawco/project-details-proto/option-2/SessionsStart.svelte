<script lang="ts">
  /**
   * Stage 2 ("Sessions start"): pairs Places (with Repositories and Large
   * files) at 60% beside Account at 40% once the view reaches @setup (640px),
   * stacking Places above Account beneath it so both start prerequisites read
   * side by side on desk without clipping folder paths on narrow widths.
   */
  import AccountColumn from "./AccountColumn.svelte";
  import type { SessionsStartProps } from "./changes";
  import PlacesList from "./PlacesList.svelte";

  let props: SessionsStartProps = $props();
</script>

<div
  class="grid min-w-0 grid-cols-1 items-start gap-space-3 @setup:grid-cols-5"
>
  <div class="flex min-w-0 flex-col @setup:col-span-3">
    <PlacesList {...props} />
  </div>
  <div class="flex min-w-0 flex-col @setup:col-span-2">
    <AccountColumn
      hrefOf={props.hrefOf}
      onchange={props.onchange}
      onretry={props.onretry}
      pending={props.pending}
      record={props.record}
      refused={props.refused}
    />
  </div>
</div>
