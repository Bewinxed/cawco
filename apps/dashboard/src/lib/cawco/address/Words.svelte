<script lang="ts" module>
  /**
   * An address, a host name or a typed word (`cawco-12-7.netbird.cloud`,
   * `https://cawco.heron-pike.ts.net`, `cawco/`): a run with a dot between
   * name parts, a scheme, or the device's own name, with an opening
   * bracket and any closing punctuation kept on it.
   */
  const ADDRESS =
    /^\(?(?:https?:\/\/\S+|[a-z0-9-]+(?:\.[a-z0-9-]+)+\/?|cawco(?:-\d+)*\/?)[.,:;)]*$/;

  /** Where a line splits into runs: between its words, the spaces kept as runs of their own. */
  const SPACES = /(\s+)/;

  /** `text` in runs, each address marked so it is kept whole on one line. */
  export function runsOf(text: string): { text: string; address: boolean }[] {
    return text.split(SPACES).map((part) => ({
      text: part,
      address: ADDRESS.test(part),
    }));
  }
</script>

<script lang="ts">
  /**
   * A line of the tray's words with every address kept whole: a browser
   * breaks after a hyphen or a dot, so `cawco-12-7.netbird.cloud` split as
   * "cawco-12-" over "7.netbird.cloud" and read as two names. The line
   * still wraps between its words.
   */
  let { text }: { text: string } = $props();

  const runs = $derived(runsOf(text));
</script>

{#each runs as run, index (index)}{#if run.address}<span
      class="whitespace-nowrap"
      data-address>{run.text}</span
    >{:else}{run.text}{/if}{/each}
