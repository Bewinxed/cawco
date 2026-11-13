<script lang="ts">
  /** A short label in a status pair: the kit Badge. */
  import { STATUS_PAIRS } from "@cawco/core/views";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; tone?: string }> = $props();
  const variant = $derived.by(() => {
    const tone = String(props.tone ?? "neutral");
    return STATUS_PAIRS.find((pair) => pair === tone) ?? "secondary";
  });
</script>

<Badge class="self-start" {variant}
  ><span>{String(props.text ?? "")}</span></Badge
>
