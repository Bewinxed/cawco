<script lang="ts">
  /**
   * tsk-3's numbered pin as the pane draws it, the overlay's disc on the
   * page: a 20px coral disc, its number in `on-action`; at 40% once
   * resolved; recessed in the moved tray.
   *
   * While it holds an answer the person has not looked at (core
   * `pinUnread`) it wears the needs-you dot (DESIGN.md, Status dot): 6px in
   * `status-attn-glyph`, centred on the disc's rim at its top-right, the disc
   * cut away 1.5px round it (a hole in its mask, so the row's own surface
   * shows round the dot on any wash), echoing three loops as the working
   * indicator does, then still; with reduced motion, still.
   */
  import type { Attachment } from "svelte/attachments";
  import { dur, ease, motionOk, numberOf } from "../motion/curves.svelte";

  let {
    number,
    resolved = false,
    moved = false,
    unread = false,
    inline = false,
  }: {
    number: number;
    resolved?: boolean;
    moved?: boolean;
    unread?: boolean;
    /** Set in a line of text, as an inline chip's mark: the row mark's size (`c-row-mark`), so it is no taller than the chip's line. */
    inline?: boolean;
  } = $props();

  /** How many loops the dot echoes before it stands still (motion/echo's `ECHOES`). */
  const ECHOES = 3;
  /** The echo's first opacity: DESIGN.md's working indicator, "fades from 45%". */
  const ECHO_FROM = 0.45;

  /** The dot's echo: a copy of it growing to `--echo-scale` and fading over `--dur-loop`, three times. */
  const echo: Attachment<HTMLElement> = (node) => {
    if (!motionOk.current) {
      return;
    }
    const beat = node.animate(
      [
        { transform: "scale(1)", opacity: ECHO_FROM },
        { transform: `scale(${numberOf("--echo-scale")})`, opacity: 0 },
      ],
      {
        duration: dur("--dur-loop"),
        easing: ease("--ease-out"),
        iterations: ECHOES,
        fill: "forwards",
      }
    );
    return () => beat.cancel();
  };
</script>

<!-- mark-line: the disc and its dot are one mark, laid out by the row that holds it -->
<span
  class={[
    "relative inline-grid shrink-0",
    inline ? "size-c-row-mark" : "size-c-pin",
  ]}
  data-unread={unread || undefined}
  style:--dot-x="calc(50% + 50% * cos(45deg))"
  style:--dot-y="calc(50% - 50% * sin(45deg))"
  style:--hole="calc(var(--status-dot-size) / 2 + var(--status-dot-cut))"
  style:--hole-mask={"radial-gradient(circle at var(--dot-x) var(--dot-y), transparent calc(var(--hole) - var(--c-tree-mark-hole-edge)), var(--mask-opaque) calc(var(--hole) + var(--c-tree-mark-hole-edge)))"}
>
  <span
    data-moved={moved || undefined}
    aria-hidden="true"
    data-resolved={resolved || undefined}
    data-slot="disc"
    class="inline-grid place-items-center size-full rounded-pill bg-action-solid text-on-action type-label num data-resolved:opacity-40 data-moved:bg-surface-fill data-moved:text-ink-muted in-data-unread:mask-(--hole-mask)"
    >{number}</span
  >
  {#if unread}
    <span
      aria-hidden="true"
      data-slot="unread-echo"
      class="absolute left-(--dot-x) top-(--dot-y) size-(--status-dot-size) -translate-1/2 rounded-pill bg-status-attn-glyph opacity-0 pointer-events-none"
      {@attach echo}
    ></span>
    <span
      aria-hidden="true"
      data-slot="unread"
      class="absolute left-(--dot-x) top-(--dot-y) size-(--status-dot-size) -translate-1/2 rounded-pill bg-status-attn-glyph pointer-events-none"
    ></span>
  {/if}
</span>
