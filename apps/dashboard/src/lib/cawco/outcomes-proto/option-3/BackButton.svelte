<script lang="ts">
  /**
   * Back to outcomes: the standard Back, an edged button so it reads as one
   * at rest. Where the pane is a phone's, it stands as its arrow alone,
   * still named Back to outcomes to a screen reader, so
   * the act on the outcome beside it keeps its words on one row.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconArrowLeft } from "#lib/icons.js";
  import { words } from "./words";

  let { onback }: { onback: () => void } = $props();
</script>

<Button
  aria-label={words.back}
  onclick={onback}
  press="pressable"
  size="sm"
  variant="outline"
>
  <IconArrowLeft />
  <span class="@max-phone:sr-only">{words.back}</span>
</Button>
