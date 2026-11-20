<script lang="ts">
  /**
   * One place row inside Stage 2 ("Sessions start"): fixed-width machine
   * column (glyph + name, in normal ink for both machines and the hub store),
   * fixed state-glyph column (accessible word + Tip, empty when healthy so
   * every path starts on one x), full path breaking at "/" separators with
   * inline standing marks, and trailing action buttons (24x24 icon buttons
   * with matching accessible names and Tips at @setup on a fine hovering
   * pointer, wrapping under the path as labelled compact buttons under @setup
   * or on a coarse pointer).
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

  function triggerAct(
    tipProps: Record<string, unknown>,
    event: MouseEvent,
    act: PlaceAct
  ) {
    if (typeof tipProps.onclick === "function") {
      (tipProps.onclick as (e: MouseEvent) => void)(event);
    }
    onplace(act, place.id);
  }
</script>

<li
  class={[
    "flex flex-col gap-space-1 rounded-sm border bg-surface-raised px-space-2 py-space-1 can-hover:@setup:flex-row can-hover:@setup:items-center can-hover:@setup:gap-space-2",
    place.missing
      ? "border-border-hairline border-s-2 border-s-status-fail-glyph"
      : "border-border-hairline",
  ]}
  data-place={place.id}
  data-slot="row"
>
  <div
    class="flex min-w-0 flex-1 flex-col gap-space-1 @kinds:flex-row @kinds:items-center @kinds:gap-space-2"
  >
    <!-- Lead group: fixed machine column + fixed state column (keeps every path at one x). -->
    <div class="flex min-w-0 items-center gap-space-1 @kinds:flex-none">
      <span
        class={[
          "mark-line flex min-w-0 items-center gap-space-1 @kinds:w-18 @kinds:flex-none",
          isOffline ? "text-machine-offline" : "text-ink-strong",
        ]}
        data-slot="lead"
      >
        <MachineGlyph aria-hidden="true" class="size-icon-md flex-none" />
        <span
          class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap type-label"
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
        <Badge kind="meta"><span>{words.places.startsHere}</span></Badge>
      {:else if isHub}
        <Badge kind="meta"><span>{words.places.hubStore}</span></Badge>
      {/if}

      {#if place.missing}
        <Badge variant="fail"><span>{words.places.missing}</span></Badge>
      {:else if moving}
        <Badge variant="live"><span>{words.places.moving}</span></Badge>
      {:else if isOffline}
        <Badge variant="attn"><span>{words.places.away}</span></Badge>
      {/if}
    </div>
  </div>

  <!-- Trailing actions: 24px icon buttons with Tip at @setup on fine pointer; labelled row under path below @setup or on touch. -->
  {#if !isHub}
    <div
      class="flex flex-none flex-wrap items-center gap-space-1 coarse:gap-x-space-2 coarse:gap-y-space-3 can-hover:@setup:flex-nowrap can-hover:@setup:justify-end"
      data-slot="actions"
    >
      {#if place.missing}
        <!-- Missing folder: Find folder stands first as a labelled neutral button. -->
        <Tip label={words.places.findFolder}>
          {#snippet children(props)}
            <Button
              {...props}
              aria-label={words.places.findFolder}
              disabled={actsDisabled}
              icon={IconFolderOpen}
              label={words.places.findFolder}
              onclick={(event) => triggerAct(props, event, "find")}
              size="xs"
              variant="outline"
            />
          {/snippet}
        </Tip>
      {/if}

      <Tip label={words.places.move}>
        {#snippet children(props)}
          <Button
            {...props}
            aria-label={words.places.move}
            class="can-hover:@setup:w-6 can-hover:@setup:gap-0 can-hover:@setup:px-0"
            disabled={actsDisabled}
            onclick={(event) => triggerAct(props, event, "move")}
            size="xs"
            tone="quiet"
            variant="ghost"
          >
            <IconTransfer aria-hidden="true" class="size-icon-sm flex-none" />
            <span class="can-hover:@setup:sr-only">{words.places.move}</span>
          </Button>
        {/snippet}
      </Tip>

      {#if !place.missing}
        <Tip label={words.places.findFolder}>
          {#snippet children(props)}
            <Button
              {...props}
              aria-label={words.places.findFolder}
              class="can-hover:@setup:w-6 can-hover:@setup:gap-0 can-hover:@setup:px-0"
              disabled={actsDisabled}
              onclick={(event) => triggerAct(props, event, "find")}
              size="xs"
              tone="quiet"
              variant="ghost"
            >
              <IconFolderOpen
                aria-hidden="true"
                class="size-icon-sm flex-none"
              />
              <span class="can-hover:@setup:sr-only"
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
            aria-label={words.places.copyToMachine}
            class="can-hover:@setup:w-6 can-hover:@setup:gap-0 can-hover:@setup:px-0"
            disabled={actsDisabled}
            onclick={(event) => triggerAct(props, event, "copy")}
            size="xs"
            tone="quiet"
            variant="ghost"
          >
            <IconCopy aria-hidden="true" class="size-icon-sm flex-none" />
            <span class="can-hover:@setup:sr-only"
              >{words.places.copyToMachine}</span
            >
          </Button>
        {/snippet}
      </Tip>

      {#if place.kind === "other"}
        <Tip label={words.places.drop}>
          {#snippet children(props)}
            <Button
              {...props}
              aria-label={words.places.drop}
              class="can-hover:@setup:w-6 can-hover:@setup:gap-0 can-hover:@setup:px-0"
              disabled={actsDisabled}
              onclick={(event) => triggerAct(props, event, "drop")}
              size="xs"
              tone="quiet"
              variant="ghost"
            >
              <IconClose aria-hidden="true" class="size-icon-sm flex-none" />
              <span class="can-hover:@setup:sr-only">{words.places.drop}</span>
            </Button>
          {/snippet}
        </Tip>
      {/if}
    </div>
  {/if}
</li>
