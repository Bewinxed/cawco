<script lang="ts">
  /**
   * A tray state's words, its object and its live line, crossed as one
   * whenever `key` changes: the new ones arrive and the old ones depart
   * where they stand (motion.ts). `center`: a failure's, centred.
   * `metaSlot` names the live line's data-slot.
   */
  import { arrive, depart } from "./motion";
  import StateObject from "./StateObject.svelte";
  import TrayMeta from "./TrayMeta.svelte";
  import type { AddressTray } from "./tray.svelte";
  import Words from "./Words.svelte";
  import type { Form, StateWords } from "./words";

  let {
    tray,
    form,
    words,
    key,
    center = false,
    metaSlot,
  }: {
    tray: AddressTray;
    form: Form;
    words: StateWords;
    key: string;
    center?: boolean;
    metaSlot?: string;
  } = $props();
</script>

<div class="relative grid min-w-0">
  {#key key}
    <div
      class={["grid min-w-0 gap-space-3", center && "text-center"]}
      in:arrive
      out:depart
    >
      {#each words.lines as line (line)}
        <p class="m-0 type-body text-pretty text-ink-muted">
          <Words text={line} />
        </p>
      {/each}
      <StateObject {form} {tray} />
      {#if words.meta}
        <TrayMeta {center} data-slot={metaSlot} meta={words.meta} />
      {/if}
    </div>
  {/key}
</div>
