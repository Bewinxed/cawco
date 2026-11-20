<script lang="ts">
  /**
   * Group 2a of the Project Passport: every place of the project listed at
   * once (starting checkout, other checkouts, hub folder) with Add place,
   * followed by linked repositories when the project has any.
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
        onclick={() => acts.addPlace()}
        size="xs"
        variant="ghost"
      >
        <IconPlus aria-hidden="true" class="size-icon-sm" />
        <span>{words.places.addPlace}</span>
      </Button>
    {/snippet}
  </SectionHeader>

  <ul class="m-0 flex list-none flex-col gap-space-row p-0">
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
    <div
      class="mt-space-1 grid grid-cols-auto-fluid items-baseline gap-x-space-3 px-space-2"
    >
      <span class="type-meta text-ink-muted">{words.places.repositories}</span>
      <div
        class="flex min-w-0 flex-wrap items-baseline gap-x-space-3 gap-y-space-row"
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
      </div>
    </div>
  {/if}
</section>
