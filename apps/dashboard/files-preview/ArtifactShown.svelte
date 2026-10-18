<script lang="ts">
  /**
   * The artifact on show, as PreviewPane draws its head: the name as the
   * artifact menu's trigger (ArtifactMenu's look: its kind's glyph, the name
   * in the label role, the chevron), Open in new tab and Reload; the page in
   * the well, here its capture at the well's width, from its top.
   */
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import IconChevronDown from "~icons/solar/alt-arrow-down-linear";
  import IconArrowUpRight from "~icons/solar/arrow-right-up-linear";
  import IconArtifactPage from "~icons/solar/document-text-bold-duotone";
  import IconRefresh from "~icons/solar/refresh-bold-duotone";

  let { name, page }: { name: string; page: string } = $props();
</script>

{#snippet trigger()}
  <button aria-haspopup="menu" class="artifact-trigger mark-line" type="button">
    <IconArtifactPage aria-hidden="true" />
    <span class="artifact-name">{name}</span>
    <IconChevronDown aria-hidden="true" />
  </button>
{/snippet}

{#snippet actions()}
  <button
    aria-label="Open in new tab"
    class="touch-hit"
    title="Open in new tab"
    type="button"
  >
    <IconArrowUpRight aria-hidden="true" />
  </button>
  <button aria-label="Reload" class="touch-hit" title="Reload" type="button">
    <IconRefresh aria-hidden="true" />
  </button>
{/snippet}

<SideSurface
  {actions}
  label={name}
  onclose={() => undefined}
  titleControl={trigger}
>
  <img alt={name} class="page" src={page} />
</SideSurface>

<style>
  .artifact-trigger {
    min-width: 0;
    max-width: 100%;
    color: var(--ink-strong);
    font: var(--type-label);
  }
  .artifact-name {
    min-width: 0;
    overflow: clip;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* The whole page across the well, from its top. */
  .page {
    display: block;
    inline-size: 100%;
    block-size: auto;
  }
</style>
