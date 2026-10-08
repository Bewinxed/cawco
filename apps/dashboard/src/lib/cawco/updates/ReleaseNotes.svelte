<script lang="ts">
  /**
   * A release's notes as the markdown they are (docs/releases/README.md):
   * each section's heading as a small tinted label (New green, Improved cyan,
   * Fixed amber, each with its Solar glyph), then its bullets as a list,
   * drawn by the app's one markdown renderer. The toast, the Home card and
   * Configure › Updates all show notes through this, at the size of the
   * text around them.
   */
  import type { Component } from "svelte";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import { IconBug, IconGraphUp, IconStars } from "#lib/icons.js";

  let { source }: { source: string } = $props();

  /** The three sections a release writes, by heading. */
  const TONES: Record<string, { tone: string; icon: Component }> = {
    New: { tone: "new", icon: IconStars },
    Improved: { tone: "improved", icon: IconGraphUp },
    Fixed: { tone: "fixed", icon: IconBug },
  };

  const HEADING = /^#{1,6}\s+(.+?)\s*$/;

  interface Section {
    body: string;
    heading?: string;
  }

  /** Splits the notes at their headings; bullets before any heading are a section of their own. */
  function sectionsOf(text: string): Section[] {
    const sections: Section[] = [];
    let heading: string | undefined;
    let lines: string[] = [];
    const close = () => {
      if (heading !== undefined || lines.some((line) => line.trim() !== "")) {
        sections.push({ heading, body: lines.join("\n").trim() });
      }
    };
    for (const line of text.split("\n")) {
      const found = HEADING.exec(line.trim());
      if (found) {
        close();
        [, heading] = found;
        lines = [];
        continue;
      }
      lines.push(line);
    }
    close();
    return sections;
  }

  const sections = $derived(sectionsOf(source));
</script>

<div class="release-notes">
  {#each sections as section, i (i)}
    {#if section.heading}
      {@const known = TONES[section.heading]}
      <h3 class="label" data-tone={known?.tone}>
        {#if known}
          <known.icon aria-hidden="true" class="glyph" />
        {/if}
        {section.heading}
      </h3>
    {/if}
    {#if section.body}
      <Markdown source={section.body} />
    {/if}
  {/each}
</div>

<style>
  .release-notes {
    display: grid;
  }
  /* A section's name: the badge recipe (DESIGN.md, Badges and state chips),
     20px at the 5px radius, label role, a 12px glyph, in its hue's ink on
     that hue's faint fill. */
  .label {
    justify-self: start;
    display: inline-flex;
    align-items: center;
    gap: 4px;
    block-size: 20px;
    margin: var(--space-3) 0 var(--space-2);
    padding-inline: 6px;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .label:first-child {
    margin-top: 0;
  }
  .label :global(.glyph) {
    inline-size: 12px;
    block-size: 12px;
    flex: none;
  }
  .label[data-tone="new"] {
    background: var(--note-new-bg);
    color: var(--note-new-ink);
  }
  .label[data-tone="improved"] {
    background: var(--note-improved-bg);
    color: var(--note-improved-ink);
  }
  .label[data-tone="fixed"] {
    background: var(--note-fixed-bg);
    color: var(--note-fixed-ink);
  }
  /* Prose's own scale is for a document; notes sit inside a toast or a card
     and take that surface's type, so the prose here inherits it and keeps
     only its structure. Every rule sits one class above prose's `:where()`. */
  .release-notes :global(.prose) {
    font: inherit;
    color: inherit;
  }
  .release-notes :global(p) {
    margin: 0;
  }
  .release-notes :global(ul) {
    display: grid;
    gap: var(--space-row);
    margin: 0;
    padding-inline-start: var(--space-4);
    list-style: disc;
  }
  .release-notes :global(li) {
    margin: 0;
    padding: 0;
    overflow-wrap: anywhere;
  }
  .release-notes :global(li::marker) {
    color: var(--ink-muted);
  }
</style>
