<script lang="ts">
  /**
   * Add a kind, closing the kinds' grid: a quiet card until pressed, then a
   * kind's card in the making, where it will stand: its name, the few
   * examples agents file choices under it by, and the face of who will
   * answer it (pressed to pick) beside Cancel and Add kind. Cancel is the
   * one discard; closed with words in it, it stays for the session.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconPlus } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import FaceChip from "./FaceChip.svelte";
  import { writeParkedKind } from "./kinds.svelte";
  import WhoPicker from "./WhoPicker.svelte";

  let { who }: { who: WhoDecides } = $props();

  let card = $state<HTMLElement | null>(null);
  let chip = $state<HTMLElement | null>(null);
  let picking = $state(false);

  const add = $derived(who.kindAdd);
  const problems = $derived(add ? who.kindAddProblems(add) : {});
  const to = $derived(add ? who.member(add.to) : undefined);
  const draftKind = $derived({
    id: "new",
    name: add?.name.trim() || decidesWords.addKind,
    example: add?.example ?? "",
    builtIn: false,
    position: who.kinds.length,
  });

  async function start() {
    who.startKind();
    await tick();
    card?.querySelector<HTMLInputElement>("input")?.focus();
  }

  function keep() {
    writeParkedKind(who.projectId, who.kindAdd);
  }
</script>

{#if add}
  <form
    bind:this={card}
    class="flex min-w-0 flex-col gap-space-3 rounded-lg bg-surface-raised p-space-3 shadow-tile"
    onfocusout={keep}
    onsubmit={(event) => {
      event.preventDefault();
      who.addKind();
    }}
  >
    <label class="flex min-w-0 flex-col gap-space-1">
      <span class="type-label text-ink-muted">{decidesWords.nameLabel}</span>
      <Input
        aria-invalid={add.tried && problems.name ? true : undefined}
        autocomplete="off"
        bind:value={add.name}
      />
    </label>
    <label class="flex min-w-0 flex-col gap-space-1">
      <span class="type-label text-ink-muted">{decidesWords.examplesLabel}</span
      >
      <Input
        aria-invalid={add.tried && problems.example ? true : undefined}
        autocomplete="off"
        bind:value={add.example}
      />
    </label>
    {#if add.tried && (problems.name || problems.example || problems.to)}
      <p class="type-meta text-status-fail-ink text-pretty" role="alert">
        {problems.name ?? problems.example ?? problems.to}
      </p>
    {/if}
    {#if add.fault && add.fault.step === null}
      <p class="type-meta text-status-fail-ink text-pretty" role="alert">
        {add.fault.reason}
      </p>
    {/if}
    <div class="flex min-w-0 items-center gap-space-2">
      {#if to}
        <WhoPicker
          anchor={chip}
          current={to.id}
          fleetChoice={null}
          kind={draftKind}
          members={who.members}
          onopen={(open) => {
            picking = open;
          }}
          onpick={(id) => {
            add.to = id;
            picking = false;
            chip?.focus({ preventScroll: true });
          }}
          open={picking}
          runsOn={(member) =>
            member.type === "caw"
              ? null
              : (who.facts(member, undefined)?.text ?? null)}
        >
          {#snippet trigger(props)}
            <FaceChip
              {...props}
              aria-label={decidesWords.answeredBy(draftKind.name, to.name)}
              bind:ref={chip}
              change
              member={to}
              pressed={picking}
            />
          {/snippet}
        </WhoPicker>
      {/if}
      <span class="ms-auto"></span>
      <Button onclick={() => who.cancelKind()} size="sm" variant="ghost"
        ><span>{decidesWords.cancel}</span></Button
      >
      <Button
        pending={add.saving}
        pendingLabel={decidesWords.addingKind}
        size="sm"
        type="submit"
        variant="default"><span>{decidesWords.addKindAct}</span></Button
      >
    </div>
  </form>
{:else}
  <button
    class="mark-line flex min-h-c-stat-h items-center justify-center gap-space-2 self-start rounded-lg border border-border-control border-dashed p-space-3 text-ink-muted transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
    onclick={start}
    type="button"
  >
    <IconPlus aria-hidden="true" class="size-icon-sm" />
    <span class="type-label">{decidesWords.addKind}</span>
  </button>
{/if}
