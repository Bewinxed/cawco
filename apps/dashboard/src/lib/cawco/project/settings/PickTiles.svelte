<script lang="ts" generics="T extends string">
  /**
   * One pick among a few: the house's option tiles (OptionTiles), each led
   * by its glyph with its name and what picking it does under it, the pick
   * the kit's selection pill gliding to it. Every section's choice is this
   * one control (Task sync, Git LFS, where code goes, the usage limit, who
   * marks tasks done).
   */
  import type { Snippet } from "svelte";
  import { OptionTiles } from "#lib/components/ui/option-group/index.js";

  let {
    value,
    options,
    label,
    glyph,
    cols,
    disabled = false,
    onpick,
  }: {
    value: T | null;
    options: readonly { id: T; name: string; note: string }[];
    /** The group, as a screen reader names it. */
    label: string;
    /** Each option's glyph, by its id (a tracker's logo, a Solar glyph). */
    glyph: Snippet<[T]>;
    /** The tiles a row holds; one a row where so many would stand under the choice tile's least width. */
    cols: number;
    disabled?: boolean;
    onpick: (next: T) => void;
  } = $props();
</script>

<OptionTiles
  bind:value={
    () => value,
    (next) => {
      if (next !== null && next !== value) {
        onpick(next);
      }
    }
  }
  {cols}
  {disabled}
  glide
  {glyph}
  {label}
  options={[...options]}
  wraps
/>
