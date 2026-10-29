<script lang="ts">
  /**
   * Under a list of previous versions longer than its latest few: one press
   * shows them all, and another the latest again.
   */
  import { memoryWords as words } from "@cawco/core/words/memory";
  import { Button } from "#lib/components/ui/button/index.js";

  let { total, all = $bindable() }: { total: number; all: boolean } = $props();
</script>

<div data-slot="more" class="self-start" data-flip>
  <Button
    onclick={() => {
      all = !all;
    }}
    size="sm"
    variant="ghost"
  >
    {all ? words.showLatest : words.showAll(total)}
  </Button>
</div>
