<script lang="ts">
  /**
   * One place row inside Stage 2 ("Sessions start"): fixed-width machine
   * column (glyph + name), fixed state-glyph column (accessible word + Tip,
   * empty when healthy so every path starts on one x), full path breaking at
   * "/" separators with inline standing marks, and trailing action buttons
   * (compact icon buttons with Tip on fine-pointer desk, full labelled buttons
   * on touch or wrapped narrow widths; Find folder promoted first when missing).
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { machineIcon } from "#lib/components/ui/machine-row/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconAlert,
    IconClose,
    IconCopy,
    IconFolderOpen,
    IconServer,
    IconTransfer,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import type { PlaceAct } from "./changes";
  import type { FleetMachine, ProjectPlace } from "./records";
  import { howItRunsWords as words } from "./words";

  let {
    place,
    machine,
    moving = false,
    disabled = false,
    onplace,
  }: {
    place: ProjectPlace;
    /** Null for the project's hub folder. */
    machine: FleetMachine | null;
    /** True while a Move is actively running on this place. */
    moving?: boolean;
    disabled?: boolean;
    onplace: (act: PlaceAct, placeId: string) => void;
  } = $props();

  const isHub = $derived(place.kind === "hub");
  const isOffline = $derived(machine !== null && !machine.online);
  const MachineGlyph = $derived(
    machine ? machineIcon(machine.os) : IconServer
  );
  const machineName = $derived(machine ? machine.name : words.places.hub);
  const actsDisabled = $derived(disabled || moving);
  const pathParts = $derived(place.path.split("/"));
</script>

<li
  class={[
    "flex flex-col gap-space-1 rounded-sm border bg-surface-raised px-space-2 py-space-1 @kinds:flex-row @kinds:items-center @kinds:gap-space-2",
    place.missing
      ? "border-border-hairline border-s-2 border-s-status-fail-glyph"
      : "border-border-hairline",
  ]}
  data-place={place.id}
  data-slot="row"
>
  <!-- Lead group: fixed machine column + fixed state column (keeps every path at one x). -->
  <div class="flex min-w-0 items-center gap-space-2 @kinds:flex-none">
    <span
      class={[
        "mark-line flex min-w-0 items-center gap-space-1 @kinds:w-20 @kinds:flex-none",
        isOffline || isHub ? "text-machine-offline" : "text-ink-strong",
      ]}
      data-slot="lead"
    >
      <MachineGlyph aria-hidden="true" class="size-icon-md flex-none" />
      <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label"
        >{machineName}</span
      >
    </span>

    <span
      class="inline-grid size-icon-md flex-none place-items-center"
      data-slot="status"
    >
      {#if place.missing}
        <Tip label={words.places.missingTip} tap>
          {#snippet children(props)}
            <span
              {...props}
              aria-label={words.places.missing}
              class="inline-grid size-icon-md place-items-center text-status-fail-glyph"
              role="img"
            >
              <IconAlert aria-hidden="true" class="size-icon-sm" />
            </span>
          {/snippet}
        </Tip>
      {:else if moving}
        <Tip label={words.places.movingTip} tap>
          {#snippet children(props)}
            <span
              {...props}
              aria-label={words.places.moving}
              class="inline-grid size-icon-md place-items-center"
              role="img"
            >
              <LiveDot size="dot" tone="live" />
            </span>
          {/snippet}
        </Tip>
      {:else if isOffline}
        <Tip label={words.places.awayTip} tap>
          {#snippet children(props)}
            <span
              {...props}
              aria-label={words.places.away}
              class="inline-grid size-icon-md place-items-center text-status-attn-glyph"
              role="img"
            >
              <IconWarningTriangle aria-hidden="true" class="size-icon-sm" />
            </span>
          {/snippet}
        </Tip>
      {/if}
    </span>
  </div>

  <!-- Path column: the only column that wraps, breaking cleanly at "/". -->
  <div
    class="flex min-w-0 flex-1 flex-wrap items-center gap-x-space-2 gap-y-space-1"
    data-slot="path"
  >
    <code
      class={[
        "min-w-0 type-code liga-none wrap-anywhere",
        isOffline ? "text-ink-muted" : "text-ink-strong",
      ]}
    >
      {#each pathParts as part, idx (idx)}{#if idx > 0}/<wbr />{/if}{part}{/each}
    </code>

    {#if place.kind === "start"}
      <Badge kind="meta">{words.places.startsHere}</Badge>
    {:else if isHub}
      <Badge kind="meta">{words.places.hubStore}</Badge>
    {/if}

    {#if place.missing}
      <Badge variant="fail">{words.places.missing}</Badge>
    {:else if moving}
      <Badge variant="live">{words.places.moving}</Badge>
    {:else if isOffline}
      <Badge variant="attn">{words.places.away}</Badge>
    {/if}
  </div>

  <!-- Trailing actions column: absent on the hub's folder. -->
  {#if !isHub}
    <div
      class="flex flex-none flex-wrap items-center gap-space-1 @kinds:justify-end"
      data-slot="actions"
    >
      {#if place.missing}
        <!-- Missing folder: Find folder stands first as a labelled neutral button. -->
        <Button
          aria-label={words.places.actFor(words.places.findFolder, place.path)}
          disabled={actsDisabled}
          icon={IconFolderOpen}
          label={words.places.findFolder}
          onclick={() => onplace("find", place.id)}
          size="xs"
          variant="outline"
        />
      {/if}

      <Tip label={words.places.move}>
        {#snippet children(props)}
          <Button
            {...props}
            aria-label={words.places.actFor(words.places.move, place.path)}
            class="can-hover:@kinds:px-space-1"
            disabled={actsDisabled}
            onclick={() => onplace("move", place.id)}
            size="xs"
            tone="quiet"
            variant="ghost"
          >
            <IconTransfer aria-hidden="true" class="size-icon-sm flex-none" />
            <span class="can-hover:@kinds:sr-only">{words.places.move}</span>
          </Button>
        {/snippet}
      </Tip>

      {#if !place.missing}
        <Tip label={words.places.findFolder}>
          {#snippet children(props)}
            <Button
              {...props}
              aria-label={words.places.actFor(
                words.places.findFolder,
                place.path
              )}
              class="can-hover:@kinds:px-space-1"
              disabled={actsDisabled}
              onclick={() => onplace("find", place.id)}
              size="xs"
              tone="quiet"
              variant="ghost"
            >
              <IconFolderOpen
                aria-hidden="true"
                class="size-icon-sm flex-none"
              />
              <span class="can-hover:@kinds:sr-only"
                >{words.places.findFolder}</span
              >
            </Button>
          {/snippet}
        </Tip>
      {/if}

      <Tip label={words.places.copyToMachine}>
        {#snippet children(props)}
          <Button
            {...props}
            aria-label={words.places.actFor(
              words.places.copyToMachine,
              place.path
            )}
            class="can-hover:@kinds:px-space-1"
            disabled={actsDisabled}
            onclick={() => onplace("copy", place.id)}
            size="xs"
            tone="quiet"
            variant="ghost"
          >
            <IconCopy aria-hidden="true" class="size-icon-sm flex-none" />
            <span class="can-hover:@kinds:sr-only"
              >{words.places.copyShort}</span
            >
          </Button>
        {/snippet}
      </Tip>

      {#if place.kind === "other"}
        <Tip label={words.places.drop}>
          {#snippet children(props)}
            <Button
              {...props}
              aria-label={words.places.actFor(words.places.drop, place.path)}
              class="can-hover:@kinds:px-space-1"
              disabled={actsDisabled}
              onclick={() => onplace("drop", place.id)}
              size="xs"
              tone="quiet"
              variant="ghost"
            >
              <IconClose aria-hidden="true" class="size-icon-sm flex-none" />
              <span class="can-hover:@kinds:sr-only">{words.places.drop}</span>
            </Button>
          {/snippet}
        </Tip>
      {/if}
    </div>
  {/if}
</li>
