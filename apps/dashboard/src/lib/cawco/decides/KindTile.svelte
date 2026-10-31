<script lang="ts">
  /**
   * One kind of choice on the card of the member who decides it. The whole
   * tile is the press that hands it over: its glyph, its name with the scope
   * glyph (the globe follows the fleet, the folder is this project's own),
   * the example agents read, and the swap glyph. While its hand-over is open
   * it stands raised and edged in coral, the mark that says which press the
   * list under the card came from.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { IconFolder, IconGlobe, IconTransfer } from "#lib/icons.js";
  import { kindGlyph } from "./kind-glyph";

  let {
    kind,
    holder,
    fleetWho,
    own,
    project,
    handing,
    listId,
    onhand,
    onputback,
  }: {
    fleetWho: Member;
    /** Its hand-over is open now. */
    handing: boolean;
    /** The member who holds it, whose hue washes it when it is this project's own. */
    holder: Member;
    kind: Kind;
    /** The open hand-over's id, for its control. */
    listId: string;
    onhand: (from: HTMLElement) => void;
    onputback: () => void;
    /** This project set it itself, rather than following the fleet. */
    own: boolean;
    project: string;
  } = $props();

  const Glyph = $derived(kindGlyph(kind.id));
  const Scope = $derived(own ? IconFolder : IconGlobe);
  /** Its surface: raised while its list is open, deeper when this project set it. */
  const surface = $derived.by(() => {
    if (handing) {
      return "bg-surface-raised inset-ring-2 inset-ring-brand-solid";
    }
    return own ? "bg-(--wash,var(--surface-recess-deep))" : "bg-surface-recess";
  });
  const scopeTip = $derived(
    own
      ? decidesWords.ownTip(project, fleetWho.subject)
      : decidesWords.followsFleetTip(fleetWho.subject)
  );
</script>

<div class="flex flex-col items-stretch gap-space-1">
  <div
    class={[
      "group/tile relative flex min-w-0 items-start gap-x-space-2 rounded-well p-space-2 transition-control",
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
        <Scope
          aria-hidden="true"
          class="size-icon-sm flex-none text-ink-muted"
        />
      </span>
      <span
        class="block type-meta text-ink-muted wrap-anywhere first-letter:uppercase"
        >{kind.example}</span
      >
    </div>
    <IconTransfer
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-muted"
    />
    <Tooltip.Root>
      <Tooltip.Trigger>
        {#snippet child({ props })}
          <button
            {...props}
            aria-controls={handing ? listId : undefined}
            aria-expanded={handing}
            aria-label={`${decidesWords.handOverKind(kind.name)}. ${scopeTip}`}
            class="absolute inset-0 rounded-well hover:bg-ink-strong/5 focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
            data-kind-press
            onclick={(event) => onhand(event.currentTarget)}
            type="button"
          ></button>
        {/snippet}
      </Tooltip.Trigger>
      <Tooltip.Content>{decidesWords.handOver} · {scopeTip}</Tooltip.Content>
    </Tooltip.Root>
  </div>
  {#if own}
    <button
      class="self-center type-meta text-brand-ink underline underline-offset-2 hover:text-brand-ink-strong focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
      onclick={onputback}
      type="button">{decidesWords.giveBack}</button
    >
  {/if}
</div>
