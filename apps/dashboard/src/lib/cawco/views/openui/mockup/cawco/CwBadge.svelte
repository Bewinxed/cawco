<script lang="ts">
  /** Badge, drawn as CawCo's: the kit's Badge, its tone a status pair. */
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let { props }: OpenUIRenderProps<{ text: unknown; tone?: string }> = $props();
  const VARIANT: Record<string, BadgeVariant> = {
    neutral: "secondary",
    accent: "live",
    positive: "done",
    caution: "attn",
    critical: "fail",
  };
</script>

<span class="badge" data-mk="Badge">
  <Badge variant={VARIANT[props.tone ?? "neutral"] ?? "secondary"}
    >{textOf(props.text)}</Badge
  >
</span>

<style>
  .badge {
    display: inline-flex;
    align-self: flex-start;
  }
</style>
