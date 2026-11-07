<script lang="ts">
  /**
   * One kind of choice: its glyph, its name and the face of who answers it,
   * nothing else. The face is the press that changes who (WhoPicker: a
   * popover on a desk, a sheet on a phone), and once the hub has written it
   * the face changes in place. Under the members the same list renames the
   * kind (in the card), removes one he added (asked in the card) and, on a
   * project's page, puts a kind the project set back on the fleet's choice.
   * The head holds when the name wraps: the glyph sits on the name's first
   * line and the face is centred on it; in a narrow card the face drops
   * under the name, on its text column.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import type { WhoDecides } from "./decides.svelte";
  import FaceChip from "./FaceChip.svelte";
  import { kindGlyph } from "./kind-glyph";
  import WhoPicker, { type PickerAction } from "./WhoPicker.svelte";

  let {
    who,
    kind,
    project,
    named,
    facts,
  }: {
    who: WhoDecides;
    kind: Kind;
    /** The project's name; null on the fleet's page. */
    project: string | null;
    /** The projects' names, by their ids. */
    named: (projects: string[]) => string[];
    /** Why a member can't be reached now; null when it can. */
    facts: (id: string) => string | null;
  } = $props();

  const uid = $props.id();
  let card = $state<HTMLElement | null>(null);
  let chip = $state<HTMLElement | null>(null);

  const Glyph = $derived(kindGlyph(kind.id));
  const holder = $derived(who.member(who.routes[kind.id]));
  const own = $derived(project !== null && who.isOwn(kind.id));
  const asking = $derived(
    who.asking?.kinds.includes(kind.id) ? who.asking.said : null
  );
  const fault = $derived(who.fault?.kinds.includes(kind.id) ? who.fault : null);
  const rename = $derived(
    who.kindRename?.id === kind.id ? who.kindRename : null
  );
  const renameProblems = $derived(rename ? who.renameProblems(rename) : {});
  const kindFault = $derived(
    who.kindFault?.kind === kind.id ? who.kindFault : null
  );
  const others = $derived(who.kinds.filter((one) => one.id !== kind.id));
  const handing = $derived(who.handing === kind.id);
  /** What else is done to the kind, under the members in its picker. */
  const pickerActions = $derived<PickerAction[]>([
    { label: decidesWords.renameItem, run: startRename },
    ...(own
      ? [{ label: decidesWords.giveBack, run: () => who.useFleet([kind.id]) }]
      : []),
    ...(kind.builtIn
      ? []
      : [
          {
            label: decidesWords.removeItem,
            run: () => who.askRemoveKind(kind.id, named),
          },
        ]),
  ]);

  const pick = async (to: string) => {
    who.handing = null;
    chip?.focus({ preventScroll: true });
    if (to === holder?.id) {
      return;
    }
    if (project !== null && to === who.fleetRoutes[kind.id]) {
      await who.useFleet([kind.id]);
      return;
    }
    await who.handTo(kind.id, to);
  };

  async function startRename() {
    who.startRename(kind.id);
    await tick();
    card?.querySelector<HTMLInputElement>("[data-rename] input")?.focus();
  }

  function putBack(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      who.kindRename = null;
    }
  }

  const runsOn = (member: Member): string | null =>
    member.type === "caw" ? null : (who.facts(member, undefined)?.text ?? null);
</script>

<article
  aria-labelledby="{uid}-name"
  bind:this={card}
  class="@container/kind flex min-w-0 flex-col gap-space-3 rounded-lg border border-transparent bg-surface-raised p-space-4 shadow-tile"
  data-kind={kind.id}
>
  {#if rename}
    <form
      class="flex min-w-0 flex-col gap-space-2"
      data-rename
      onsubmit={(event) => {
        event.preventDefault();
        who.doneRename();
      }}
    >
      <label class="flex min-w-0 flex-col gap-space-1">
        <span class="type-label text-ink-muted">{decidesWords.nameLabel}</span>
        <Input
          aria-invalid={renameProblems.name ? true : undefined}
          autocomplete="off"
          onkeydown={putBack}
          bind:value={rename.name}
        />
      </label>
      <label class="flex min-w-0 flex-col gap-space-1">
        <span class="type-label text-ink-muted"
          >{decidesWords.examplesLabel}</span
        >
        <Input
          aria-invalid={renameProblems.example ? true : undefined}
          autocomplete="off"
          onkeydown={putBack}
          bind:value={rename.example}
        />
      </label>
      {#if renameProblems.name || renameProblems.example}
        <p class="type-meta text-status-fail-ink text-pretty" role="alert">
          {renameProblems.name ?? renameProblems.example}
        </p>
      {/if}
      <div class="flex justify-end gap-space-2">
        <Button
          onclick={() => {
            who.kindRename = null;
          }}
          size="sm"
          variant="ghost"><span>{decidesWords.cancel}</span></Button
        >
        <Button
          pending={rename.saving}
          pendingLabel={decidesWords.renaming}
          size="sm"
          type="submit"
          variant="default"><span>{decidesWords.renameDone}</span></Button
        >
      </div>
    </form>
  {:else}
    <!-- Glyph, name, face: the glyph and the face keep to the name's first
         line however many lines it takes; under 18rem (`kind-card`) the face drops to a row
         of its own on the name's text column. -->
    <!-- mark-line: the glyph keeps to the name's first line in a cell one line tall -->
    <div
      class="grid grid-cols-(--head-cols) items-start gap-x-space-2 gap-y-space-2 type-body"
      style:--head-cols={"auto minmax(0, 1fr) auto"}
    >
      <span class="flex h-lh items-center">
        <Glyph aria-hidden="true" class="size-icon-md text-ink-muted" />
      </span>
      <h2
        class="min-w-0 font-medium text-ink-strong text-balance"
        id="{uid}-name"
      >
        {kind.name}
      </h2>
      {#if holder}
        <span
          class="flex items-center gap-space-1 -my-(--chip-pull) @max-kind-card/kind:col-start-2 @max-kind-card/kind:row-start-2 @max-kind-card/kind:my-0 @max-kind-card/kind:-ms-space-1 @max-kind-card/kind:justify-self-start"
          style:--chip-pull={"calc((var(--c-btn-h) - 1lh) / 2)"}
        >
          {#if asking}
            <span class="flex" aria-hidden="true"><LiveDot /></span>
            <span class="sr-only" role="status">{asking}</span>
          {/if}
          <WhoPicker
            actions={pickerActions}
            anchor={chip}
            current={holder.id}
            fleetChoice={project === null ? null : who.fleetRoutes[kind.id]}
            {kind}
            members={who.members}
            onopen={(open) => {
              if (open && who.asking !== null) {
                return;
              }
              who.handing = open ? kind.id : null;
            }}
            onpick={pick}
            open={handing}
            {runsOn}
          >
            {#snippet trigger(props)}
              <FaceChip
                {...props}
                aria-label={decidesWords.answeredBy(kind.name, holder.name)}
                attention={facts(holder.id) !== null}
                bind:ref={chip}
                change
                member={holder}
                pressed={handing}
              />
            {/snippet}
          </WhoPicker>
        </span>
      {/if}
    </div>
  {/if}

  <RowFault again={fault?.again} reason={fault?.reason} />
  <RowFault again={kindFault?.again} reason={kindFault?.reason} />

  <AskHere asker={who.asker} at="remove-kind:{kind.id}">
    <p class="mb-space-1 type-label text-ink-muted" id="{uid}-move">
      {decidesWords.moveToLabel}
    </p>
    <OptionGroup
      aria-labelledby="{uid}-move"
      layout="list"
      bind:value={
        () => (who.moveTo === null ? [] : [who.moveTo]),
        (next) => {
          who.moveTo = next[0] ?? null;
        }
      }
    >
      {#each others as other (other.id)}
        {@const Mark = kindGlyph(other.id)}
        <OptionGroupItem value={other.id}>
          <span class="mark-line flex min-w-0 items-center gap-x-space-2">
            <Mark aria-hidden="true" class="size-icon-sm flex-none" />
            <span class="min-w-0 wrap-anywhere">{other.name}</span>
          </span>
        </OptionGroupItem>
      {/each}
    </OptionGroup>
  </AskHere>
</article>
