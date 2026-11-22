<script lang="ts">
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import type { StatusGlyphKind, StatusTone } from "./routine-format";
  import StatusGlyph from "./StatusGlyph.svelte";

  interface Props {
    glyph: StatusGlyphKind;
    label: string;
    tone: StatusTone;
    variant: BadgeVariant;
  }

  let { glyph, label, tone, variant }: Props = $props();
</script>

<Badge {variant}>
  <StatusGlyph {glyph} size="sm" {tone} />
  <span>{label}</span>
</Badge>
