<script lang="ts">
  /** A short label in a status pair: the kit Badge. */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import type { OpenUIRenderProps } from "./OpenUiRenderer.svelte";

  let { props }: OpenUIRenderProps<{ text: unknown; tone?: string }> = $props();
  const VARIANT = {
    neutral: "secondary",
    live: "live",
    attn: "attn",
    done: "done",
    fail: "fail",
  } as const;
  const variant = $derived(
    VARIANT[String(props.tone ?? "neutral") as keyof typeof VARIANT] ??
      "secondary"
  );
</script>

<Badge class="self-start" {variant}
  ><span>{String(props.text ?? "")}</span></Badge
>
