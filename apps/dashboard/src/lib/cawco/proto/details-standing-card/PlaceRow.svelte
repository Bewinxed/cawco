<script lang="ts">
  /**
   * One of the project's places, in the Standing card's Places: its machine
   * (the OS mark in the row's lead column, the name, and away or gone when
   * so), the whole folder, cut from its start when room runs out, and at
   * most two marks at the row's end: a folder gone missing, and where work
   * starts. Its acts stand on the row under the folder: Move and Find
   * folder on every checkout (Find folder leading on a missing one), Drop on
   * any that is not where work starts. The hub's folder has none.
   *
   * A place being moved shows its step in place of its acts, and a press on
   * it opens the move again. Drop asks beside the row. A place just added
   * says what the hub learned of it.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import OsMark from "#lib/cawco/OsMark.svelte";
  import type { ProjectPlace } from "#lib/cawco/projects.js";
  import type { Machine } from "#lib/cawco/stores/board.svelte.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    IconChevronRight,
    IconFolderLinear,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { reveal } from "#lib/platform/motion/curves.svelte.js";
  import type { PlaceFolder, PlaceLearned, PlaceMoving } from "./details";
  import { standingWords } from "./words";

  const words = standingWords.places;

  let {
    place,
    machine,
    folder,
    moving = null,
    dropping = false,
    learned = null,
    sunk = false,
    onmove,
    onfind,
    ondrop,
    onkeep,
    ondropped,
    onreopen,
  }: {
    place: ProjectPlace;
    /** The place's machine as the board lists it; null once it left the fleet. */
    machine: Machine | null;
    folder: PlaceFolder;
    /** Its folder is being moved. */
    moving?: PlaceMoving | null;
    /** Drop stands asked beside it. */
    dropping?: boolean;
    /** It was just added: what the hub learned of it. */
    learned?: PlaceLearned | null;
    /** The hub is out of reach: its acts are sunk. */
    sunk?: boolean;
    onmove: (placeId: string) => void;
    onfind: (placeId: string) => void;
    ondrop: (placeId: string) => void;
    onkeep: () => void;
    ondropped: (placeId: string) => void;
    onreopen: (placeId: string) => void;
  } = $props();

  const onHub = $derived(place.kind === "hub");
  const name = $derived.by(() => {
    if (onHub) {
      return words.hub;
    }
    return machine ? machineLabel(machine.hostname) : place.machineId;
  });
  /** The machine's standing beside its name, when it is not answering. */
  const standing = $derived.by(() => {
    if (onHub) {
      return null;
    }
    if (!machine) {
      return words.left;
    }
    return machine.status === "online" ? null : words.away;
  });
</script>

<!-- mark-line: the machine's mark stands in the row's lead column, on its first line; the folder and the acts start under the name -->
<li class="flex min-w-0 gap-space-3" data-place={place.id}>
  <span class="flex h-lh flex-none items-center type-label text-ink-muted">
    {#if onHub || !machine}
      <IconFolderLinear aria-hidden="true" class="size-icon-md" />
    {:else}
      <OsMark
        aria-hidden="true"
        class="size-icon-md"
        face="linear"
        os={machine.os}
      />
    {/if}
  </span>
  <div class="flex min-w-0 flex-auto flex-col gap-space-1">
    <div class="flex min-w-0 items-baseline gap-space-2">
      <span class="min-w-0 truncate type-label text-ink-strong">{name}</span>
      {#if standing}
        <span class="flex-none type-meta text-ink-muted">{standing}</span>
      {/if}
      <span class="ms-auto flex flex-none items-baseline gap-space-3 type-meta">
        {#if folder.missing}
          <span
            class="mark-line flex items-center gap-space-1 text-status-fail-ink"
          >
            <IconWarningTriangle
              aria-hidden="true"
              class="size-icon-sm"
              data-box
            />
            <span>{words.missing}</span>
          </span>
        {/if}
        {#if place.isPrimary}
          <span class="text-ink-muted">{words.startsHere}</span>
        {/if}
      </span>
    </div>
    <!-- The folder reads from its end: its tail stays when it is cut, and
         the whole of it is its tooltip. -->
    <span
      class="dir-rtl truncate text-end type-meta text-ink-muted"
      title={place.path}><bdi>{place.path}</bdi></span
    >
    {#if folder.made}
      <span class="type-meta text-ink-subtle">{words.made}</span>
    {/if}
    {#if learned}
      <span class="type-meta text-ink-muted" in:reveal
        >{learned.repository
          ? words.learned(learned.repository)
          : words.learnsLater}</span
      >
    {/if}
    {#if moving}
      <!-- The move's step, live, in place of the acts: a press opens the move again. -->
      <Button
        class="self-start"
        onclick={() => onreopen(place.id)}
        size="xs"
        variant="secondary"
      >
        <LiveDot size="row" />
        <span>{moving.step}</span>
        <span class="text-ink-muted tabular-nums">{moving.progress}</span>
        <IconChevronRight aria-hidden="true" />
      </Button>
    {:else if dropping}
      <div
        class="flex min-w-0 flex-wrap items-center gap-space-2 pt-space-1"
        in:reveal
      >
        <span class="min-w-0 flex-auto type-meta text-ink-strong text-pretty"
          >{words.drops}</span
        >
        <Button onclick={onkeep} size="xs" variant="outline"
          >{words.keep}</Button
        >
        <Button
          onclick={() => ondropped(place.id)}
          size="xs"
          variant="destructive">{words.drop}</Button
        >
      </div>
    {:else if !onHub}
      <div class="flex flex-wrap gap-space-2 pt-space-1">
        {#if folder.missing}
          <Button
            disabled={sunk}
            onclick={() => onfind(place.id)}
            size="xs"
            variant="outline">{words.find}</Button
          >
        {/if}
        <Button
          disabled={sunk}
          onclick={() => onmove(place.id)}
          size="xs"
          variant="outline">{words.move}</Button
        >
        {#if !folder.missing}
          <Button
            disabled={sunk}
            onclick={() => onfind(place.id)}
            size="xs"
            variant="outline">{words.find}</Button
          >
        {/if}
        {#if !place.isPrimary}
          <Button
            disabled={sunk}
            onclick={() => ondrop(place.id)}
            size="xs"
            tone="quiet"
            variant="ghost">{words.drop}</Button
          >
        {/if}
      </div>
    {/if}
  </div>
</li>
