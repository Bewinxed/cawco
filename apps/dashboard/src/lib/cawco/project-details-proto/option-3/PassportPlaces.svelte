<script lang="ts">
  /**
   * Group 2a of the Project Passport: every place of the project listed in one
   * columnar list (starting checkout, other checkouts, hub folder) with Add
   * place, followed by linked repositories on the card's shared fact-line
   * columns when the project has any.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { SectionHeader } from "#lib/components/ui/section-header/index.js";
  import { IconFolder, IconPlus } from "#lib/icons.js";
  import PlaceRow from "./PlaceRow.svelte";
  import type {
    PassportActs,
    PassportMachine,
    PassportReading,
  } from "./records";
  import { passportWords as words } from "./words";

  let {
    reading,
    acts,
    narrow,
    hubAway,
  }: {
    reading: PassportReading;
    acts: PassportActs;
    narrow: boolean;
    hubAway: boolean;
  } = $props();

  /**
   * Lead glyph (padded by space-2 for row hover bleed), machine name + marks,
   * end-anchored path, trailing acts group.
   */
  const PLACES_COLS =
    "calc(var(--spacing-space-2) + var(--spacing-icon-md)) auto minmax(0, 1fr) auto";

  const machineById = $derived(
    new Map<string, PassportMachine>(
      reading.machines.map((machine) => [machine.id, machine])
    )
  );
</script>

<section aria-label={words.places.heading} class="flex flex-col gap-space-1">
  <SectionHeader
    hue="var(--color-ink-muted)"
    icon={IconFolder}
    label={words.places.heading}
    level={2}
  >
    {#snippet right()}
      <Button
        disabled={hubAway}
        hit={narrow ? "always" : undefined}
        onclick={() => acts.addPlace()}
        size="xs"
        variant="ghost"
      >
        <IconPlus aria-hidden="true" class="size-icon-sm" />
        <span>{words.places.addPlace}</span>
      </Button>
    {/snippet}
  </SectionHeader>

  <ul
    class={narrow
      ? "m-0 flex list-none flex-col gap-space-2 p-0"
      : "m-0 -mx-space-2 grid list-none grid-cols-(--places-cols) gap-x-space-2 gap-y-space-row p-0"}
    style:--places-cols={narrow ? undefined : PLACES_COLS}
  >
    {#each reading.project.places as place (place.id)}
      <PlaceRow
        {acts}
        {hubAway}
        machine={machineById.get(place.machineId)}
        {narrow}
        {place}
      />
    {/each}
  </ul>

  {#if reading.holdsCode && reading.project.links.length > 0}
    <dl
      class="m-0 mt-space-1 grid grid-cols-(--passport-fact-cols) items-baseline gap-x-space-3 gap-y-space-1"
    >
      <dt class="type-meta text-ink-muted">{words.places.repositories}</dt>
      <dd
        class="m-0 flex min-w-0 flex-wrap items-baseline gap-x-space-3 gap-y-space-row"
      >
        {#each reading.project.links as link (link)}
          <a
            class="min-w-0 break-word type-code text-ink-strong underline decoration-border-control underline-offset-(--underline-offset) transition-colors duration-(--duration-control) ease-out hover:decoration-ink-strong"
            href={`https://${link}`}
            rel="noopener noreferrer"
            target="_blank"
          >
            {link}
          </a>
        {/each}
      </dd>
    </dl>
  {/if}
</section>
