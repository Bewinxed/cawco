<script lang="ts" module>
  /**
   * `text` with a "\n" wherever it wraps in `host` at the width `host` is
   * laid out at, read off a hidden copy of it: the morph lays its text on one
   * line and breaks lines only at "\n", so a wrapped paragraph handed to it
   * plain would morph on one long line and jump back to its lines when the
   * morph ends.
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
   * settled. First draw and
   * reduced motion never morph: the text is just the new text.
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
  /** As the morph is handed it: broken at its wraps, for a paragraph. */
  const lines = (value: string): string =>
    wrap && host ? broken(host, value) : value;

  let morphMs = $state(0);
  $effect(() => {
    morphMs = motionOk.current ? dur("--dur-morph") : 0;
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
      const drawn = new Morph(root, morphMs, CURVE.out);
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
    const to = untrack(() => lines(next));
    if (morph) {
      // Mid-morph: the next step starts from what is drawn.
      step(morph, to);
      return;
    }
    if (!host) {
      return;
    }
    const box = host.getBoundingClientRect();
    // Inline, its rect is the run of its words; its height is the font's,
    // not the line's, so only a block (a paragraph) holds its height.
    swap = {
      from: untrack(() => lines(was)),
      to,
      width: box.width,
      height: wrap ? box.height : 0,
    };
    morphing = true;
  });
</script>

<span class={["morph-text", wrap && "wrap"]} bind:this={host}
  >{#if morphing}<span class="letters" aria-hidden="true" {@attach letters}
    ></span><span class="said">{text}</span>{:else}{text}{/if}</span
>

<style>
  .wrap {
    display: block;
  }
  /* The letters' box: one line broken only at "\n", the morph holding its
     size. Nothing it draws reaches past the box on the inline axis; clip
     (unlike hidden) keeps its text baseline. */
  .letters {
    display: inline-block;
    position: relative;
    overflow-x: clip;
    white-space: nowrap;

    > :global(:not(br)) {
      display: inline-block;
      white-space: pre;
    }
    /* A digit rolls in a slot that clips it on the block axis only, so a
       glyph's overhang is not shaved. */
    > :global([data-roll]) {
      clip-path: inset(0 -100vw);
    }
    > :global([data-roll] > span) {
      display: inline-block;
    }
  }
  /* The words once as plain text for screen readers; the letters are
     aria-hidden. Clipped rather than display: none, which would take it out
     of the accessibility tree too; not selectable, or a copy pastes it
     twice. */
  .said {
    position: absolute;
    inline-size: 1px;
    block-size: 1px;
    margin: -1px;
    overflow: hidden;
    clip-path: inset(50%);
    white-space: pre;
    user-select: none;
  }
</style>
