<script lang="ts">
  /**
   * What an agent member runs on, unfolded from its chip in its card: the
   * harness (each on the machines that run it), the model, the effort with
   * what it means, and whether it may start delegates of its own. Caw's
   * harness and model are his project's: no effort, no delegates.
   */
  import { HARNESSES, type HarnessKind } from "@cawco/core/harness";
  import { decidesWords } from "@cawco/core/words/decides";
  import { EFFORT_OPTIONS } from "#lib/cawco/effort-levels.js";
  import { Checkbox } from "#lib/components/ui/checkbox/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
    OptionTiles,
  } from "#lib/components/ui/option-group/index.js";
  import type { WhoDecides } from "./decides.svelte";
  import type { Draft } from "./setup.svelte";

  let {
    who,
    draft,
    caw = false,
    problem,
  }: {
    who: WhoDecides;
    /** The member's draft, changed in place. */
    draft: Draft;
    /** It is Caw: his project's harness and model. */
    caw?: boolean;
    /** Why it can't run as drawn, once Save was pressed. */
    problem: string | undefined;
  } = $props();

  const uid = $props.id();
  const offer = (id: HarnessKind | null) =>
    who.harnesses.find((one) => one.id === id);
  const harnessTiles = $derived(
    HARNESSES.map((id) => {
      const machines = offer(id)?.machines ?? [];
      return {
        id,
        name: who.harnessName(id),
        note:
          machines.length > 0
            ? decidesWords.harnessOn(machines)
            : decidesWords.notOnMachine,
        disabled: machines.length === 0 && draft.harness !== id,
      };
    })
  );
  const models = $derived.by(() => {
    const listed = offer(draft.harness)?.models ?? [];
    const own =
      draft.model !== null && !listed.some((one) => one.id === draft.model)
        ? [
            {
              id: draft.model,
              name: who.modelName(draft.harness ?? "claude", draft.model),
              default: false,
            },
          ]
        : [];
    return [...own, ...listed];
  });
  const modelChosen = $derived(
    draft.model ?? models.find((one) => one.default)?.id ?? null
  );
  const effort = $derived(
    EFFORT_OPTIONS.find((one) => one.value === draft.effort)
  );
</script>

<div class="flex min-w-0 flex-col gap-space-3">
  <OptionTiles
    cols={3}
    label={decidesWords.harnessLabel}
    options={harnessTiles}
    bind:value={
      () => draft.harness,
      (next) => {
        if (next !== null && next !== draft.harness) {
          draft.harness = next;
          draft.model = caw
            ? null
            : (offer(next)?.models.find((one) => one.default)?.id ?? null);
        }
      }
    }
  />
  {#if problem}
    <p class="type-meta text-status-fail-ink text-pretty" role="alert">
      {problem}
    </p>
  {/if}
  {#if models.length > 0}
    <div class="max-h-64 min-w-0 overflow-y-auto overscroll-contain">
      <OptionGroup
        aria-labelledby="{uid}-model"
        layout="list"
        bind:value={
          () => (modelChosen === null ? [] : [modelChosen]),
          (next) => {
            const [picked] = next;
            if (picked !== undefined) {
              draft.model =
                caw && models.find((one) => one.id === picked)?.default
                  ? null
                  : picked;
            }
          }
        }
      >
        {#each models as model (model.id)}
          <OptionGroupItem value={model.id}>
            <span class="min-w-0 wrap-anywhere">{model.name}</span>
          </OptionGroupItem>
        {/each}
      </OptionGroup>
      <span class="sr-only" id="{uid}-model">{decidesWords.modelLabel}</span>
    </div>
  {/if}
  {#if !caw}
    <OptionTiles
      cols={5}
      colsPhone={3}
      label={decidesWords.effortLabel}
      options={EFFORT_OPTIONS.map((one) => ({
        id: one.value,
        name: one.label,
      }))}
      bind:value={draft.effort}
    />
    {#if effort}
      <p class="max-w-c-measure type-meta text-ink-muted text-pretty">
        {effort.description}
      </p>
    {/if}
    <label
      class="mark-line flex min-h-c-touch-floor items-center gap-space-2 type-label text-ink-strong"
    >
      <Checkbox data-box bind:checked={draft.delegates} />
      <span>{decidesWords.delegatesLabel}</span>
    </label>
  {/if}
</div>
