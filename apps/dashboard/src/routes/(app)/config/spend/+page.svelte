<script lang="ts">
  /**
   * Spend: what reaching a project's budget does where the project sets
   * nothing of its own (project-caps.ts in the hub). A project sets its
   * budget, and may set its own answer to this, on its Usage tile.
   */
  import type { OnCap } from "@cawco/core";
  import { onMount } from "svelte";
  import { setSpendSettings, spendSettings } from "#lib/cawco/client.svelte.js";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";

  const section = sectionOf("spend");

  const ON_CAP: { value: OnCap; label: string; means: string }[] = [
    {
      value: "pause",
      label: "Pause dispatch",
      means:
        "No new attempt at the project's tasks starts. Caw still answers you.",
    },
    {
      value: "quiet",
      label: "Stop waking Caw",
      means:
        "What would wake the project's Caw is noted in its thread, without a turn. Attempts still start.",
    },
    {
      value: "both",
      label: "Pause both",
      means: "No new attempt starts, and Caw is not woken.",
    },
  ];

  let onCap = $state<OnCap | null>(null);
  let problem = $state<string | null>(null);
  let refused = $state<string | undefined>(undefined);

  onMount(() => {
    spendSettings().then(
      (read) => {
        ({ onCap } = read);
      },
      (error: unknown) => {
        problem = `Could not read the spend settings — ${error instanceof Error ? error.message : String(error)}.`;
      }
    );
  });

  async function choose(next: OnCap) {
    const was = onCap;
    onCap = next;
    refused = undefined;
    try {
      ({ onCap } = await setSpendSettings(next));
    } catch (error) {
      onCap = was;
      refused = error instanceof Error ? error.message : String(error);
    }
  }

  const means = $derived(ON_CAP.find((each) => each.value === onCap)?.means);
</script>

<SectionFrame
  problem={onCap === null ? problem : null}
  purpose={section.purpose}
  ready={onCap !== null}
  title={section.label}
>
  <div class="group">
    <p class="note">
      Each project sets what it may spend in a day or a month on its Usage page,
      and follows this unless it chooses otherwise.
    </p>
    <Field
      hint={means}
      id="spend-on-cap"
      label="When one is reached"
      problem={refused}
    >
      <NativeSelect
        class="w-full max-w-sm"
        id="spend-on-cap"
        onchange={(event) =>
          choose((event.currentTarget as HTMLSelectElement).value as OnCap)}
        value={onCap ?? ""}
      >
        {#each ON_CAP as each (each.value)}
          <NativeSelectOption value={each.value}
            >{each.label}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    </Field>
  </div>
</SectionFrame>

<style>
  .group {
    display: flex;
    flex-direction: column;
    gap: 8px;
  }
  .note {
    max-width: 72ch;
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
