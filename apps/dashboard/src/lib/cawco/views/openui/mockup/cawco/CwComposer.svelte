<script lang="ts">
  /**
   * Composer for a mockup: the app's own Composer over a draft of its own,
   * holding the mockup's text, sending nowhere; inert.
   */
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let {
    props,
  }: OpenUIRenderProps<{
    text?: unknown;
    placeholder?: unknown;
    agent?: unknown;
    busy?: boolean;
  }> = $props();
  const draft = new ComposerDraft();
  $effect(() => {
    draft.text = textOf(props.text);
  });
  const nothing = (): void => undefined;
</script>

<div class="composer" data-mk="Composer" inert>
  <Composer
    agentName={textOf(props.agent) || "Claude"}
    busy={props.busy ?? false}
    {draft}
    onstop={nothing}
    onsubmit={nothing}
    placeholder={textOf(props.placeholder) || undefined}
  />
</div>

<style>
  /* The pane's foot the composer's dock fills (it is `position: absolute;
     inset: 0`): room for its panel, the tray row over it and its margins. */
  .composer {
    position: relative;
    min-inline-size: 0;
    min-block-size: calc(
      var(--c-composer-panel) + var(--c-tray-row) + var(--c-suggest-room) +
        var(--space-8)
    );
  }
</style>
