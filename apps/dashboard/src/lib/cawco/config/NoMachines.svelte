<script lang="ts">
  import { commonWords } from "@cawco/core";
  /**
   * A Configure group that is about machines, with none joined yet: the kit's
   * empty block (DESIGN.md, Empty: a 20px mark, a title, one line saying
   * why), its one action the way to fill it by hand, Add machine (The Empty
   * Starts Work Rule: where Caw can't start it, the way to do it by hand).
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { IconLaptop } from "#lib/icons.js";
  import { connect } from "../connect/installs.svelte";

  let {
    line,
  }: {
    /** What happens once one joins ("This file lands on the first one that registers."). */
    line: string;
  } = $props();
</script>

<EmptyState icon={IconLaptop} {line} title={commonWords.noMachines}>
  {#snippet action()}
    <Button
      aria-haspopup="dialog"
      label="Add machine"
      onclick={(event) => connect.openNew(event.currentTarget)}
      variant="outline"
    />
  {/snippet}
</EmptyState>
