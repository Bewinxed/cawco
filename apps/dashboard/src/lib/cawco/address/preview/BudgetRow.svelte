<script lang="ts">
  /**
   * A project past its budget, as Needs you lists it today, under the
   * address's row: NeedsCard's own row (NeedsRow), as it draws a budget.
   * `key` is the row's own; `project` names the project its press opens.
   */
  import NeedsMeta from "#lib/cawco/home/NeedsMeta.svelte";
  import NeedsRow from "#lib/cawco/home/NeedsRow.svelte";
  import { reachedCap } from "#lib/cawco/home/reached-cap.js";
  import { capLine } from "#lib/cawco/usage.js";
  import { IconDollar } from "#lib/icons.js";

  let { key, project }: { key: string; project: string } = $props();
</script>

<NeedsRow
  href="/usage?project={project}"
  kind="cap"
  onchoose={() => undefined}
  share="pane:cap:{key}"
  title="cockpit"
  want={capLine(reachedCap())}
>
  {#snippet lead()}
    <IconDollar aria-hidden="true" class="size-icon-md" />
  {/snippet}
  {#snippet below()}
    <NeedsMeta text="Budget" />
  {/snippet}
</NeedsRow>
