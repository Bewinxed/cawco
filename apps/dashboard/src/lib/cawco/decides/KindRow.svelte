<script lang="ts">
  /**
   * One kind of choice in Kinds of choice (build spec §3.6), on its list's
   * grid (a subgrid row, so the deciders stand in one column): its glyph,
   * its name (with the pen glyph when he added it) over the examples agents
   * read, who decides it across the fleet as face and name, then Rename and,
   * on a kind he added, Remove. In the `kinds` container under 480px the
   * decider stands under the examples.
   *
   * Rename opens the name and the examples in place, with Done; Escape puts
   * them back. Remove counts what waits under the kind, then asks in the
   * row: what waits and where, and the kind its choices go to from now on,
   * Keep it or Remove. A refusal stands under the row in the hub's words,
   * with Try again.
   */
  import type { Kind } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import AskHere from "#lib/cawco/AskHere.svelte";
  import RowFault from "#lib/cawco/RowFault.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconPen, IconTrash } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import { kindGlyph } from "./kind-glyph";
  import MemberFace from "./MemberFace.svelte";

  let {
    who,
    kind,
    named,
  }: {
    who: WhoDecides;
    kind: Kind;
    /** The projects' names, by their ids. */
    named: (projects: string[]) => string[];
  } = $props();

  const uid = $props.id();
  const Glyph = $derived(kindGlyph(kind.id));
  const holder = $derived(who.fleetHolder(kind.id));
  const rename = $derived(
    who.kindRename?.id === kind.id ? who.kindRename : null
  );
  const problems = $derived(rename ? who.renameProblems(rename) : {});
  const fault = $derived(
    who.kindFault?.kind === kind.id ? who.kindFault : null
  );
  const asked = $derived(who.asker.pending?.at === `remove-kind:${kind.id}`);
  const others = $derived(who.kinds.filter((one) => one.id !== kind.id));

  let row = $state<HTMLElement | null>(null);

  /** Rename pressed: its first field in hand. */
  async function startRename() {
    who.startRename(kind.id);
    await tick();
    row?.querySelector<HTMLInputElement>("input")?.focus();
  }

  /** Escape in a field: the rename put back, and no further (Kinds of choice stays open). */
  function putBack(event: KeyboardEvent) {
    if (event.key === "Escape") {
      event.stopPropagation();
      who.kindRename = null;
      folded();
    }
  }

  /** Rename folded: the focus back on its button. */
  async function folded() {
    await tick();
    row?.querySelector<HTMLElement>("[data-rename]")?.focus();
  }
</script>

{#snippet glyph(Mark: typeof Glyph)}
  <span
    class="grid size-8 flex-none place-items-center rounded-xs bg-surface-raised text-ink-strong shadow-tile"
  >
    <Mark aria-hidden="true" class="size-icon-sm" />
  </span>
{/snippet}

<li
  bind:this={row}
  class="col-span-full grid min-w-0 grid-cols-subgrid items-start gap-y-space-2 border-b border-border-hairline py-space-3 last:border-b-0"
  data-kind-row={kind.id}
>
  <div class="col-start-1 row-start-1 @max-kinds/kinds:row-span-2">
    {@render glyph(Glyph)}
  </div>
  {#if rename}
    <form
      class="col-start-2 -col-end-1 row-start-1 flex min-w-0 flex-col gap-space-2"
      onsubmit={async (event) => {
        event.preventDefault();
        await who.doneRename();
        if (who.kindRename === null) {
          folded();
        }
      }}
    >
      <label class="type-meta text-ink-muted" for="{uid}-name"
        >{decidesWords.kindSteps.name}</label
      >
      <Input
        aria-describedby={problems.name ? `${uid}-name-problem` : undefined}
        aria-invalid={problems.name ? true : undefined}
        autocomplete="off"
        id="{uid}-name"
        onkeydown={putBack}
        bind:value={rename.name}
      />
      {#if problems.name}
        <p
          class="m-0 type-meta text-status-fail-ink text-pretty"
          id="{uid}-name-problem"
          role="alert"
        >
          {problems.name}
        </p>
      {/if}
      <label class="type-meta text-ink-muted" for="{uid}-example"
        >{decidesWords.kindSteps.example}</label
      >
      <Input
        aria-describedby={problems.example
          ? `${uid}-example-problem`
          : undefined}
        aria-invalid={problems.example ? true : undefined}
        autocomplete="off"
        id="{uid}-example"
        onkeydown={putBack}
        bind:value={rename.example}
      />
      {#if problems.example}
        <p
          class="m-0 type-meta text-status-fail-ink text-pretty"
          id="{uid}-example-problem"
          role="alert"
        >
          {problems.example}
        </p>
      {/if}
      <div class="flex justify-end">
        <Button
          label={decidesWords.renameDone}
          pending={rename.saving}
          pendingLabel={decidesWords.renaming}
          size="sm"
          type="submit"
          variant="secondary"
        />
      </div>
    </form>
  {:else}
    <div class="col-start-2 row-start-1 flex min-w-0 flex-col">
      <span class="mark-line flex min-w-0 items-center gap-x-space-1">
        <span
          class="min-w-0 type-label font-medium text-ink-strong wrap-anywhere"
          >{kind.name}</span
        >
        {#if !kind.builtIn}
          <IconPen
            aria-label={decidesWords.addedKey}
            class="size-icon-sm flex-none text-ink-muted"
            role="img"
          />
        {/if}
      </span>
      <span
        class="type-meta text-ink-muted text-pretty wrap-anywhere first-letter:uppercase"
        >{kind.example}</span
      >
    </div>
    {#if holder}
      <p
        class="mark-line m-0 col-start-3 row-start-1 flex min-w-0 items-center gap-x-space-2 self-center @max-kinds/kinds:col-start-2 @max-kinds/kinds:row-start-2"
      >
        <span class="sr-only">{decidesWords.whoAcrossFleet(holder.name)}</span>
        <MemberFace member={holder} size={24} />
        <span
          aria-hidden="true"
          class="min-w-0 type-label text-ink-strong wrap-anywhere"
          >{holder.name}</span
        >
      </p>
    {/if}
    <div
      class="col-start-4 row-start-1 flex items-center gap-x-space-3 self-center @max-kinds/kinds:col-start-3 @max-kinds/kinds:row-span-2"
    >
      <Button
        aria-label={decidesWords.rename(kind.name)}
        data-rename
        icon={IconPen}
        onclick={startRename}
        size="icon-sm"
        variant="ghost"
      />
      {#if !kind.builtIn}
        <Button
          aria-label={decidesWords.removeKind(kind.name)}
          disabled={asked}
          icon={IconTrash}
          onclick={() => who.askRemoveKind(kind.id, named)}
          pending={who.counting === kind.id}
          size="icon-sm"
          variant="ghost"
        />
      {/if}
    </div>
  {/if}
  {#if fault}
    <RowFault
      again={fault.again}
      class="col-start-2 -col-end-1"
      reason={fault.reason}
    />
  {/if}
  <AskHere asker={who.asker} at="remove-kind:{kind.id}" class="col-span-full">
    <div class="min-w-0">
      <OptionGroup
        aria-label={decidesWords.moveToLabel}
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
          {@const decider = who.fleetHolder(other.id)}
          <OptionGroupItem value={other.id}>
            <span class="mark-line flex min-w-0 items-center gap-x-space-2">
              <Mark aria-hidden="true" class="size-icon-sm flex-none" />
              <span class="min-w-0 wrap-anywhere">
                {other.name}
                {#if decider}
                  <span class="text-ink-muted"> · {decider.name}</span>
                {/if}
              </span>
            </span>
          </OptionGroupItem>
        {/each}
      </OptionGroup>
    </div>
  </AskHere>
</li>
