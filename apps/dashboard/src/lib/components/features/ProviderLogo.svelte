<script lang="ts" module>
  import type { VariantProps } from "tailwind-variants";
  import { tv } from "#lib/utils.js";

  /** Its size by where it stands (DESIGN.md, Icons, Sizes: "12px beside meta
      text, 16px in controls and rows (the default for any unsized icon),
      20px in nav and headers"), and its callers' look: at 80%. A caller
      never tints a mark, so no look carries a colour. */
  export const providerLogoVariants = tv({
    variants: {
      size: {
        meta: "size-icon-sm",
        control: "size-icon-md",
        nav: "size-icon-lg",
      },
      fade: { dim: "opacity-80" },
    },
    defaultVariants: { size: "control" },
  });

  export type ProviderLogoLooks = VariantProps<typeof providerLogoVariants>;
</script>

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
  import { cn } from "#lib/utils.js";
  /*
   * Every mark here is square, and that is a hard requirement rather than a
   * coincidence: the caller sizes this with one role, so a mark whose viewBox
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
  import IconLinear from "~icons/logos/linear-icon";
  import IconMistral from "~icons/logos/mistral-ai-icon";
  import IconMoonshot from "~icons/logos/moonshot-ai-icon";
  import IconOpenai from "~icons/logos/openai-icon";
  import IconQwen from "~icons/logos/qwen-icon";
  import IconSlack from "~icons/logos/slack-icon";
  import IconDeepseek from "~icons/thesvg-color/deepseek";
  import IconGmail from "~icons/thesvg-color/gmail";
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
    linear: IconLinear,
    slack: IconSlack,
    gmail: IconGmail,
  };

  /* The marks drawn in a single ink. Upstream they carry a fixed dark fill
     (the GitHub mark) or none at all, which paints black. */
  const INK = new Set(["openai", "xai", "moonshot", "github", "linear"]);

  let {
    model = "",
    provider,
    size,
    class: className = "",
    fade,
  }: ProviderLogoLooks & {
    /** The model id as known on the wire; the provider is read off its name. */
    model?: string;
    /** The provider named outright, for a mark that stands for no model. */
    provider?: string;
    class?: string;
  } = $props();

  const key = $derived(provider ?? providerOf(model) ?? "");
  const Logo = $derived(LOGOS[key]);
  const classes = $derived(
    cn(providerLogoVariants({ size, fade }), className)
  );

  // A `Record` lookup returns the component or `undefined`; that is the signal
  // the caller's own glyph should keep standing. So the whole body is guarded.
</script>

{#if Logo}
  <!--
    Sized by its role's `size-*` class: these marks arrive from
    `unplugin-icons` carrying `width="1.2em" height="1.2em"`, presentation
    attributes at the bottom of the cascade, which the class overrides as it
    does on every other icon in the app.
  -->
  <Logo
    data-provider-logo-class={classes}
    aria-hidden="true"
    data-slot="provider-logo"
    data-ink={INK.has(key) || undefined}
    class={INK.has(key) ? cn(classes, "text-ink-strong") : classes}
  />
{/if}
