<script lang="ts">
  /**
   * One kind of choice on the card of the member who decides it. The whole
   * tile is the press that hands it over: its glyph, its name with the scope
   * glyph on a project's page (the globe follows the fleet, the folder is
   * this project's own), the example agents read, and the swap glyph. The
   * press opens who it can go to in the kit's popover, hung from the tile:
   * nothing on the page moves, and the tile stands edged in coral while it is
   * open. Escape gives the focus back to the tile; a press elsewhere closes
   * it and lands where it lands.
   *
   * While the hub writes a hand-over or a put-back the swap glyph breathes;
   * a refusal stands under the tile in the hub's words, with Try again.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import type { Snippet } from "svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconFolder, IconGlobe, IconTransfer } from "#lib/icons.js";
  import type { Fault } from "./decides.svelte";
  import { kindGlyph } from "./kind-glyph";

  let {
    kind,
    holder,
    fleetWho,
    own,
    project,
    handing,
    asking,
    fault,
    width,
    onhanding,
    onputback,
    list,
  }: {
    /** A write the hub has not answered moves it. */
    asking: string | null;
    /** A write that moved it, refused. */
    fault: Fault | null;
    /** The member the fleet sends it to. */
    fleetWho: Member | undefined;
    /** Its hand-over is open now. */
    handing: boolean;
    /** The member who holds it, whose hue washes it when it is this project's own. */
    holder: Member;
    kind: Kind;
    /** Who it can go to, drawn in its popover. */
    list: Snippet<[string]>;
    /** Opens or closes its hand-over. */
    onhanding: (open: boolean) => void;
    onputback: () => void;
    /** This project set it itself, rather than following the fleet. */
    own: boolean;
    /** The project's name; null on the fleet's page, which shows no scope. */
    project: string | null;
    /** The popover's width, for the rows it holds. */
    width: string;
  } = $props();

  const uid = $props.id();
  let tile = $state<HTMLElement | null>(null);
  let popover = $state<HTMLElement | null>(null);

  const Glyph = $derived(kindGlyph(kind.id));
  const Scope = $derived(own ? IconFolder : IconGlobe);
  /** Its surface: raised while its list is open, deeper when this project set it. */
  const surface = $derived.by(() => {
    if (handing) {
      return "bg-surface-raised inset-ring-2 inset-ring-brand-solid";
    }
    return own ? "bg-(--wash,var(--surface-recess-deep))" : "bg-surface-recess";
  });
  const scopeTip = $derived.by(() => {
    if (project === null) {
      return null;
    }
    const subject = fleetWho?.subject ?? "";
    return own
      ? decidesWords.ownTip(project, subject)
      : decidesWords.followsFleetTip(subject);
  });
  const tip = $derived(
    scopeTip ? `${decidesWords.handOver} · ${scopeTip}` : decidesWords.handOver
  );
</script>

<div class="flex min-w-0 flex-col items-stretch gap-space-1">
  <div
    bind:this={tile}
    class={[
      "relative flex min-w-0 items-start gap-x-space-2 rounded-well p-space-2 transition-control",
      surface,
    ]}
    data-handing={handing || undefined}
    data-slot="kind-tile"
    style:--wash={own && !handing && holder.hue !== null
      ? `color-mix(in oklab, var(--mark-${holder.hue}) 8%, var(--surface-recess))`
      : undefined}
  >
    <span
      class="grid size-8 flex-none place-items-center rounded-xs bg-surface-raised text-ink-strong shadow-tile"
    >
      <Glyph aria-hidden="true" class="size-icon-sm" />
    </span>
    <div class="flex min-w-0 flex-auto flex-col">
      <span class="flex min-w-0 flex-wrap items-center gap-x-space-1">
        <span
          class="min-w-0 type-label font-medium text-ink-strong wrap-anywhere"
          >{kind.name}</span
        >
        {#if project !== null}
          <Scope
            aria-hidden="true"
            class="size-icon-sm flex-none text-ink-muted"
          />
        {/if}
      </span>
      <span
        class="block type-meta text-ink-muted wrap-anywhere first-letter:uppercase"
        >{kind.example}</span
      >
    </div>
    <span class="grid size-icon-sm flex-none place-items-center">
      {#if asking}
        <LiveDot />
      {:else}
        <IconTransfer aria-hidden="true" class="size-icon-sm text-ink-muted" />
      {/if}
    </span>
    {#if asking}
      <span class="sr-only" role="status">{asking}</span>
    {/if}
    <Popover.Root bind:open={() => handing, onhanding}>
      <Tooltip.Root disabled={handing}>
        <Popover.Trigger>
          {#snippet child({ props: pop })}
            <Tooltip.Trigger {...pop}>
              {#snippet child({ props })}
                <button
                  {...props}
                  aria-label={scopeTip
                    ? `${decidesWords.handOverKind(kind.name)}. ${scopeTip}`
                    : decidesWords.handOverKind(kind.name)}
                  class="absolute inset-0 rounded-well can-hover:hover:bg-ink-strong/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
                  aria-disabled={asking !== null || undefined}
                  data-kind-press={kind.id}
                  type="button"
                ></button>
              {/snippet}
            </Tooltip.Trigger>
          {/snippet}
        </Popover.Trigger>
        <Tooltip.Content>{tip}</Tooltip.Content>
      </Tooltip.Root>
      <Popover.Content
        align="start"
        aria-labelledby="{uid}-head"
        customAnchor={tile}
        gap="none"
        height="room"
        onCloseAutoFocus={(event) => {
          // A pick put the focus on the tile already (Roster), which then
          // flies to its new card: the focus stays where it was put.
          const at = document.activeElement;
          if (at && at !== document.body && !popover?.contains(at)) {
            event.preventDefault();
          }
        }}
        overflow="scroll"
        side="bottom"
        style="--pop-w: {width}; --pop-max-h: var(--bits-popover-content-available-height)"
        width="room"
        bind:ref={popover}
      >
        {@render list(`${uid}-head`)}
      </Popover.Content>
    </Popover.Root>
  </div>
  {#if own}
    <button
      class="self-center type-meta text-brand-ink underline underline-offset-2 can-hover:hover:not-aria-disabled:text-brand-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid aria-disabled:text-ink-muted"
      aria-disabled={asking !== null || undefined}
      onclick={() => {
        if (asking === null) {
          onputback();
        }
      }}
      type="button">{decidesWords.giveBack}</button
    >
  {/if}
  <RowFault again={fault?.again} reason={fault?.reason} />
</div>
