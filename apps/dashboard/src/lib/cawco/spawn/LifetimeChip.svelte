<script lang="ts">
  import { spawnWords } from "@cawco/core/words/spawn";
  /**
   * Session lifetime as a composer chip. Choosing between keeping a session
   * and letting it end with its task is a decision worth a look at both
   * options, so the chip opens them rather than flipping on a click.
   */
  import { IconDatabase as Database, IconFire as Fire } from "#lib/icons.js";
  import ChoiceChip, { type ChoiceOption } from "./ChoiceChip.svelte";

  let {
    ephemeral,
    onlifetime,
    open,
    onchange,
  }: {
    ephemeral: boolean;
    onlifetime: (ephemeral: boolean) => void;
    open: boolean;
    onchange: (open: boolean) => void;
  } = $props();
  const OPTIONS: ChoiceOption<boolean>[] = [
    {
      value: false,
      name: spawnWords.lifetime.persistent,
      desc: spawnWords.lifetime.persistentDesc,
      icon: Database,
      hue: "var(--color-hue-blue-500)",
    },
    {
      value: true,
      name: spawnWords.lifetime.ephemeral,
      desc: spawnWords.lifetime.ephemeralDesc,
      icon: Fire,
      hue: "var(--color-hue-orange-500)",
    },
  ];
</script>

<ChoiceChip
  id="session-lifetime"
  label={spawnWords.lifetime.chip}
  {onchange}
  onpick={onlifetime}
  {open}
  options={OPTIONS}
  value={ephemeral}
/>
