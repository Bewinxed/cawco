<script lang="ts" module>
  /** A status role, or a machine's presence. */
  export type DotTone =
    "live" | "attn" | "done" | "fail" | "online" | "away" | "off";
</script>

<script lang="ts">
  /**
   * The house status dot (TreeMark's): `--status-dot-size` across, centred
   * on its mark's right edge at `--dot-y` (ChipMark's: half the chip's pad
   * below the corner's line, so the whole dot stands inside the chip's
   * ground), the mark cut away round it by `--status-dot-cut` (ChipMark's
   * mask). Needs you echoes three loops and
   * then stands still (PinMark's echo). A machine's presence: online and
   * away filled in their presence inks, off a hollow `--presence-off` ring.
   */
  let { tone }: { tone: DotTone } = $props();

  const INK: Record<DotTone, string> = {
    live: "var(--status-live-glyph)",
    attn: "var(--status-attn-glyph)",
    done: "var(--status-done-glyph)",
    fail: "var(--status-fail-glyph)",
    online: "var(--presence-online)",
    away: "var(--presence-away)",
    off: "transparent",
  };
</script>

<span
  aria-hidden="true"
  class="absolute z-1 top-(--dot-top) -end-(--dot-off) size-(--status-dot-size) rounded-pill bg-(color:--dot) data-[tone=off]:inset-ring-(length:--status-dot-cut) data-[tone=off]:inset-ring-presence-off"
  data-slot="dot"
  data-tone={tone}
  style:--dot={INK[tone]}
  style:--dot-off="calc(var(--status-dot-size) / 2)"
  style:--dot-top="calc(var(--dot-y) - var(--status-dot-size) / 2)"
>
  {#if tone === "attn"}
    <span
      class="loops absolute inset-0 rounded-pill bg-status-attn-glyph opacity-0 motion-safe:opacity-100 motion-safe:animate-attn-echo"
      data-echo
    ></span>
  {/if}
</span>
