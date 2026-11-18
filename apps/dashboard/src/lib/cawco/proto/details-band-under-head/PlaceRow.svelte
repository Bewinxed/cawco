<script lang="ts">
  /**
   * One place of the project: its machine's mark in the lead column, the
   * machine's name and at most two marks (work starts here, missing) on
   * the first line, then the whole folder path from the name's own edge,
   * breaking after a slash where the column runs out, so it reads whole
   * (TOM: a full path "only where there is room to read it whole"). A machine
   * away or gone says so after its name; a folder CawCo made says so
   * quietly after the path.
   *
   * Acts stand on the row, under its path (Move, Find folder, Drop), each
   * with the place in its accessible name. Drop is absent on the place work starts in and on
   * the hub's folder; the hub's folder has no acts. While a Move of this
   * place runs, its step and how far stand where the acts stand, live, and a
   * press opens the Move again.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import type { ProjectPlace } from "#lib/cawco/projects.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { IconServer } from "#lib/icons.js";
  import type { MoveUnderWay, PlaceStanding } from "./band-model";
  import { bandWords } from "./words";

  let {
    place,
    machine,
    standing,
    moving,
    onmove,
    onfind,
    ondrop,
    onreopen,
  }: {
    place: ProjectPlace;
    /** Its machine as the fleet lists it; null when it left the fleet. Unread for the hub's folder. */
    machine: Machine | null;
    /** What the hub knows of it beyond its record; absent for the hub's folder. */
    standing?: PlaceStanding;
    /** The Move of this place under way, if one runs. */
    moving: MoveUnderWay | null;
    onmove: (place: ProjectPlace) => void;
    onfind: (place: ProjectPlace) => void;
    ondrop: (place: ProjectPlace) => void;
    onreopen: (move: MoveUnderWay) => void;
  } = $props();

  const words = bandWords.places;
  const hub = $derived(place.kind === "hub");
  const name = $derived.by(() => {
    if (hub) {
      return words.hub;
    }
    return machine ? machineLabel(machine.hostname) : place.machineId;
  });
  const away = $derived(
    !hub && machine !== null && machine.status !== "online"
  );
  const gone = $derived(!hub && machine === null);
  const missing = $derived(standing?.folder === "missing");
  /** The path's parts, each slash a place it may break. */
  const segments = $derived(place.path.split("/"));
</script>

<li
  class="grid min-w-0 grid-cols-(--place-cols) items-center gap-x-space-3 gap-y-space-1"
  data-place={place.id}
  data-slot="place-row"
  style:--place-cols="auto minmax(0, 1fr)"
>
  <!-- The lead column: the machine's own mark, or the hub's server. -->
  <span class="flex size-icon-md items-center justify-center text-ink-muted">
    {#if hub}
      <IconServer aria-hidden="true" class="size-icon-md" />
    {:else}
      <OsMark aria-hidden="true" os={machine?.os ?? "linux"} />
    {/if}
  </span>
  <span class="flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-1">
    <span class="type-label truncate text-ink-strong">{name}</span>
    {#if place.isPrimary}
      <Badge><span>{words.workStarts}</span></Badge>
    {/if}
    {#if missing}
      <Badge variant="fail"><span>{words.missing}</span></Badge>
    {/if}
    {#if away}
      <span class="type-meta text-ink-muted">{words.away}</span>
    {:else if gone}
      <span class="type-meta text-ink-muted">{words.left}</span>
    {/if}
  </span>
  <!-- The whole path from the name's edge, breaking after a slash where
       the column runs out, so it reads whole. -->
  <span
    class="col-start-2 flex min-w-0 flex-wrap items-baseline gap-x-space-2"
    data-slot="path"
  >
    <span
      class="min-w-0 type-code text-ink-muted"
      title={hub ? words.hubFolder : undefined}
      >{#each segments as segment, at (at)}{segment}{#if at < segments.length - 1}/<wbr
          />{/if}{/each}</span
    >
    {#if standing?.madeByCawco}
      <span class="flex-none type-meta text-ink-subtle"
        >{words.madeByCawco}</span
      >
    {/if}
  </span>
  {#if moving || !hub}
    <span
      class="col-start-2 flex flex-wrap items-center gap-space-1 pt-space-1"
      data-slot="acts"
    >
      {#if moving}
        <!-- The Move under way stands where the acts stand, and a press opens it again. -->
        <Button
          aria-label={words.reopenMove(name)}
          onclick={() => onreopen(moving)}
          size="xs"
          variant="secondary"
        >
          <LiveDot />
          <span class="tabular-nums">
            {words.moving(words.steps[moving.step], moving.share)}
          </span>
        </Button>
      {:else}
        <Button
          aria-label={words.actOn(words.move, name)}
          label={words.move}
          onclick={() => onmove(place)}
          size="xs"
          variant="secondary"
        />
        <Button
          aria-label={words.actOn(words.findFolder, name)}
          label={words.findFolder}
          onclick={() => onfind(place)}
          size="xs"
          variant={missing ? "outline" : "secondary"}
        />
        {#if !place.isPrimary}
          <Button
            aria-label={words.actOn(words.drop, name)}
            label={words.drop}
            onclick={() => ondrop(place)}
            size="xs"
            variant="secondary"
          />
        {/if}
      {/if}
    </span>
  {/if}
</li>
