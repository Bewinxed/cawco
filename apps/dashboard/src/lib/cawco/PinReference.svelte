<script lang="ts">
  /**
   * A pin named in written words (`[label](cawco:pin/<artifact>/<number>)`,
   * core references.ts), drawn as its chip: the inline chip (ui/chip
   * `inline`) with the pin's pill as its mark (PinMark, the inline chip's
   * line tall) and what it stands on as its label (core pin-name.ts), read
   * from the artifact's doc as the dashboard holds it as the chip is first
   * drawn, else the written label, and kept from then on. Its state is the pill's: recessed once resolved, its dashed ring
   * once its element is gone, the needs-you dot while an answer there is
   * unread (core `newAnswer`). Pressed, the artifact comes to the front of
   * the panel with the pin's thread open (reference-open.svelte.ts).
   */
  import { commentWords, pinReference } from "@cawco/core";
  import { newAnswer } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import { Portal } from "bits-ui";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import { pinNamed } from "./artifact-names.svelte";
  import { dur } from "./motion/curves.svelte";
  import PinMark, { markState } from "./preview/PinMark.svelte";
  import PinPeek from "./preview/PinPeek.svelte";
  import ReferenceChip from "./ReferenceChip.svelte";

  let { id, label = "" }: { id: string; label?: string } = $props();

  const named = $derived(pinReference(id));
  const pin = $derived(pinNamed(id));
  /*
   * Its words, as its first paint draws them, kept: what the pin stands on
   * (core pin-name.ts; DESIGN.md, a pin's chip: "its label what it stands
   * on"), known by then (references.ts draws the chip once its artifact's
   * pins are), else the written label where the hub couldn't say. A press
   * that opens the artifact, and its doc loading, never rewrite them: a chip
   * keeps its words and its width from its first paint. Its state (resolved,
   * gone, unread) stays live; none of it moves its width.
   */
  const words = untrack(() => (pin ? pinName(pin) : label));
  const unread = $derived(!!pin && newAnswer(pin));

  /*
   * Resting a mouse on it peeks its thread (PinPeek, the pill's own peek on
   * the page) under it, after `--dur-peek`: what it stands on, its first
   * words, the agent's last line. Never under a finger, where a press opens
   * it; the chip's own name carries its state for a screen reader.
   */
  let chip = $state<HTMLButtonElement>();
  let peekAt = $state<{ h: number; w: number; x: number; y: number } | null>(
    null
  );
  let peekTimer: ReturnType<typeof setTimeout> | undefined;
  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");
  function rest() {
    clearTimeout(peekTimer);
    if (!(fine.current && pin && chip)) {
      return;
    }
    const at = chip;
    peekTimer = setTimeout(() => {
      const r = at.getBoundingClientRect();
      // Under the chip, as the pill's peek stands beside its pill.
      peekAt = { x: r.left, y: r.bottom, w: 0, h: r.height };
    }, dur("--dur-peek"));
  }
  function leave() {
    clearTimeout(peekTimer);
    peekAt = null;
  }
  $effect(() => () => clearTimeout(peekTimer));

  /** Its name, by its state (the design's words). */
  const title = $derived.by(() => {
    const number = named?.number ?? 0;
    if (pin?.resolvedAt) {
      return `Pin ${number} · resolved`;
    }
    if (pin?.movedAt) {
      return `Pin ${number} · its element is gone`;
    }
    return `Pin ${number} on ${words}`;
  });
</script>

<!-- The chip stands in a line of text as a word does (ui/chip `inline`). -->
<ReferenceChip
  aria-label={unread ? `${title}, ${commentWords.newAnswer}` : title}
  artifact={named?.artifact}
  at={{ pin: named?.number ?? 0 }}
  data-pin-chip={id}
  data-state={pin ? markState(pin) : undefined}
  data-unread={unread || undefined}
  onblur={leave}
  onpointerenter={rest}
  onpointerleave={leave}
  onpress={leave}
  refKey="ref:{id}:pin"
  {words}
  bind:ref={chip}
>
  {#snippet mark()}
    <span data-slot="mark" class="inline-flex flex-none" data-box>
      <PinMark
        dot={unread ? "unread" : null}
        gone={!!pin?.movedAt}
        number={named?.number ?? null}
        size="inline"
        state={pin ? markState(pin) : "sent"}
      />
    </span>
  {/snippet}
</ReferenceChip><Portal>
  {#if peekAt && pin}
    <!-- The viewport is its room: a transcript's rows clip what stands inside them. -->
    <div
      class="pointer-events-none fixed inset-0 z-(--layer-float)"
      data-slot="pin-chip-peek"
    >
      <PinPeek mark={peekAt} {pin} room={{ w: innerWidth, h: innerHeight }} />
    </div>
  {/if}
</Portal>
