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
  import { Badge, type BadgeVariant } from "#lib/components/ui/badge/index.js";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import { IconBug, IconGraphUp, IconStars } from "#lib/icons.js";

  let { source }: { source: string } = $props();

  /** The three sections a release writes, by heading. */
  const TONES: Record<string, { variant: BadgeVariant; icon: Component }> = {
    New: { variant: "note-new", icon: IconStars },
    Improved: { variant: "note-improved", icon: IconGraphUp },
    Fixed: { variant: "note-fixed", icon: IconBug },
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
      <!-- A section's name: the kit Badge as its heading, in its note's hue
           (DESIGN.md, Update notice), a 12px glyph before its words. -->
      <Badge
        as="h3"
        data-slot="release-notes-label"
        class={[i > 0 && "mt-space-3", "mb-space-2 justify-self-box-start"]}
        variant={known?.variant ?? "default"}
      >
        {#if known}
          {@const Glyph = known.icon}
          <Glyph
            data-release-notes-glyph
            aria-hidden="true"
            class="flex-none"
          />
        {/if}
        <span>{section.heading}</span>
      </Badge>
    {/if}
    {#if section.body}
      <Markdown look="surface" source={section.body} />
    {/if}
  {/each}
</div>
