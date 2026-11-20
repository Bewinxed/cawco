<script lang="ts">
  /**
   * One section of the project details card: the kit's section head (its
   * glyph in the section's hue, its name a heading, so the card reads as
   * its outline), the one line saying what it decides, then what it holds.
   * Every section stands under a hairline, as the settings pages part
   * theirs (config ToolChoice, ImageDefault), and the card's gap between
   * sections is wider than any gap inside one.
   */
  import type { Component, Snippet } from "svelte";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { cardForms } from "./card-layout";

  let {
    name,
    line,
    key,
    icon,
    hue,
    inline = false,
    children,
  }: {
    name: string;
    /** What the section decides, in one line. */
    line?: string;
    /** Its key, which the top line's press moves focus to. */
    key: string;
    icon: Component;
    /** Its glyph's hue: a mark ramp's colour. */
    hue: string;
    /** Its name and its line on one line (a section across the card). */
    inline?: boolean;
    children: Snippet;
  } = $props();

  const forms = cardForms();
  /** The room under the hairline; the card's column gap gives the room over it. */
  const RULE = {
    wide: "pt-space-5",
    roomy: "pt-space-4",
    tight: "pt-space-3",
  } as const;
</script>

<section
  aria-label={name}
  class={[
    "flex min-w-0 flex-col gap-space-3 border-t border-border-hairline",
    RULE[forms().rule],
  ]}
  data-section={key}
>
  <header
    class={inline
      ? "flex flex-wrap items-baseline gap-x-space-3 gap-y-space-1"
      : "flex flex-col gap-space-1"}
  >
    <SectionHeader {hue} {icon} label={name} level={3} />
    {#if line}
      <p class="m-0 type-meta text-pretty text-ink-muted">
        {line}
      </p>
    {/if}
  </header>
  {@render children()}
</section>
