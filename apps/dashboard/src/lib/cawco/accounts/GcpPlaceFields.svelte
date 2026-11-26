<script lang="ts">
  /**
   * The Google Cloud project and location a Gemini Enterprise or Agent
   * Platform account runs in (core harness/agy-account.ts `GcpPlace`): two
   * fields side by side, stacked on a narrow setup. Asked once, before the
   * account is made, and kept with it for good, so once it is made they
   * stand read-only.
   */
  import { accountsWords } from "@cawco/core/words/accounts";
  import { Input } from "#lib/components/ui/input/index.js";

  let {
    project = $bindable(""),
    location = $bindable(""),
    locked = false,
  }: {
    project?: string;
    location?: string;
    /** The account is made: its place is its own for good. */
    locked?: boolean;
  } = $props();

  const words = accountsWords.setup;
  const id = $props.id();
</script>

<div data-slot="gcp-place" class="@container/place mb-space-4 min-w-0">
  <div
    class="grid min-w-0 grid-cols-(--place-cols) gap-space-3 @max-[28rem]/place:grid-cols-1"
    style:--place-cols="minmax(0, 3fr) minmax(0, 2fr)"
  >
    <div class="flex min-w-0 flex-col gap-space-2">
      <label
        data-slot="place-label"
        class="type-label text-ink-strong"
        for="{id}-project">{words.gcpProject}</label
      >
      <Input
        autocomplete="off"
        id="{id}-project"
        placeholder={words.gcpProjectExample}
        readonly={locked}
        spellcheck="false"
        bind:value={project}
      />
    </div>
    <div class="flex min-w-0 flex-col gap-space-2">
      <label
        data-slot="place-label"
        class="type-label text-ink-strong"
        for="{id}-location">{words.gcpLocation}</label
      >
      <Input
        autocomplete="off"
        id="{id}-location"
        placeholder={words.gcpLocationExample}
        readonly={locked}
        spellcheck="false"
        bind:value={location}
      />
    </div>
  </div>
</div>
