<script lang="ts">
  /**
   * Places anchor beside the project title: states `N places` (or crimson
   * glyph + `Folder missing` when any place is missing; never repeats a path)
   * and opens the Places & Storage glide-popover holding PlacesList.
   */
  import NsPopover from "#lib/cawco/spawn/NsPopover.svelte";
  import { chipVariants } from "#lib/components/ui/chip/index.js";
  import MorphText from "#lib/components/ui/morph-text/morph-text.svelte";
  import {
    IconChevronDown,
    IconFolderLinear,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { hubReading } from "./format";
  import PlacesList from "./PlacesList.svelte";
  import type { PlacesProps } from "./records";
  import { words } from "./words";

  let { record, ...subject }: PlacesProps = $props();

  let open = $state(false);

  const hasMissing = $derived(
    record.project.places.some((place) => place.missing)
  );
  const { staleMeta } = $derived(hubReading(record));
  const triggerText = $derived(
    hasMissing
      ? words.places.triggerMissing
      : words.places.triggerCount(record.project.places.length)
  );
</script>

<NsPopover
  id="project-places"
  align="start"
  label={words.places.triggerAria(record.project.name, triggerText, staleMeta)}
  onchange={(next) => {
    open = next;
  }}
  {open}
  triggerClass={chipVariants({
    variant: "setting",
    tone: hasMissing ? "fail" : "muted",
  })}
  width="var(--container-details)"
  tall
>
  {#snippet trigger()}
    {#if hasMissing}
      <IconWarningTriangle aria-hidden="true" class="text-status-fail-glyph" />
    {:else}
      <IconFolderLinear aria-hidden="true" />
    {/if}
    <span data-slot="chip-label">
      <MorphText text={triggerText} />
    </span>
    <IconChevronDown aria-hidden="true" data-slot="chevron" />
  {/snippet}

  <PlacesList {record} {...subject} />
</NsPopover>
