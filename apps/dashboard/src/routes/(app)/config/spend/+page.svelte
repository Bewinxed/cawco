<script lang="ts">
  /**
   * Spend: what reaching a project's budget does where the project sets
   * nothing of its own (project-caps.ts in the hub). A project sets its
   * budget, and may set its own answer to this, on its Usage tile.
   */
  import { type OnCap, SPEND_ON_CAP, spendWords } from "@cawco/core";
  import { onMount } from "svelte";
  import { setSpendSettings, spendSettings } from "#lib/cawco/client.svelte.js";
  import Field from "#lib/cawco/config/Field.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import { failureClause, failureWords } from "#lib/cawco/hub-read.js";
  import {
    NativeSelect,
    NativeSelectOption,
  } from "#lib/components/ui/native-select/index.js";

  const section = sectionOf("spend");

  let onCap = $state<OnCap | null>(null);
  let problem = $state<string | null>(null);
  let refused = $state<string | undefined>(undefined);

  onMount(() => {
    spendSettings().then(
      (read) => {
        ({ onCap } = read);
      },
      (error: unknown) => {
        problem = spendWords.unread(failureClause(error));
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
      refused = failureWords(error);
    }
  }

  const means = $derived(
    SPEND_ON_CAP.find((each) => each.value === onCap)?.means
  );
</script>

<SectionFrame
  problem={onCap === null ? problem : null}
  purpose={section.purpose}
  ready={onCap !== null}
  title={section.label}
>
  <div data-slot="group" class="flex flex-col gap-space-2">
    <p data-slot="note" class="type-meta max-w-(--c-measure) text-ink-muted">{spendWords.note}</p>
    <Field
      hint={means}
      id="spend-on-cap"
      label={spendWords.onCap}
      problem={refused}
    >
      <NativeSelect
        class="w-full"
        id="spend-on-cap"
        measure="cap-md"
        onchange={(event) =>
          choose((event.currentTarget as HTMLSelectElement).value as OnCap)}
        value={onCap ?? ""}
      >
        {#each SPEND_ON_CAP as each (each.value)}
          <NativeSelectOption value={each.value}
            >{each.label}</NativeSelectOption
          >
        {/each}
      </NativeSelect>
    </Field>
  </div>
</SectionFrame>
