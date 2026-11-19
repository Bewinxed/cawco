<script lang="ts">
  /**
   * The sign-ins that can serve, one option row each: its name over the
   * account behind it. One pick.
   */
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { IconKey } from "#lib/icons.js";
  import type { SignIn } from "./details";
  import OptionLine from "./OptionLine.svelte";

  let {
    signIns,
    chosen,
    label,
    sunk = false,
    onchoose,
  }: {
    signIns: SignIn[];
    chosen: string | null;
    /** The group's name, as a screen reader says it. */
    label: string;
    sunk?: boolean;
    onchoose: (id: string | null) => void;
  } = $props();
</script>

<OptionGroup
  aria-label={label}
  bind:value={
    () => (chosen ? [chosen] : []), (next) => onchoose(next[0] ?? null)
  }
  disabled={sunk}
  glide
  layout="list"
>
  {#each signIns as signIn (signIn.id)}
    <OptionGroupItem value={signIn.id}>
      <OptionLine glyph={IconKey} line={signIn.account} name={signIn.name} />
    </OptionGroupItem>
  {/each}
</OptionGroup>
