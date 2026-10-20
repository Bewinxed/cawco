<!-- A short label: the kit Badge, a status pair only where the program names a status (DESIGN.md, The Reserved Hue Rule). -->
<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import type { OpenUIRenderProps } from "../../views/openui/OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; tone?: unknown }> =
    $props();
  const TONES = ["live", "attn", "done", "fail"] as const;
  const variant = $derived(
    TONES.find((tone) => tone === props.tone) ?? "default"
  );
</script>

<Badge class="self-start" {variant}>
  <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
    >{String(props.text ?? "")}</span
  >
</Badge>
