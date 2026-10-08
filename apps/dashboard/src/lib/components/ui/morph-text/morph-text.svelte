<script lang="ts" module>
  /**
   * `text` with a "\n" wherever it wraps in `host` at the width `host` is
   * laid out at, read off a hidden copy of it: torph lays its text on one
   * line and breaks lines only at "\n" (its README, "Multi-line text"), so a
   * wrapped paragraph handed to it plain would morph on one long line and
   * jump back to its lines when the morph ends.
   */
  const TRAILING_SPACE = / $/;

  function broken(host: HTMLElement, text: string): string {
    const parent = host.parentElement;
    if (!parent) {
      return text;
    }
    const probe = host.cloneNode(false) as HTMLElement;
    // Its width to the subpixel: rounded down, a line that just fits at rest
    // wrapped in the copy, and the morph broke it where it never breaks.
    probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;inset-inline-start:0;inset-block-start:0;inline-size:${host.getBoundingClientRect().width}px`;
    probe.textContent = text;
    parent.append(probe);
    const node = probe.firstChild as Text;
    const range = document.createRange();
    let out = "";
    let top: number | null = null;
    for (let i = 0; i < text.length; i += 1) {
      if (text[i] !== " " && (i === 0 || text[i - 1] === " ")) {
        range.setStart(node, i);
        range.setEnd(node, i + 1);
        const y = Math.round(range.getBoundingClientRect().top);
        if (top !== null && y > top + 1) {
          out = `${out.replace(TRAILING_SPACE, "")}\n`;
        }
        top = y;
      }
      out += text[i];
    }
    probe.remove();
    return out;
  }
</script>

<script lang="ts">
  /**
   * Text that morphs from the old words to the new ones when `text` changes,
   * and is plain text otherwise. TextMorph draws its text twice (a plain copy
   * for screen readers beside its aria-hidden letters, so textContent
   * doubles) and a mounted one per row costs script on every row of a long
   * list, so it is mounted only for the length of a swap: it takes the words
   * the text had, then the new ones on the next frame, and the plain text
   * returns when the morph has run. First draw and reduced motion never
   * morph: the text is just the new text.
   *
   * `wrap`: the text is a paragraph that wraps. It stands in a block of its
   * own, and each side of the morph is handed over broken where it wraps at
   * that block's width, so the morph keeps the lines the text has at rest.
   */
  import { untrack } from "svelte";
  import { TextMorph } from "torph/svelte";
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";

  let { text, wrap = false }: { text: string; wrap?: boolean } = $props();

  let host = $state<HTMLElement | null>(null);
  /** As torph is handed it: broken at its wraps, for a paragraph. */
  const lines = (value: string): string =>
    wrap && host ? broken(host, value) : value;

  let morphMs = $state(0);
  $effect(() => {
    morphMs = motionOk.current ? dur("--dur-morph") : 0;
  });
  let morphing = $state(false);
  let morphText = $state("");
  let shownText = untrack(() => text);
  let morphTimer: ReturnType<typeof setTimeout> | undefined;
  $effect.pre(() => {
    const next = text;
    if (next === shownText) {
      return;
    }
    const was = shownText;
    shownText = next;
    if (!morphMs) {
      return;
    }
    clearTimeout(morphTimer);
    if (!morphing) {
      morphText = untrack(() => lines(was));
      morphing = true;
    }
    requestAnimationFrame(() => {
      morphText = lines(next);
    });
    morphTimer = setTimeout(() => {
      morphing = false;
    }, morphMs + 80);
  });
  $effect(() => () => clearTimeout(morphTimer));
</script>

{#snippet body()}
  {#if morphing}
    <TextMorph as="span" duration={morphMs} ease={CURVE.out} text={morphText} />
  {:else}
    {text}
  {/if}
{/snippet}

{#if wrap}
  <span class="morph-wrap" bind:this={host}>{@render body()}</span>
{:else}
  {@render body()}
{/if}

<style>
  .morph-wrap {
    display: block;
  }
</style>
