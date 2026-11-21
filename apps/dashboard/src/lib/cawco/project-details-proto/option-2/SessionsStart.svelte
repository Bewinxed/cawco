<script lang="ts">
  /**
   * Stage 2 ("Sessions start"): where the project's sessions start, and on
   * which account. At @setup (640px) and wider the places (and, for code,
   * its large files) take three fifths beside the account's two; under it
   * they stack, places first, so no folder path is cut short to fit.
   */
  import AccountColumn from "./AccountColumn.svelte";
  import type { SessionsStartProps } from "./changes";
  import PlacesList from "./PlacesList.svelte";

  let props: SessionsStartProps = $props();
</script>

<div
  class="grid min-w-0 grid-cols-1 items-start gap-x-space-6 gap-y-space-5 @setup:grid-cols-5"
>
  <div class="flex min-w-0 flex-col gap-space-5 @setup:col-span-3">
    <PlacesList {...props} />
  </div>
  <div class="min-w-0 @setup:col-span-2">
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
