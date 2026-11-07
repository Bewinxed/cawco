<script lang="ts">
  /**
   * Add a kind, closing the kinds' grid: a quiet card until pressed, then a
   * kind's card in the making, where it will stand. Its name in the head,
   * the face of who will answer it trailing (pressed to pick), and under
   * them the few examples agents file choices under it by. Cancel is the
   * one discard; closed with words in it, it stays for the session.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconPlus, IconToolGeneric } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import FaceChip from "./FaceChip.svelte";
  import HandOver from "./HandOver.svelte";
  import Hung from "./Hung.svelte";
  import { writeParkedKind } from "./kinds.svelte";

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
    <div class="mark-line flex min-w-0 items-center gap-space-2">
      <span class="grid h-c-btn-h-sm flex-none place-items-center" data-box>
        <IconToolGeneric
          aria-hidden="true"
          class="size-icon-md text-ink-muted"
        />
      </span>
      <Input
        aria-invalid={add.tried && problems.name ? true : undefined}
        aria-label={decidesWords.kindSteps.name}
        autocomplete="off"
        class="min-w-0 flex-auto"
        data-box
        placeholder={decidesWords.kindNamePlaceholder}
        bind:value={add.name}
      />
      {#if to}
        <span class="flex" data-box>
          <Hung
            align="end"
            anchor={chip}
            label={decidesWords.kindSteps.to}
            onopen={(open) => {
              picking = open;
            }}
            open={picking}
            width="var(--c-pop-w)"
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
            <HandOver
              current={to.id}
              fleetChoice={null}
              kind={draftKind}
              members={who.members}
              onpick={(id) => {
                add.to = id;
                picking = false;
                chip?.focus({ preventScroll: true });
              }}
              runsOn={(member) =>
                member.type === "caw"
                  ? null
                  : (who.facts(member, undefined)?.text ?? null)}
            />
          </Hung>
        </span>
      {/if}
    </div>
    <Input
      aria-invalid={add.tried && problems.example ? true : undefined}
      aria-label={decidesWords.kindSteps.example}
      autocomplete="off"
      placeholder={decidesWords.kindExamplePlaceholder}
      bind:value={add.example}
    />
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
    <div class="flex justify-end gap-space-2">
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
