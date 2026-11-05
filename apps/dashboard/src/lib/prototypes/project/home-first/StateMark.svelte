<script lang="ts" module>
  import {
    IconAsk,
    IconDecisions,
    IconError,
    IconGlobe,
    IconHourglass,
    IconNeedsYou,
    IconNotYet,
    IconPause,
    IconSend,
    IconTaskList,
    IconTick,
    IconWorking,
  } from "#lib/icons.js";
  import type { NeedKind, WorkState } from "./model";

  /** Every state a row's mark draws: a work state, a session's end, or a kind of wait. */
  export type Mark =
    WorkState | "done" | "stopped" | "idle" | `need-${NeedKind}`;

  /**
   * Each mark's glyph and ink (DESIGN.md, Session status: refresh for
   * Working, hand-shake for Needs you, the close X for Failed, pause for
   * Idle and Stopped, a dotted ring for Not yet). Stuck is the hourglass in
   * the attention hue: blocked work waits on someone. A wait's kind is its
   * own glyph in muted ink, the Needs you dot beside the row's words.
   */
  const LOOK = {
    working: { icon: IconWorking, ink: "text-status-live-glyph" },
    asks: { icon: IconNeedsYou, ink: "text-status-attn-glyph" },
    stuck: { icon: IconHourglass, ink: "text-status-attn-glyph" },
    failed: { icon: IconError, ink: "text-status-fail-glyph" },
    queued: { icon: IconNotYet, ink: "text-ink-muted" },
    done: { icon: IconTick, ink: "text-status-done-glyph" },
    stopped: { icon: IconPause, ink: "text-ink-muted" },
    idle: { icon: IconPause, ink: "text-ink-muted" },
    "need-review": { icon: IconTaskList, ink: "text-ink-muted" },
    "need-failed": { icon: IconError, ink: "text-status-fail-glyph" },
    "need-ask": { icon: IconAsk, ink: "text-ink-muted" },
    "need-picks": { icon: IconDecisions, ink: "text-ink-muted" },
    "need-action": { icon: IconSend, ink: "text-ink-muted" },
    "need-browser": { icon: IconGlobe, ink: "text-ink-muted" },
  } as const satisfies Record<Mark, { icon: unknown; ink: string }>;
</script>

<script lang="ts">
  /**
   * A row's mark: the glyph alone in its ink, centred in the row's 28px
   * lead column (DESIGN.md, The Row Grid Rule), named for a screen reader
   * by `label`, the word the row shows beside it (The Glyph, Word, Hue
   * Rule). Working breathes.
   */
  let {
    mark,
    label,
    line = false,
  }: {
    mark: Mark;
    label: string;
    /** Stand at a label line's height, beside a row's first line, rather than centred on the row. */
    line?: boolean;
  } = $props();
  const look = $derived(LOOK[mark]);
</script>

<span
  class={[
    "grid w-c-row-lead flex-none place-items-center",
    line && "h-lh type-label",
  ]}
  aria-label={label}
  data-box
  role="img"
>
  <look.icon
    aria-hidden="true"
    class={["size-icon-md", look.ink, mark === "working" && "breathe loops"]}
  />
</span>
