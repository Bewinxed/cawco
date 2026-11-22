<script lang="ts">
  /**
   * Step 2 ("Where agents run"): where the project's sessions start, and on
   * which account. Where the step stands wider than a phone (the phone line,
   * of the step's own width) the folders (and, for code, its repositories
   * and large files) take three fifths beside the account's two; under it
   * they stack, folders first, so no folder path is cut short to fit.
   */
  import AccountColumn from "./AccountColumn.svelte";
  import type { SessionsStartProps } from "./changes";
  import PlacesList from "./PlacesList.svelte";

  let props: SessionsStartProps = $props();
</script>

<div
  class="grid min-w-0 grid-cols-1 items-start gap-x-space-7 gap-y-space-6 @phone:grid-cols-5"
>
  <div class="flex min-w-0 flex-col gap-space-6 @phone:col-span-3">
    <PlacesList {...props} />
  </div>
  <div class="min-w-0 @phone:col-span-2">
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
