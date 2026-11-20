<script lang="ts">
  /**
   * Stage 2 ("Sessions start"): pairs Places (with Repositories and Large
   * files) at 60% beside Account at 40% once the view reaches @setup (640px),
   * stacking Places above Account beneath it so both start prerequisites read
   * side by side on desk without clipping folder paths on narrow widths.
   */
  import AccountColumn from "./AccountColumn.svelte";
  import type { Change, ChangeKey, PlaceAct } from "./changes";
  import PlacesList from "./PlacesList.svelte";
  import type { HowItRunsRecord } from "./records";

  let {
    record,
    pending,
    refused,
    movingPlaceId,
    onchange,
    onretry,
    onplace,
    onaddplace,
    hrefOf,
  }: {
    record: HowItRunsRecord;
    pending: ChangeKey[];
    refused: Partial<Record<ChangeKey, string>>;
    movingPlaceId: string | null;
    onchange: (change: Change) => void;
    onretry: (key: ChangeKey) => void;
    onplace: (act: PlaceAct, placeId: string) => void;
    onaddplace: (machineId: string, path: string) => void;
    hrefOf: (page: "accounts" | "connections" | "fleetDecides") => string;
  } = $props();
</script>

<div
  class="grid min-w-0 grid-cols-1 items-start gap-space-3 @setup:grid-cols-5"
>
  <div class="flex min-w-0 flex-col @setup:col-span-3">
    <PlacesList
      {hrefOf}
      {movingPlaceId}
      {onaddplace}
      {onchange}
      {onplace}
      {onretry}
      {pending}
      {record}
      {refused}
    />
  </div>
  <div class="flex min-w-0 flex-col @setup:col-span-2">
    <AccountColumn
      {hrefOf}
      {onchange}
      {onretry}
      {pending}
      {record}
      {refused}
    />
  </div>
</div>
