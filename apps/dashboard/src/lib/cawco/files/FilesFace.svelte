<script lang="ts">
  /**
   * Files as a face of the bar glass's one card (GlassCard): it hangs from
   * the glass as Caw's panel, the machines and Jump do, one shape with it,
   * floating over the page and never moving the conversation (owner: "it
   * should be a floating panel … dont allow it to disable page control").
   * Choosing an artifact shows it in the session's own panel, beside the
   * conversation, and Files goes (owner: "if i open an artifact from the
   * folder tab, it doesn't dismiss the panel"): the panel is the one place
   * it opens, and it stays until the person closes it; chosen from the
   * keyboard, the focus goes on to the panel's name. Show in conversation
   * takes the transcript to the message and puts Files away.
   */
  import FilesHere from "./FilesHere.svelte";

  let { onclose }: { onclose: () => void } = $props();
</script>

<div class="flex min-h-0 flex-auto flex-col" data-files-panel>
  <FilesHere close={onclose} />
</div>
