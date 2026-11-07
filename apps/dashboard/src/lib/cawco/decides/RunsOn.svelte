<script lang="ts">
  /**
   * What an agent member runs on, as the setting chips of its card: its
   * harness, its model and its effort, each a menu of the choices it has
   * (a harness says how many machines run it, an effort what it means).
   * Caw's harness and model are his project's: no effort. A harness on no
   * machine stands in the attention ink, with why under the chips.
   */
  import { HARNESSES, type HarnessKind } from "@cawco/core/harness";
  import { decidesWords } from "@cawco/core/words/decides";
  import { EFFORT_OPTIONS } from "#lib/cawco/effort-levels.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconChevronDown } from "#lib/icons.js";
  import type { WhoDecides } from "./decides.svelte";
  import type { Draft } from "./setup.svelte";

  let {
    who,
    draft,
    caw = false,
    name,
  }: {
    who: WhoDecides;
    /** The member's draft, changed in place. */
    draft: Draft;
    /** It is Caw: his project's harness and model. */
    caw?: boolean;
    /** The member's name, for the chips' accessible names. */
    name: string;
  } = $props();

  const offer = (id: HarnessKind | null) =>
    who.harnesses.find((one) => one.id === id);
  const machines = (id: HarnessKind) => offer(id)?.machines.length ?? 0;
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
    draft.model ?? models.find((one) => one.default)?.id ?? ""
  );
  const effort = $derived(
    EFFORT_OPTIONS.find((one) => one.value === draft.effort)
  );
  const nowhere = $derived(
    draft.harness !== null && machines(draft.harness) === 0
  );
</script>

{#snippet chip(
  props: Record<string, unknown>,
  words: string,
  label: string,
  attention = false
)}
  <button
    {...props}
    aria-label="{label}: {words}"
    class={[
      "mark-line inline-flex max-w-full min-w-0 items-center gap-space-1 rounded-sm border bg-surface-raised px-space-2 py-px type-label transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid",
      attention
        ? "border-status-attn-ink text-status-attn-ink"
        : "border-border-control text-ink-strong",
    ]}
    type="button"
  >
    <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
      >{words}</span
    >
    <IconChevronDown
      aria-hidden="true"
      class="size-icon-sm flex-none text-ink-muted"
    />
  </button>
{/snippet}

<div class="flex min-w-0 flex-wrap gap-space-1">
  <DropdownMenu.Root>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        {@render chip(
          props,
          draft.harness === null
            ? decidesWords.harnessLabel
            : who.harnessName(draft.harness),
          decidesWords.harnessOf(name),
          nowhere
        )}
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="start" class="w-auto" min="compact">
      <DropdownMenu.RadioGroup
        onValueChange={(value) => {
          const next = value as HarnessKind;
          if (next !== draft.harness) {
            draft.harness = next;
            draft.model = caw
              ? null
              : (offer(next)?.models.find((one) => one.default)?.id ?? null);
          }
        }}
        value={draft.harness ?? ""}
      >
        {#each HARNESSES as id (id)}
          <DropdownMenu.RadioItem
            disabled={machines(id) === 0 && draft.harness !== id}
            value={id}
          >
            <span class="flex min-w-0 flex-col" data-box>
              <span>{who.harnessName(id)}</span>
              <span class="type-meta text-ink-muted"
                >{decidesWords.harnessMachines(machines(id))}</span
              >
            </span>
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
    </DropdownMenu.Content>
  </DropdownMenu.Root>

  {#if models.length > 0}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          {@render chip(
            props,
            who.modelName(draft.harness ?? "claude", draft.model),
            decidesWords.modelOf(name)
          )}
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-auto" min="compact">
        <DropdownMenu.RadioGroup
          onValueChange={(picked) => {
            draft.model =
              caw && models.find((one) => one.id === picked)?.default
                ? null
                : picked;
          }}
          value={modelChosen}
        >
          {#each models as model (model.id)}
            <DropdownMenu.RadioItem value={model.id}
              >{model.name}</DropdownMenu.RadioItem
            >
          {/each}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}

  {#if !caw}
    <DropdownMenu.Root>
      <DropdownMenu.Trigger>
        {#snippet child({ props })}
          {@render chip(
            props,
            effort?.label ?? decidesWords.effortLabel,
            decidesWords.effortOf(name)
          )}
        {/snippet}
      </DropdownMenu.Trigger>
      <DropdownMenu.Content align="start" class="w-c-pop-w" min="compact">
        <DropdownMenu.RadioGroup
          onValueChange={(value) => {
            draft.effort = value as Draft["effort"];
          }}
          value={draft.effort ?? ""}
        >
          {#each EFFORT_OPTIONS as one (one.value)}
            <DropdownMenu.RadioItem value={one.value}>
              <span class="flex min-w-0 flex-col" data-box>
                <span>{one.label}</span>
                <span class="type-meta text-ink-muted text-pretty"
                  >{one.description}</span
                >
              </span>
            </DropdownMenu.RadioItem>
          {/each}
        </DropdownMenu.RadioGroup>
      </DropdownMenu.Content>
    </DropdownMenu.Root>
  {/if}
</div>
