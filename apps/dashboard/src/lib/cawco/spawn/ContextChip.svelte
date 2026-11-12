<script lang="ts">
  import { spawnWords } from "@cawco/core/words/spawn";
  /**
   * The session's context as a composer chip, beside Lifetime and in its
   * pattern: its instruction files, memory, skills and hooks as every
   * session has them, or clean, with none of them (core
   * `SpawnPayload.clean`), so a run can be compared with and without them.
   * Off by default.
   */
  import { IconLayers as Layers, IconLeaf as Leaf } from "#lib/icons.js";
  import ChoiceChip, { type ChoiceOption } from "./ChoiceChip.svelte";

  let {
    clean,
    onclean,
    open,
    onchange,
  }: {
    clean: boolean;
    onclean: (clean: boolean) => void;
    open: boolean;
    onchange: (open: boolean) => void;
  } = $props();
  const OPTIONS: ChoiceOption<boolean>[] = [
    {
      value: false,
      name: spawnWords.context.full,
      desc: spawnWords.context.fullDesc,
      icon: Layers,
      hue: "var(--color-hue-blue-500)",
    },
    {
      value: true,
      name: spawnWords.context.clean,
      desc: spawnWords.context.cleanDesc,
      icon: Leaf,
      hue: "var(--color-hue-green-500)",
    },
  ];
</script>

<ChoiceChip
  id="session-context"
  label={spawnWords.context.chip}
  {onchange}
  onpick={onclean}
  {open}
  options={OPTIONS}
  value={clean}
/>
