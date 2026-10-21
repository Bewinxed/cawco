<!--
  The composer (comment-design §3, attachments-design §2): the target chip
  (the element's glyph and name; it opens the element's chain, ending in
  Whole page), the field ("What should change here?", two rows, growing to
  six), the line that blocks Comment while it's true (`blocked`), the
  draft's attachments as the dashboard's own chip row (AttachmentChips),
  then Attach (the dashboard's AttachButton) at the start and Cancel and
  Comment at the end. Comment is off until there is something to send:
  words, or (`attachmentsAlone`, pick 6's B) attachments alone. Nothing is
  written until Comment; Cancel, Esc or a press outside closes it and the
  hollow pin goes.
-->
<script lang="ts">
  import AttachButton from "$kit/cawco/transcript/AttachButton.svelte";
  import AttachmentChips from "$kit/cawco/transcript/AttachmentChips.svelte";
  import { ComposerDraft } from "$kit/cawco/transcript/composer-draft.svelte";
  import { Button } from "$kit/components/ui/button/index.js";
  import { chipVariants } from "$kit/components/ui/chip/index.js";
  import { Textarea } from "$kit/components/ui/textarea/index.js";
  import { IconChevronDown, IconLayers } from "$kit/icons.js";

  let {
    target = "Create routine",
    value = "",
    draft = new ComposerDraft(),
    blocked = null,
    attachmentsAlone = true,
    focus = true,
  }: {
    target?: string;
    value?: string;
    draft?: ComposerDraft;
    /** The sentence that blocks Comment (attachments-design §3), under the field. */
    blocked?: string | null;
    /** A comment may be attachments with no words (pick 6's B). */
    attachmentsAlone?: boolean;
    /** Its field takes the focus as it opens (comment-design §3); off where several stand side by side for comparison. */
    focus?: boolean;
  } = $props();

  const attached = $derived(draft.images.length + draft.texts.length + draft.files.length > 0);
  const sendable = $derived(value.trim() !== "" || (attachmentsAlone && attached));

  let box = $state<HTMLDivElement>();
  // The field is focused as the composer opens (comment-design §3).
  $effect(() => {
    if (focus) {
      box?.querySelector("textarea")?.focus({ preventScroll: true });
    }
  });
</script>

<div bind:this={box} class="flex flex-col gap-space-2" data-composer>
  <button
    class={[chipVariants({ variant: "setting" }), "self-start max-w-full"]}
    type="button"
    ><IconLayers /><span data-slot="chip-label">{target}</span><IconChevronDown
      data-slot="chevron"
    /></button
  >
  <Textarea placeholder="What should change here?" rows={2} {value} />
  {#if blocked}
    <p class="type-meta text-data-bad text-pretty" data-blocked>{blocked}</p>
  {/if}
  <AttachmentChips {draft} />
  <div class="flex items-center gap-space-2" data-sweep="row">
    <AttachButton {draft} />
    <span class="flex-1"></span>
    <Button size="sm" variant="ghost">Cancel</Button>
    <Button disabled={!sendable || blocked !== null} size="sm">Comment</Button>
  </div>
</div>
