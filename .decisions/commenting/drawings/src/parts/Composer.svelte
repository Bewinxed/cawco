<!--
  The composer (comment-design §3): the target chip (the element's glyph and
  name; it opens the element's chain, ending in Whole page), the field
  ("What should change here?", two rows, growing to six), then Cancel and
  Comment, Comment off while the field is empty. Nothing is written until
  Comment; Cancel, Esc or a press outside closes it and the hollow pin goes.
-->
<script lang="ts">
  import { Button } from "$kit/components/ui/button/index.js";
  import { chipVariants } from "$kit/components/ui/chip/index.js";
  import { Textarea } from "$kit/components/ui/textarea/index.js";
  import { IconChevronDown, IconLayers } from "$kit/icons.js";

  let {
    target = "Save",
    value = "",
  }: { target?: string; value?: string } = $props();

  let box = $state<HTMLDivElement>();
  // The field is focused as the composer opens (comment-design §3).
  $effect(() => {
    box?.querySelector("textarea")?.focus({ preventScroll: true });
  });
</script>

<div bind:this={box} class="flex flex-col gap-space-2" data-composer>
  <button
    class={[chipVariants({ variant: "setting" }), "self-start"]}
    type="button"
    ><IconLayers /><span data-slot="chip-label">{target}</span><IconChevronDown
      data-slot="chevron"
    /></button
  >
  <Textarea placeholder="What should change here?" rows={2} {value} />
  <div class="flex justify-end gap-space-2" data-sweep="row">
    <Button size="sm" variant="ghost">Cancel</Button>
    <Button disabled={value.trim() === ""} size="sm">Comment</Button>
  </div>
</div>
