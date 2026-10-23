<script lang="ts">
  /**
   * A pin named in written words (`[label](cawco:pin/<artifact>/<number>)`,
   * core references.ts), drawn as its chip: the inline chip (ui/chip
   * `inline`) with the pin's pill as its mark (PinMark, the inline chip's
   * line tall) and what it stands on as its label (core pin-name.ts), read
   * from the artifact's doc as the dashboard holds it now, else the written
   * label. Its state is the pill's: recessed once resolved, its dashed ring
   * once its element is gone, the needs-you dot while an answer there is
   * unread (core `newAnswer`). Pressed, the artifact comes to the front of
   * the panel with the pin's thread open (reference-open.svelte.ts).
   */
  import { commentWords, pinReference } from "@cawco/core";
  import { newAnswer } from "@cawco/core/comments";
  import { pinName } from "@cawco/core/pin-name";
  import { Portal } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import { artifactMarks } from "./artifact-names.svelte";
  import { dur } from "./motion/curves.svelte";
  import PinMark, { markState } from "./preview/PinMark.svelte";
  import PinPeek from "./preview/PinPeek.svelte";
  import RowFault from "./RowFault.svelte";
  import { openReference } from "./reference-open.svelte";
  import { refusals } from "./refusals.svelte";

  let { id, label = "" }: { id: string; label?: string } = $props();

  const named = $derived(pinReference(id));
  const pin = $derived.by(() => {
    const at = named;
    return at
      ? (artifactMarks(at.artifact)?.pins.find(
          (one) => one.number === at.number
        ) ?? null)
      : null;
  });
  const words = $derived(pin ? pinName(pin) : label);
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
  /** Where the last press's refusal is said: beside the chip, kept through a reload. */
  const refKey = $derived(`ref:${id}:pin`);
  async function press(): Promise<void> {
    if (!named) {
      return;
    }
    const key = refKey;
    const refused = await openReference(named.artifact, { pin: named.number });
    if (refused) {
      refusals.set(key, { reason: refused });
    } else {
      refusals.delete(key);
    }
  }
</script>

<!-- The chip stands in a line of text as a word does (ui/chip `inline`). -->
<button
  aria-label={unread ? `${title}, ${commentWords.newAnswer}` : title}
  class={chipVariants({ variant: "inline" })}
  data-pin-chip={id}
  data-state={pin ? markState(pin) : undefined}
  data-unread={unread || undefined}
  onblur={leave}
  onclick={() => {
    leave();
    return press();
  }}
  onpointerenter={rest}
  onpointerleave={leave}
  type="button"
  bind:this={chip}
>
  <span data-slot="mark" class="inline-flex flex-none" data-box>
    <PinMark
      dot={unread ? "unread" : null}
      gone={!!pin?.movedAt}
      number={named?.number ?? null}
      size="inline"
      state={pin ? markState(pin) : "sent"}
    />
  </span>
  <span data-slot="label">{words}</span>
</button>
<!-- A press the hub refused, said beside the chip in the sentence it
     stands in, with Try again. -->
<RowFault
  again={press}
  class="inline-block max-w-full align-baseline"
  data-reference-refused
  reason={refusals.reason(refKey)}
/><Portal>
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
