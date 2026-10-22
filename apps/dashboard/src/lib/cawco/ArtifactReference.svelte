<script lang="ts">
  /**
   * An artifact named in written words (`[name](cawco:artifact/<id>)`, core
   * references.ts), drawn as its chip: the inline chip (ui/chip `inline`)
   * with its kind's glyph as its mark and its name as the dashboard holds it
   * now. Pressed, it comes to the front of its session's panel
   * (reference-open.svelte.ts).
   */
  import type { ArtifactKind } from "@cawco/core";
  import type { Component } from "svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import {
    IconArtifactCanvas,
    IconArtifactPage,
    IconArtifactSheet,
    IconGlobe,
    IconWindow,
  } from "#lib/icons.js";
  import { artifactNamed } from "./artifact-names.svelte";
  import { openReference } from "./reference-open.svelte";

  let { id, label = "" }: { id: string; label?: string } = $props();

  /** Each kind's glyph, as Files and Go to draw it. */
  const GLYPH: Record<ArtifactKind, Component> = {
    page: IconArtifactPage,
    canvas: IconArtifactCanvas,
    preview: IconWindow,
    component: IconArtifactSheet,
    browser: IconGlobe,
  };

  const named = $derived(artifactNamed(id));
  const Glyph = $derived(GLYPH[named?.kind ?? "page"]);
  const words = $derived(named?.name ?? label);
</script>

<button
  class={chipVariants({ variant: "inline" })}
  data-artifact-chip={id}
  onclick={() => openReference(id, { top: true })}
  title={words}
  type="button"
>
  <span
    data-slot="mark"
    aria-hidden="true"
    class="grid size-c-row-mark flex-none place-items-center text-ink-muted"
    data-box
  >
    <Glyph />
  </span>
  <span data-slot="label">{words}</span>
</button>
