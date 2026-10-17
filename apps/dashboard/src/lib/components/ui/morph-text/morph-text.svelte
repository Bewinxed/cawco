<script lang="ts" module>
  /**
   * `text` with a "\n" wherever it wraps in `host` at the width `host` is
   * laid out at, read off a hidden copy of it: the morph lays its text on one
   * line and breaks lines only at "\n", so a wrapped paragraph handed to it
   * plain would morph on one long line and jump back to its lines when the
   * morph ends.
   */
  const TRAILING_SPACE = / $/;

  /** `text` with a "\n" wherever it wraps in `probe`, laid out already. */
  function linesIn(probe: HTMLElement, text: string): string {
    const node = probe.firstChild as Text | null;
    if (!node) {
      return text;
    }
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
    return out;
  }

  /**
   * Each of `texts` broken where it wraps at `width`, the host's: every copy
   * put in at once and read together, one layout for them all.
   */
  function broken(host: HTMLElement, width: number, texts: string[]): string[] {
    const parent = host.parentElement;
    if (!parent) {
      return texts;
    }
    const probes = texts.map((text) => {
      const probe = host.cloneNode(false) as HTMLElement;
      // Its width to the subpixel: rounded down, a line that just fits at
      // rest wrapped in the copy, and the morph broke it where it never
      // breaks.
      probe.style.cssText = `position:absolute;visibility:hidden;pointer-events:none;inset-inline-start:0;inset-block-start:0;inline-size:${width}px`;
      probe.textContent = text;
      return probe;
    });
    parent.append(...probes);
    const out = texts.map((text, i) => linesIn(probes[i], text));
    for (const probe of probes) {
      probe.remove();
    }
    return out;
  }
</script>

<script lang="ts">
  /**
   * The one way the product swaps words in place: text that morphs from the
   * old words to the new ones when `text` changes, and is plain text
   * otherwise. The morph (morph.ts) holds the text's box steady while the
   * letters cross, so nothing beside it moves, and runs every letter's move
   * and fade on one clock: --dur-morph on --ease-out.
   *
   * The letters are drawn only for the length of a swap: a mounted morph per
   * row costs script on every row of a long list, and it draws its text
   * twice (a plain copy for screen readers beside its aria-hidden letters).
   * It lays out the words the text had and starts the morph to the new ones
   * in the same frame, and the plain text returns once the morph has
   * settled. The first draw never morphs: the text is just the text. With
   * less motion nothing moves: the old words fade out and the new ones in,
   * in the same held box, opacity only, over --dur-morph.
   *
   * `wrap`: the text is a paragraph that wraps. It stands in a block of its
   * own, and each side of the morph is handed over broken where it wraps at
   * that block's width, so the morph keeps the lines the text has at rest.
   *
   * `still`: this change lands without a morph (a figure that changed because
   * the clock moved, not because something happened).
   */
  import { untrack } from "svelte";
  import type { Attachment } from "svelte/attachments";
  import { CURVE, dur, motionOk } from "#lib/cawco/motion/curves.svelte.js";
  import { Morph } from "./morph.js";

  let {
    text,
    wrap = false,
    still = false,
  }: { text: string; wrap?: boolean; still?: boolean } = $props();

  let host = $state<HTMLElement | null>(null);

  let morphMs = $state(0);
  $effect(() => {
    morphMs = dur("--dur-morph");
  });
  let morphing = $state(false);
  /**
   * The swap the letters are mounted for: the words they start from, the
   * box those were drawn in, and the words they morph to.
   */
  let swap = { from: "", to: "", width: 0, height: 0 };
  let morph: Morph | null = null;
  let shownText = untrack(() => text);

  /** One step of the morph; the plain text returns once the last one settles. */
  function step(drawn: Morph, value: string): void {
    drawn.to(value).then((settled) => {
      if (settled && morph === drawn) {
        morphing = false;
      }
    });
  }

  // The old words are laid out as letters and the morph to the new ones
  // starts in the same frame, so the box takes its held size in one step.
  const letters: Attachment<HTMLElement> = (root) =>
    untrack(() => {
      const drawn = new Morph(root, {
        duration: morphMs,
        easing: CURVE.out,
        fade: !motionOk.current,
      });
      drawn.show(swap.from, swap);
      morph = drawn;
      step(drawn, swap.to);
      return () => {
        morph = null;
      };
    });

  $effect.pre(() => {
    const next = text;
    if (next === shownText) {
      return;
    }
    const was = shownText;
    shownText = next;
    if (!morphMs || untrack(() => still)) {
      morphing = false;
      return;
    }
    const paragraph = untrack(() => wrap);
    if (morph) {
      // Mid-morph: the next step starts from what is drawn; a paragraph's
      // words are broken at the host's width first.
      const [to] =
        paragraph && host
          ? broken(host, host.getBoundingClientRect().width, [next])
          : [next];
      step(morph, to);
      return;
    }
    if (!host) {
      return;
    }
    // The host read once: its box is what the swap holds, and its width is
    // what a paragraph's two sides are broken at, read together.
    const box = host.getBoundingClientRect();
    const [from, to] = paragraph
      ? broken(host, box.width, [was, next])
      : [was, next];
    // Inline, its rect is the run of its words; its height is the font's,
    // not the line's, so only a block (a paragraph) holds its height.
    swap = { from, to, width: box.width, height: paragraph ? box.height : 0 };
    morphing = true;
  });
</script>

<!-- literal: -100vw (how far a rolling digit's clip reaches past its slot), inset(50%) (the words said once, clipped away) -->
<span class="data-wrap:block" data-wrap={wrap || undefined} bind:this={host}
  >{#if morphing}<span
      class="relative inline-block overflow-x-clip whitespace-nowrap"
      aria-hidden="true"
      data-slot="letters"
      style:--roll-bleed="-100vw"
      {@attach letters}
    ></span><span
      class="absolute -m-px size-px overflow-hidden whitespace-pre select-none clip-path-(--said-clip)"
      data-slot="said"
      style:--said-clip="inset(50%)">{text}</span
    >{:else}{text}{/if}</span
>

<style>
  /* The letters' box: one line broken only at "\n", the morph holding its
     size. Nothing it draws reaches past the box on the inline axis; clip
     (unlike hidden) keeps its text baseline. */
  /* residual: foreign-dom */
  [data-slot="letters"] {
    > :global(:not(br)) {
      display: inline-block;
      white-space: pre;
    }
    /* A digit rolls in a slot that clips it on the block axis only, so a
       glyph's overhang is not shaved. */
    > :global([data-roll]) {
      clip-path: inset(0 var(--roll-bleed));
    }
    > :global([data-roll] > span) {
      display: inline-block;
    }
  }
</style>
