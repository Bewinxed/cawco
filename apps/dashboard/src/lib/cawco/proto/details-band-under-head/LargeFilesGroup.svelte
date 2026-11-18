<script lang="ts">
  /**
   * Large files: each repository's own storage, or one address for all of
   * them. Only for a project that holds code. The address and its
   * connection open in place once One address is picked (a later state).
   */
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import BandGroup from "./BandGroup.svelte";
  import { bandWords } from "./words";

  let {
    url,
    onpick,
  }: {
    /** The declared address; null: each repository's own. */
    url: string | null;
    onpick: (own: boolean) => void;
  } = $props();

  const words = bandWords.lfs;
</script>

<BandGroup title={words.title}>
  <OptionGroup
    aria-label={words.title}
    bind:value={
      () => [url === null ? "own" : "address"],
      (next) => {
        if (next[0] !== undefined) {
          onpick(next[0] === "own");
        }
      }
    }
  >
    <OptionGroupItem value="own">{words.own}</OptionGroupItem>
    <OptionGroupItem value="address">{words.address}</OptionGroupItem>
  </OptionGroup>
</BandGroup>
