<script lang="ts">
  import type { ProjectPlace, ProjectRow } from "#lib/cawco/projects.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  /**
   * Places: every place at once, never behind an expander (the owner:
   * having to open something to see the other places is "terrible
   * design"). The place work starts in leads, then the project's other
   * places on machines, then its folder on the hub. Under the list, Add
   * place, and the repositories it is linked to as chips that open each one;
   * no repositories line when it has none.
   */
  import ProviderLogo from "#lib/components/features/ProviderLogo.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconPlus } from "#lib/icons.js";
  import BandGroup from "./BandGroup.svelte";
  import type { MoveUnderWay, PlaceStanding } from "./band-model";
  import PlaceRow from "./PlaceRow.svelte";
  import { bandWords } from "./words";

  let {
    project,
    machines,
    standings,
    move,
    onmove,
    onfind,
    ondrop,
    onreopen,
    onadd,
  }: {
    project: ProjectRow;
    machines: Machine[];
    standings: Record<string, PlaceStanding>;
    move: MoveUnderWay | null;
    onmove: (place: ProjectPlace) => void;
    onfind: (place: ProjectPlace) => void;
    ondrop: (place: ProjectPlace) => void;
    onreopen: (move: MoveUnderWay) => void;
    onadd: () => void;
  } = $props();

  const words = bandWords.places;
  /** The place work starts in, then the other places on machines, then the hub's folder. */
  const ordered = $derived(
    [...project.places].sort(
      (a, b) =>
        Number(b.isPrimary) - Number(a.isPrimary) ||
        Number(a.kind === "hub") - Number(b.kind === "hub")
    )
  );
  /** Each link as a person reads it: `owner/repo`, its host and its address. */
  const repositories = $derived(
    project.links.map((link) => {
      const [host = "", ...rest] = link.split("/");
      return { host, name: rest.join("/"), url: `https://${link}` };
    })
  );
</script>

<BandGroup title={words.title}>
  <ul class="m-0 flex list-none flex-col gap-space-4 p-0">
    {#each ordered as place (place.id)}
      <PlaceRow
        machine={machines.find((one) => one.machineId === place.machineId) ??
          null}
        moving={move?.placeId === place.id ? move : null}
        {ondrop}
        {onfind}
        {onmove}
        {onreopen}
        {place}
        standing={standings[place.id]}
      />
    {/each}
  </ul>
  <div>
    <Button
      icon={IconPlus}
      label={words.add}
      onclick={onadd}
      size="xs"
      variant="secondary"
    />
  </div>
  {#if repositories.length > 0}
    <!-- The repositories, each a link out, their marks on the places'
         lead column (the ghost's own pad given back). -->
    <ul class="m-0 -ms-space-2 flex list-none flex-wrap gap-x-space-1 p-0">
      {#each repositories as repository (repository.url)}
        <li class="min-w-0">
          <Button
            aria-label={words.openRepository(repository.name)}
            class="max-w-full"
            href={repository.url}
            rel="noreferrer"
            size="xs"
            target="_blank"
            variant="ghost"
          >
            {#if repository.host === "github.com"}
              <ProviderLogo provider="github" size="meta" />
            {/if}
            <span class="overflow-clip text-ellipsis whitespace-nowrap"
              >{repository.name}</span
            >
          </Button>
        </li>
      {/each}
    </ul>
  {/if}
</BandGroup>
