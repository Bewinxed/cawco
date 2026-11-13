<!--
  A `cawco:` reference in the page's words (`[label](cawco:<kind>/<id>)`,
  core references.ts), drawn as the dashboard draws it: the inline chip with
  its face (ReferenceFace) as the dashboard framing the page said it
  (references.svelte.ts), else its written label alone, as a reference the
  dashboard knows nothing by reads everywhere. Pressed, it opens where its
  chip pressed in the dashboard opens (the overlay's `cawco.follow`), and a
  press the hub refused is said beside it with Try again, as a chip's is.
  `still`, inside a control pressed for itself (an option's chip): the chip
  is a span, its face alone, as a chip that is an atom of a field is.
-->
<script lang="ts">
  import ReferenceFace, {
    referenceChipClass,
  } from "../../ReferenceFace.svelte";
  import RowFault from "../../RowFault.svelte";
  import { markLook } from "../../reference-looks";
  import { bridge } from "./page.svelte.js";
  import { drawReference, referenceFaceOf } from "./references.svelte.js";

  let {
    href,
    label,
    still = false,
  }: { href: string; label: string; still?: boolean } = $props();

  $effect(() => drawReference(href));

  const face = $derived(referenceFaceOf(href));
  const look = $derived(face?.mark ? markLook(face.mark) : null);
  const words = $derived(face?.words || label);
  const name = $derived(
    face?.title ?? (face?.state ? `${words}, ${face.state}` : words)
  );
  let refused = $state<string | null>(null);

  async function press(): Promise<void> {
    refused = (await bridge()?.follow(href)) ?? null;
  }
</script>

{#snippet drawn()}
  <ReferenceFace
    glyph={look?.glyph}
    hue={look?.hue}
    state={face?.state}
    tone={look?.tone}
    {words}
  />
{/snippet}

{#if face && still}
  <span
    class={referenceChipClass(!!look)}
    data-reference-chip={href}
    title={name}>{@render drawn()}</span
  >
{:else if face}
  <button
    aria-label={name}
    class={referenceChipClass(!!look)}
    data-reference-chip={href}
    onclick={press}
    title={name}
    type="button"
  >
    {@render drawn()}
  </button><RowFault
    again={press}
    class="inline-block max-w-full align-baseline"
    data-reference-refused
    reason={refused}
  />
{:else}{label}{/if}
