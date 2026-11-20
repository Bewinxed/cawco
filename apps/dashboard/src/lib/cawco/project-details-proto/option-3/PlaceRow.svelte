<script lang="ts">
  /**
   * One place row in the Passport: checkout on a machine (OS glyph, name,
   * Starts here / Offline / Missing, end-truncated mono path with full path in
   * tooltip, and calm keyboard/touch-reachable actions) or the project's hub
   * folder (no actions).
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
  const pathSegments = $derived(place.path.split("/"));
</script>

{#snippet secondaryActions()}
  <Button
    aria-label={words.places.actionFor(words.places.move, label)}
    disabled={hubAway}
    onclick={() => acts.move(place.id)}
    size="xs"
    tone="quiet"
    variant="ghost"
  >
    {words.places.move}
  </Button>
  {#if !place.missing}
    <Button
      aria-label={words.places.actionFor(words.places.findFolder, label)}
      disabled={hubAway}
      onclick={() => acts.findFolder(place.id)}
      size="xs"
      tone="quiet"
      variant="ghost"
    >
      {words.places.findFolder}
    </Button>
  {/if}
  <Button
    aria-label={words.places.actionFor(words.places.copyToMachine, label)}
    disabled={hubAway}
    onclick={() => acts.copy(place.id)}
    size="xs"
    tone="quiet"
    variant="ghost"
  >
    {words.places.copyToMachine}
  </Button>
  {#if !place.isPrimary}
    <Button
      aria-label={words.places.actionFor(words.places.drop, label)}
      disabled={hubAway}
      onclick={() => acts.drop(place.id)}
      size="xs"
      tone="quiet"
      variant="ghost"
    >
      {words.places.drop}
    </Button>
  {/if}
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

{#if isHub}
  <li
    class="grid grid-cols-mark-fluid items-center gap-x-space-2 rounded-sm px-space-2 py-space-1"
  >
    <span class="mark-cell" data-box>
      <IconFolder aria-hidden="true" class="size-icon-md text-ink-muted" />
    </span>
    <div
      class={narrow
        ? "flex min-w-0 flex-col gap-space-row"
        : "flex min-w-0 items-baseline gap-space-2"}
    >
      <span class="flex-none type-label text-ink-muted">
        {words.places.hub}
      </span>
      <div class="min-w-0 flex-1">
        {@render pathText()}
      </div>
    </div>
  </li>
{:else}
  <li
    class="group/row rounded-sm px-space-2 py-space-1 transition-colors duration-(--duration-control) ease-out hover:bg-surface-hover/50"
    data-slot="row"
  >
    <div class="grid grid-cols-mark-fluid items-start gap-x-space-2">
      <span class="mark-cell" data-box>
        <OsMark
          class={isOffline ? "text-machine-offline" : "text-ink-muted"}
          os={machine ? osMarkOf(machine.os) : "unknown"}
        />
      </span>

      <div class="flex min-w-0 flex-col gap-space-row">
        <div
          class="flex min-h-c-btn-h-xs items-center justify-between gap-space-2"
        >
          <div class="mark-line flex min-w-0 items-center gap-space-2">
            <span
              class={isOffline
                ? "min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-machine-offline"
                : "min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label text-ink-strong"}
            >
              {label}
            </span>
            {#if place.isPrimary}
              <Badge data-box kind="meta">
                <span>{words.places.startsHere}</span>
              </Badge>
            {/if}
            {#if isOffline}
              <span class="flex-none type-meta text-machine-offline">
                {words.places.offline}
              </span>
            {/if}
            {#if place.missing}
              <span
                class="mark-line inline-flex flex-none items-center gap-space-1 type-meta font-medium text-status-fail-ink"
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

          {#if !narrow}
            <div class="flex flex-none items-center gap-space-row">
              {#if place.missing}
                <Button
                  aria-label={words.places.actionFor(
                    words.places.findFolder,
                    label
                  )}
                  disabled={hubAway}
                  onclick={() => acts.findFolder(place.id)}
                  size="xs"
                  variant="outline"
                >
                  {words.places.findFolder}
                </Button>
              {/if}
              <div
                class="flex flex-none items-center gap-space-row can-hover:opacity-0 can-hover:transition-opacity can-hover:duration-(--duration-control) can-hover:ease-out can-hover:group-focus-within/row:opacity-100 can-hover:group-hover/row:opacity-100"
              >
                {@render secondaryActions()}
              </div>
            </div>
          {/if}
        </div>

        {@render pathText()}

        {#if narrow}
          <div
            class="mt-space-1 flex flex-wrap items-center gap-space-2 hit-gap-x-space-2 hit-gap-y-space-2"
          >
            {#if place.missing}
              <Button
                aria-label={words.places.actionFor(
                  words.places.findFolder,
                  label
                )}
                disabled={hubAway}
                onclick={() => acts.findFolder(place.id)}
                size="xs"
                variant="outline"
              >
                {words.places.findFolder}
              </Button>
            {/if}
            {@render secondaryActions()}
          </div>
        {/if}
      </div>
    </div>
  </li>
{/if}
