<!--
  A comment's marker, as comment-design §4 draws it: a pill `--c-pin` tall,
  `--c-pin` wide for one digit and 6px in each side for two or three, its
  figure in the caps role in tabular figures, a 2px raised ring then the xs
  shadow. Its fill by state (provisional hollow and bare, unsent hollow with
  its figure in the action ink, sent solid, resolved recessed). `tail` names
  the corner that stands on the pressed point (the tail-corner shape); none
  is the round pill. Focused, a second ring in the focus ink; a dot on its
  top end says the agent is working (pulsing) or a reply is unread (still).
-->
<script lang="ts">
  import type { PinState } from "../data";

  let {
    n = null,
    state = "sent",
    tail = "none",
    focused = false,
    dot = null,
    gone = false,
  }: {
    n?: number | null;
    state?: PinState;
    tail?: "bottom-start" | "bottom-end" | "top-start" | "none";
    focused?: boolean;
    dot?: "live" | "unread" | null;
    gone?: boolean;
  } = $props();
</script>

<span
  class={[
    "relative inline-flex h-(--c-pin) min-w-(--c-pin) flex-none items-center justify-center rounded-pill type-caps num leading-none ring-2 ring-surface-raised shadow-xs",
    n !== null && n >= 10 && "px-1.5",
    tail === "bottom-start" && "rounded-es-hair",
    tail === "bottom-end" && "rounded-ee-hair",
    tail === "top-start" && "rounded-ss-hair",
    state === "provisional" && "border-2 border-action-solid bg-surface-raised",
    state === "unsent" &&
      "border-2 border-action-solid bg-surface-raised text-action-solid",
    state === "sent" && "bg-action-solid text-on-action",
    state === "resolved" && "bg-surface-fill-strong text-ink-muted",
    focused && "outline-2 outline-offset-2 outline-focus-ring",
    gone && "outline-[1.5px] outline-offset-2 outline-dashed outline-border-control",
  ]}
  data-marker
  data-state={state}
>
  {#if n !== null}<span data-figure>{n}</span>{/if}
  {#if dot}
    <span
      aria-hidden="true"
      data-dot
      class={[
        "absolute -end-0.5 -top-0.5 size-(--status-dot-size) rounded-pill bg-status-live-glyph shadow-[0_0_0_var(--status-dot-cut)_var(--surface-raised)]",
        dot === "live" && "motion-safe:animate-pulse",
      ]}
    ></span>
  {/if}
</span>
