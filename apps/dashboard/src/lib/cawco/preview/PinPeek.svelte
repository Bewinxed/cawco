<!--
  A comment's peek while the pointer rests on its pill on the page
  (DESIGN.md, A pin's pill; comment design §4): the floating tag recipe
  (`--surface-raised`, `--border-control`, `--shadow-tile`, `--radius-sm`),
  at most `--c-pin-card-w`, beside the pill: where it stands and how long
  ago in meta, what it carries after a paperclip, its first words to two
  lines, and the agent's last line once there is one. The pane draws it
  only under a mouse; it appears after `--dur-peek` the first time
  and at once while one is up, fading in from `--press-scale`, and leaves
  at once.
-->
<script lang="ts">
  import type { Pin } from "@cawco/core/comments";
  import { IconAgent, IconPaperclip } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import { frameObserver } from "../frame-observer";
  import { dur, easeOut, motionOk, numberOf } from "../motion/curves.svelte";
  import { attachedTo, lastActivity } from "./comment-rows";
  import { commentWords as said } from "./comment-words";
  import { pinName } from "./pin-name";

  let {
    pin,
    mark,
    room,
  }: {
    pin: Pin;
    /** The pill's box in the well, px. */
    mark: { h: number; w: number; x: number; y: number };
    room: { h: number; w: number };
  } = $props();

  let peek = $state<HTMLDivElement>();
  let width = $state(0);
  let height = $state(0);
  // Its size as it mounts, then each change in the next frame (frameObserver):
  // where it stands follows its width, and a width written inside the
  // delivery would place it again inside the pass that measured it.
  $effect(() => {
    const el = peek;
    if (!el) {
      return;
    }
    const read = () => {
      width = el.offsetWidth;
      height = el.offsetHeight;
    };
    read();
    const watch = frameObserver(read);
    watch.observe(el);
    return () => watch.disconnect();
  });
  const gap = $derived(numberOf("--space-1") || 4);
  const left = $derived(
    mark.x + mark.w + gap + width <= room.w
      ? mark.x + mark.w + gap
      : Math.max(0, mark.x - gap - width)
  );
  const top = $derived(Math.max(0, Math.min(mark.y, room.h - height)));
  const attached = $derived(attachedTo(pin));
  const first = $derived(
    pin.thread[0]?.text.trim() || attached.map((one) => one.name).join(", ")
  );
  const last = $derived(
    pin.thread.findLast((entry) => entry.by === "agent") ?? null
  );

  function show(_node: Element) {
    const from = numberOf("--press-scale") || 0.98;
    return {
      duration: dur("--dur-control"),
      easing: easeOut,
      css: (t: number) =>
        motionOk.current
          ? `opacity: ${t}; transform: scale(${from + (1 - from) * t})`
          : `opacity: ${t}`,
    };
  }
</script>

<div
  aria-hidden="true"
  class="pointer-events-none absolute start-(--peek-x) top-(--peek-y) z-3 flex flex-col gap-space-1 max-w-c-pin-card-w px-space-2 py-space-1 border border-border-control rounded-sm bg-surface-raised shadow-tile origin-top-left"
  data-slot="pin-peek"
  bind:this={peek}
  in:show
  style:--peek-x="{left}px"
  style:--peek-y="{top}px"
>
  <span
    class="flex min-w-0 items-center gap-space-1 type-meta text-ink-muted mark-line"
  >
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{pin.movedAt ? said.elementGone : pinName(pin)}</span
    ><span class="flex-none num"
      >· {formatAgeShort(Date.parse(lastActivity(pin)))}</span
    >
    {#if attached.length > 0}
      <span class="flex-none">·</span><span
        class="grid size-icon-sm flex-none place-items-center"
        data-box><IconPaperclip class="size-icon-sm" /></span
      ><span class="flex-none num">{attached.length}</span>
    {/if}
  </span>
  {#if first}
    <span
      class="line-clamp-2 type-body text-ink-strong text-pretty wrap-anywhere"
      >{first}</span
    >
  {/if}
  {#if last}
    <span
      class="flex min-w-0 items-center gap-space-1 type-meta text-ink-muted mark-line"
      ><span class="grid size-icon-sm flex-none place-items-center" data-box
        ><IconAgent class="size-icon-sm" /></span
      ><span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
        >{last.text.split("\n")[0]}</span
      ></span
    >
  {/if}
</div>
