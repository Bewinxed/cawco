<script lang="ts">
  /**
   * A provider's mark, as a passive glyph: the lab behind a model (next to its
   * name in a delegate's header or a picker row), or a provider named outright
   * (GitHub on the clone controls, OpenAI on the Codex tab). A caller never
   * tints a mark: it may only place it. Multi-colour marks keep their brand
   * colours. A mark drawn in one ink (see `INK`) ships as fixed black, which
   * vanishes on the dark theme, so it is filled with `--ink-strong` instead and
   * follows the theme. A model nobody here has a logo for renders nothing, and
   * the caller keeps whatever it had been showing instead.
   */
  import type { Component } from "svelte";
  import { providerOf } from "#lib/cawco/models.svelte.js";
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
  import IconGithub from "~icons/logos/github-icon";
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
    github: IconGithub,
  };

  /* The marks drawn in a single ink. Upstream they carry a fixed dark fill
     (the GitHub mark) or none at all, which paints black. */
  const INK = new Set(["openai", "xai", "moonshot", "github"]);

  let {
    model = "",
    provider,
    size = 16,
    class: className = "",
    style = "",
  }: {
    /** The model id as known on the wire; the provider is read off its name. */
    model?: string;
    /** The provider named outright, for a mark that stands for no model. */
    provider?: string;
    /** Edge of the square the mark sits in, in px. Every mark here is square.
        `null` leaves the size to the caller's own CSS. */
    size?: number | null;
    class?: string;
    style?: string;
  } = $props();

  const key = $derived(provider ?? providerOf(model) ?? "");
  const Logo = $derived(LOGOS[key]);
  const sized = $derived(size === null ? {} : { width: size, height: size });
  const box = $derived(
    size === null ? "" : `width:${size}px;height:${size}px;`
  );

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
    aria-hidden="true"
    class={INK.has(key) ? `${className} provider-ink` : className}
    style={`${box}${style}`}
    {...sized}
  />
{/if}

<style>
  /* The ink is the mark's `color`, and its shapes fill with `currentColor`.
     `--ink-strong` is a `light-dark()` value, and WebKit resolved that
     function wrongly inside an SVG `fill` (bugs.webkit.org 283489), which
     left these marks in the light theme's ink on the dark ground. `color`
     takes the same token the way every line of text does. The descendants
     too: `github-icon` sets its fill on the path, and a presentation
     attribute loses to any rule that matches. A caller never tints a mark,
     so a row that colours its own icons (`.row svg.lead` on the clone field)
     must not reach this one: the ink is declared over any such rule. */
  :global(svg.provider-ink) {
    color: var(--ink-strong) !important;
  }
  :global(svg.provider-ink),
  :global(svg.provider-ink *) {
    fill: currentColor;
  }
</style>
