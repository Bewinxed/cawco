<script lang="ts">
  /**
   * Add a kind, closing the kinds' grid: a tile the size of a kind's card,
   * whose press opens the new kind's two fields (its name, and the few
   * examples agents file choices under it by) hung from it (Hung), so the
   * tile stays its size while it is open. Added, the kind's card stands in
   * the grid answered by You, handed over from its face like any other.
   * Cancel is the one discard; closed with words in it, it stays for the
   * session.
   */
  import { decidesWords } from "@cawco/core/words/decides";
  import { tick } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { IconPlus } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import Hung from "./Hung.svelte";

  let { who }: { who: WhoDecides } = $props();

  let tile = $state<HTMLElement | null>(null);
  let form = $state<HTMLElement | null>(null);

  const add = $derived(who.kindAdd);
  const problems = $derived(add ? who.kindAddProblems(add) : {});

  /** Opened, a kind half added comes back where it was; closed, it is kept (WhoDecides `showKinds`). */
  async function show(next: boolean) {
    who.showKinds(next);
    if (next) {
      who.startKind();
      await tick();
      form?.querySelector<HTMLInputElement>("input")?.focus();
    }
  }
</script>

<Hung
  anchor={tile}
  label={decidesWords.addKind}
  onopen={show}
  open={who.kindsOpen}
  width="var(--c-pop-w)"
>
  {#snippet trigger(props)}
    <button
      {...props}
      bind:this={tile}
      class={[
        "mark-line flex min-w-0 items-start gap-space-2 rounded-lg border border-border-control border-dashed p-space-4 type-body text-ink-muted transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid",
        who.kindsOpen && "bg-surface-pressed",
      ]}
      type="button"
    >
      <span class="flex h-lh items-center" data-box
        ><IconPlus aria-hidden="true" class="size-icon-md" /></span
      >
      <span>{decidesWords.addKind}</span>
    </button>
  {/snippet}
  {#if add}
    <form
      bind:this={form}
      class="flex min-w-0 flex-col gap-space-3"
      onsubmit={async (event) => {
        event.preventDefault();
        await who.addKind();
        if (who.kindAdd === null) {
          who.showKinds(false);
        }
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
        <span class="type-label text-ink-muted"
          >{decidesWords.examplesLabel}</span
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
      <div class="flex justify-end gap-space-2">
        <Button
          onclick={() => {
            who.cancelKind();
            who.showKinds(false);
          }}
          size="sm"
          variant="ghost"><span>{decidesWords.cancel}</span></Button
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
  {/if}
</Hung>
