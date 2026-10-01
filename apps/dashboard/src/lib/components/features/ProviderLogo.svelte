<script lang="ts">
  /**
   * The lab's mark for a model, as a passive glyph next to its name — in a
   * delegate's header or a picker row. The logos are brand-coloured (that is
   * the point of them), so a caller never tints them: it may only place them.
   * A model nobody here has a logo for renders nothing, and the caller keeps
   * whatever it had been showing instead.
   */
  import type { Component } from "svelte";
  import { providerOf } from "$lib/cawco/models.svelte";
  /*
   * Every mark here is square, and that is a hard requirement rather than a
   * coincidence: the caller sizes this with one number, so a mark whose viewBox
   * is wider than it is tall gets letterboxed inside that square and lands
   * shorter than the number asked for. The `logos` set is a brand set, not an
   * icon set, and several of its entries are wordmarks — `logos:nvidia` is
   * 512x98, so at 9px it draws 1.7px of ink and reads as a smudge, while
   * `logos:google-gemini` (512x188) and `logos:meta-icon` (256x171) land short
   * by different amounts again. That is why a single ring could never sit at an
   * even distance from all of them. Where `logos` has only a wide mark, the
   * square sibling from `thesvg-color` is used instead.
   */
  import IconClaude from "~icons/logos/claude-icon";
  import IconGrok from "~icons/logos/grok-icon";
  import IconMistral from "~icons/logos/mistral-ai-icon";
  import IconMoonshot from "~icons/logos/moonshot-ai-icon";
  import IconOpenai from "~icons/logos/openai-icon";
  import IconQwen from "~icons/logos/qwen-icon";
  import IconDeepseek from "~icons/thesvg-color/deepseek";
  import IconGemini from "~icons/thesvg-color/google-gemini";
  import IconMeta from "~icons/thesvg-color/metaai";
  import IconMinimax from "~icons/thesvg-color/minimax";
  /* `nemotron` is the only id that resolves to this lab (see `provider.ts`), so
     the Nemotron mark is the accurate one as well as the square one. */
  import IconNvidia from "~icons/thesvg-color/nvidia-nemotron";
  import IconZhipu from "~icons/thesvg-color/zhipu";

  const LOGOS: Record<string, Component> = {
    anthropic: IconClaude,
    openai: IconOpenai,
    deepseek: IconDeepseek,
    google: IconGemini,
    xai: IconGrok,
    qwen: IconQwen,
    moonshot: IconMoonshot,
    zhipu: IconZhipu,
    meta: IconMeta,
    mistral: IconMistral,
    minimax: IconMinimax,
    nvidia: IconNvidia,
  };

  let {
    model,
    size = 16,
    class: className = "",
  }: {
    /** The model id as known on the wire; the provider is read off its name. */
    model: string;
    /** Edge of the square the mark sits in, in px. Every mark here is square. */
    size?: number;
    class?: string;
  } = $props();

  const Logo = $derived(LOGOS[providerOf(model) ?? ""]);

  // A `Record` lookup returns the component or `undefined`; that is the signal
  // the caller's own glyph should keep standing. So the whole body is guarded.
</script>

{#if Logo}
  <!--
    Sized in CSS, not by `width`/`height` alone. Those are presentation
    attributes, which sit at the bottom of the cascade and lose to any rule that
    happens to match — and these marks arrive from `unplugin-icons` already
    carrying `width="1.2em" height="1.2em"`, which every other icon in the app
    overrides with a `size-*` class. A caller asking for 9px inside a 16px ring
    cannot afford to be the one place where that silently resolves to `1.2em`
    instead. The attributes stay for the intrinsic size before CSS applies.
  -->
  <Logo
    class={className}
    height={size}
    style="width:{size}px;height:{size}px"
    width={size}
  />
{/if}
