<script lang="ts">
  /**
   * Where code goes (Repository & Git, code projects only): the four ways
   * finished code goes, as the view's one pick (PickChips): a commit onto
   * the main line, a branch of its own, a branch with a pull request, kept
   * here, each one's line in its tooltip. A press moves the pick at
   * once (changes.ts `withAsked`); a refusal puts it back and stands under
   * the tiles in the hub's words, with Try again (RowFault).
   */
  import RowFault from "#lib/cawco/RowFault.svelte";
  import type { StageSends } from "./changes";
  import PickChips from "./PickChips.svelte";
  import type { Landing } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    record,
    refused,
    onchange,
    onretry,
    labelledby,
  }: StageSends & {
    /** The label on the page that names its pick, where one does. */
    labelledby?: string;
  } = $props();

  const LANDINGS: readonly Landing[] = ["default", "branch", "pr", "nowhere"];
</script>

<div class="flex min-w-0 flex-col gap-space-1">
  <PickChips
    disabled={!record.hubReachable}
    label={labelledby ? undefined : words.lands.groupLabel}
    {labelledby}
    onpick={(next) => {
      if (next !== record.landing) {
        onchange({ key: "landing", value: next });
      }
    }}
    options={LANDINGS.map((landing) => ({
      id: landing,
      name: words.lands.options[landing].name,
      note: words.lands.options[landing].note,
    }))}
    value={record.landing}
  />
  <RowFault
    again={() => onretry("landing")}
    againLabel={words.retryChange}
    reason={refused.landing}
  />
</div>
