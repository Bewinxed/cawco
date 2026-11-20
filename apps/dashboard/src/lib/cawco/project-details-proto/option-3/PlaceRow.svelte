<script lang="ts">
  /**
   * One place row in the Passport: checkout on a machine or the project's hub
   * folder, sharing one columnar subgrid on desk (lead glyph, name + marks,
   * end-anchored mono path with full path in tooltip, and a trailing acts
   * group starting at one edge on every row) and a two-line layout with a
   * 44×44 touch actions row on a phone.
   */
  import OsMark from "#lib/cawco/OsMark.svelte";
  import type { ProjectPlace } from "#lib/cawco/projects.js";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconFolder, IconWarningTriangle } from "#lib/icons.js";
  import { osMarkOf, type PassportActs, type PassportMachine } from "./records";
  import { passportWords as words } from "./words";

  let {
    place,
    machine,
    acts,
    narrow,
    hubAway,
  }: {
    place: ProjectPlace;
    machine: PassportMachine | undefined;
    acts: PassportActs;
    narrow: boolean;
    hubAway: boolean;
  } = $props();

  const isHub = $derived(place.kind === "hub");
  const isOffline = $derived(
    !isHub && machine !== undefined && !machine.online
  );
  const label = $derived(
    isHub ? words.places.hub : (machine?.name ?? place.machineId)
  );
  const labelTone = $derived.by(() => {
    if (isHub) {
      return "type-label text-ink-muted";
    }
    if (isOffline) {
      return "type-label text-machine-offline";
    }
    return "type-label text-ink-strong";
  });
  const pathSegments = $derived(place.path.split("/"));
</script>

{#snippet leadGlyph()}
  <span class="mark-cell" data-box>
    {#if isHub}
      <IconFolder aria-hidden="true" class="size-icon-md text-ink-muted" />
    {:else}
      <OsMark
        class={isOffline ? "text-machine-offline" : "text-ink-muted"}
        os={machine ? osMarkOf(machine.os) : "unknown"}
      />
    {/if}
  </span>
{/snippet}

{#snippet nameAndMarks()}
  <div
    class={narrow
      ? "mark-line flex min-w-0 flex-wrap items-center gap-x-space-2 gap-y-space-row"
      : "mark-line flex items-center gap-space-2 whitespace-nowrap"}
    data-box
  >
    <span class={labelTone}>{label}</span>
    {#if place.isPrimary}
      <Badge data-box kind="meta">
        <span>{words.places.startsHere}</span>
      </Badge>
    {/if}
    {#if isOffline}
      <span class="type-meta text-machine-offline">{words.places.offline}</span>
    {/if}
    {#if place.missing}
      <span
        class="mark-line inline-flex items-center gap-space-1 type-meta font-medium text-status-fail-ink"
        data-box
        role="alert"
      >
        <IconWarningTriangle
          aria-hidden="true"
          class="size-icon-sm text-status-fail-glyph"
        />
        <span>{words.places.missing}</span>
      </span>
    {/if}
  </div>
{/snippet}

{#snippet pathText()}
  {#if narrow}
    <span class="block min-w-0 break-word type-code text-ink-muted">
      {#each pathSegments as segment, index (index)}
        {#if index > 0}/<wbr />{/if}{segment}
      {/each}
    </span>
  {:else}
    <Tip label={place.path} side="top">
      {#snippet children(tipProps)}
        <span
          {...tipProps}
          class="dir-rtl block min-w-0 overflow-clip text-ellipsis whitespace-nowrap text-left type-code text-ink-muted"
        >
          <bdi dir="ltr">{place.path}</bdi>
        </span>
      {/snippet}
    </Tip>
  {/if}
{/snippet}

{#snippet placeAct(
  name: string,
  onclick: () => void,
  variant: "ghost" | "outline",
  tone?: "quiet" | "destructive"
)}
  <Button
    aria-label={words.places.actionFor(name, label)}
    disabled={hubAway}
    {onclick}
    pad="more"
    size={narrow ? "lg" : "xs"}
    {tone}
    {variant}
  >
    {name}
  </Button>
{/snippet}

{#snippet placeActions()}
  {@render placeAct(
    words.places.move,
    () => acts.move(place.id),
    "ghost",
    "quiet"
  )}
  {@render placeAct(
    words.places.findFolder,
    () => acts.findFolder(place.id),
    place.missing ? "outline" : "ghost",
    place.missing ? undefined : "quiet"
  )}
  {@render placeAct(
    words.places.copyToMachine,
    () => acts.copy(place.id),
    "ghost",
    "quiet"
  )}
  {#if !place.isPrimary}
    <span class={narrow ? "ms-auto" : "inline-flex items-center"}>
      {#if !narrow}
        <span
          aria-hidden="true"
          class="mx-space-1 h-icon-sm w-px flex-none bg-border-hairline"
        ></span>
      {/if}
      {@render placeAct(
        words.places.drop,
        () => acts.drop(place.id),
        "ghost",
        "destructive"
      )}
    </span>
  {/if}
{/snippet}

{#if narrow}
  <li class="grid grid-cols-mark-fluid items-start gap-x-space-2 py-space-1">
    {@render leadGlyph()}
    <div class="flex min-w-0 flex-col gap-space-row">
      {@render nameAndMarks()}
      {@render pathText()}
      {#if !isHub}
        <div
          class="-ms-space-2 flex flex-wrap items-center gap-x-space-1"
          style:--more-px="var(--spacing-space-2)"
        >
          {@render placeActions()}
        </div>
      {/if}
    </div>
  </li>
{:else}
  <li
    class={isHub
      ? "col-span-full grid min-h-c-btn-h-xs grid-cols-subgrid items-center rounded-sm px-space-2 py-space-row"
      : "group/row col-span-full grid min-h-c-btn-h-xs grid-cols-subgrid items-center rounded-sm px-space-2 py-space-row transition-colors duration-(--duration-control) ease-out hover:bg-surface-hover/50"}
    data-slot={isHub ? undefined : "row"}
  >
    {@render leadGlyph()}
    {@render nameAndMarks()}
    <div class="col-start-2 col-end-5 row-start-2 min-w-0">
      {@render pathText()}
    </div>
    {#if !isHub}
      <div
        class="col-start-4 row-start-1 flex items-center gap-space-row ps-space-1"
        style:--more-px="var(--spacing-space-1)"
      >
        {@render placeActions()}
      </div>
    {/if}
  </li>
{/if}
