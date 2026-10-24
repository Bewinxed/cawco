<script lang="ts">
  /**
   * An artifact named in written words (`[name](cawco:artifact/<id>)`, core
   * references.ts), drawn as its chip: the inline chip (ui/chip `inline`)
   * with its kind's glyph as its mark and its name as the dashboard holds it
   * now. Pressed, it comes to the front of the panel of the session whose
   * conversation it stands in, else of its own session's
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
  import RowFault from "./RowFault.svelte";
  import { openReference } from "./reference-open.svelte";
  import { refusals } from "./refusals.svelte";
  import { sessionHere } from "./session-here";

  let { id, label = "" }: { id: string; label?: string } = $props();
  const here = sessionHere();

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
  /** Where the last press's refusal is said: beside the chip, kept through a reload. */
  const refKey = $derived(`ref:${id}:top`);
  async function press(): Promise<void> {
    const key = refKey;
    const refused = await openReference(id, { top: true }, here?.());
    if (refused) {
      refusals.set(key, { reason: refused });
    } else {
      refusals.delete(key);
    }
  }
</script>

<button
  class={chipVariants({ variant: "inline" })}
  data-artifact-chip={id}
  onclick={press}
  title={words}
  type="button"
>
  <span
    data-slot="mark"
    aria-hidden="true"
    class="grid size-c-row-mark flex-none place-items-center text-ink-muted"
    data-box
  >
    <Glyph class="block size-icon-sm" />
  </span>
  <span data-slot="label">{words}</span>
</button>
<!-- A press the hub refused, said beside the chip in the sentence it
     stands in, with Try again. -->
<RowFault
  again={press}
  class="inline-block max-w-full align-baseline"
  data-reference-refused
  reason={refusals.reason(refKey)}
/>
