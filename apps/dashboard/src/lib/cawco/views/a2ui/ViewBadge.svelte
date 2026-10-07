<script lang="ts">
  /** A short label in a status pair: the kit Badge. */
  import type { A2uiComponentProps } from "svelte-a2ui";
  import { Badge } from "#lib/components/ui/badge/index.js";

  let { text, tone }: A2uiComponentProps = $props();
  const VARIANT = {
    neutral: "secondary",
    live: "live",
    attn: "attn",
    done: "done",
    fail: "fail",
  } as const;
  const variant = $derived(
    VARIANT[String(tone ?? "neutral") as keyof typeof VARIANT] ?? "secondary"
  );
</script>

<Badge class="self-start" {variant}>{String(text ?? "")}</Badge>
