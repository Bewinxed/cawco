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

<div data-slot="release-notes" class="grid">
  {#each sections as section, i (i)}
    {#if section.heading}
      {@const known = TONES[section.heading]}
      <!-- A section's name: the badge recipe (DESIGN.md, Badges and state chips),
           20px at the 5px radius, label role, a 12px glyph, in its hue's ink on
           that hue's faint fill. -->
      <!-- literal: 6px -->
      <h3
        data-slot="release-notes-label"
        class="mt-space-3 mb-space-2 inline-flex h-icon-lg items-center justify-self-start gap-space-1 rounded-xs bg-surface-recess px-(--pad) type-label text-ink-strong first:mt-0 tone-fixed:bg-note-fixed-bg tone-fixed:text-note-fixed-ink tone-improved:bg-note-improved-bg tone-improved:text-note-improved-ink tone-new:bg-note-new-bg tone-new:text-note-new-ink"
        data-tone={known?.tone}
        style:--pad="6px"
      >
        {#if known}
          <known.icon
            data-release-notes-glyph
            aria-hidden="true"
            class="size-icon-sm flex-none"
          />
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
  /* Prose's own scale is for a document; notes sit inside a toast or a card
     and take that surface's type, so the prose here inherits it and keeps
     only its structure. Every rule sits one class above prose's `:where()`. */
  /* residual: foreign-dom — the Markdown's own elements */
  [data-slot="release-notes"] :global(.prose) {
    font: inherit;
    color: inherit;
  }
  [data-slot="release-notes"] :global(p) {
    margin: 0;
  }
  [data-slot="release-notes"] :global(ul) {
    display: grid;
    gap: var(--space-row);
    margin: 0;
    padding-inline-start: var(--space-4);
    list-style: disc;
  }
  [data-slot="release-notes"] :global(li) {
    margin: 0;
    padding: 0;
    overflow-wrap: anywhere;
  }

  /* residual: pseudo */
  [data-slot="release-notes"] :global(li::marker) {
    color: var(--ink-muted);
  }
</style>
