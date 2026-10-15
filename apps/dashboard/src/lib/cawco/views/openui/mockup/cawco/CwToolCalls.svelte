<script lang="ts">
  /**
   * ToolCalls for a mockup: the transcript's own ToolGroup over made-up
   * calls, each a settled `tool.use` with its input under the field its
   * tool names it by (a command, a path, a pattern); inert.
   */
  import ToolGroup from "#lib/cawco/transcript/ToolGroup.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  interface Call {
    failed?: boolean;
    input?: unknown;
    result?: unknown;
    tool?: unknown;
  }

  let { props, statementId }: OpenUIRenderProps<{ calls: Call[] }> = $props();

  /** The field a tool's input goes by, as the harness writes it. */
  const FIELD: Record<string, string> = {
    bash: "command",
    read: "file_path",
    edit: "file_path",
    write: "file_path",
    grep: "pattern",
    glob: "pattern",
  };
  const messages = $derived<Message[]>(
    (Array.isArray(props.calls) ? props.calls : []).map((call, index) => {
      const tool = textOf(call.tool) || "Tool";
      const id = `mockup:${statementId ?? "calls"}:${index}`;
      return {
        id,
        instanceId: "mockup",
        type: "tool.use",
        content: "",
        toolCallId: id,
        metadata: {
          toolName: tool,
          toolInput: {
            [FIELD[tool.toLowerCase()] ?? "input"]: textOf(call.input),
          },
          toolResult: textOf(call.result),
          toolStatus: call.failed ? "error" : "success",
        },
      };
    })
  );
</script>

<div class="calls" data-mk="ToolCalls" inert>
  <ToolGroup {messages} />
</div>

<style>
  .calls {
    min-inline-size: 0;
  }
</style>
