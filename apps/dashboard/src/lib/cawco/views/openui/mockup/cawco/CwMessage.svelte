<script lang="ts">
  /** Message for a mockup: the transcript's own MessageRow over a made-up message; inert. */
  import MessageRow from "#lib/cawco/transcript/MessageRow.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let {
    props,
    statementId,
  }: OpenUIRenderProps<{ from: string; text: unknown; agent?: unknown }> =
    $props();
  const message = $derived<Message>({
    id: `mockup:${statementId ?? textOf(props.text).slice(0, 40)}`,
    instanceId: "mockup",
    type: props.from === "you" ? "user" : "assistant",
    content: textOf(props.text),
  });
</script>

<div class="message" data-from={props.from} data-mk="Message" inert>
  <MessageRow agentName={textOf(props.agent) || "Claude"} {message} />
</div>

<style>
  .message {
    min-inline-size: 0;
  }
</style>
