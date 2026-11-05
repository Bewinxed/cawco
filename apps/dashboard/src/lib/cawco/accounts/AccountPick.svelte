<script lang="ts">
  /**
   * Where a project's or an area's sessions start: the fleet's routing
   * first, then every account by the name it shows everywhere. While the
   * hub answers a pick the select holds it and waits (`disabled`).
   */
  import * as NativeSelect from "#lib/components/ui/native-select/index.js";
  import { accountChoices } from "./model.svelte";

  let {
    value,
    disabled = false,
    routing,
    onpick,
    ...rest
  }: {
    /** The account picked, by id; null: the routing. */
    value: string | null;
    disabled?: boolean;
    /** The first choice: what no account means here. */
    routing: string;
    onpick: (account: string | null) => void;
    id?: string;
    "aria-label"?: string;
    measure?: "shrink" | "cap-md";
    [key: `data-${string}`]: unknown;
  } = $props();
</script>

<NativeSelect.Root
  {...rest}
  class="w-full"
  {disabled}
  bind:value={() => value ?? "", (next) => onpick(next || null)}
>
  <NativeSelect.Option value="">{routing}</NativeSelect.Option>
  {#each accountChoices() as each (each.id)}
    <NativeSelect.Option value={each.id}>{each.name}</NativeSelect.Option>
  {/each}
</NativeSelect.Root>
