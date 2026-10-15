<script lang="ts">
  /**
   * SessionRow for a mockup: the app's own SessionRow over a made-up
   * session, its status given (`mark`) rather than read from the fleet, and
   * inert: no menu, drag, peek or link reaches anything.
   */
  import type { InstanceRow } from "@cawco/core";
  import SessionRow from "#lib/cawco/SessionRow.svelte";
  import type { MarkStatus } from "#lib/cawco/TreeMark.svelte";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let {
    props,
  }: OpenUIRenderProps<{
    title: unknown;
    state: string;
    line?: unknown;
    age?: unknown;
    compact?: boolean;
    active?: boolean;
  }> = $props();

  const MARK: Record<string, MarkStatus> = {
    working: "live",
    "needs-you": "attn",
    idle: "idle",
    done: "done",
    failed: "fail",
  };
  const title = $derived(textOf(props.title));
  const instance = $derived<InstanceRow>({
    id: `mockup:${title}`,
    cwd: `/mockup/${title}`,
    launchDir: "known",
    machineId: "mockup",
    sessionId: null,
    status: "running",
    title,
  });
</script>

<div class="row" data-mk="SessionRow" inert>
  <SessionRow
    active={props.active ?? false}
    compact={props.compact ?? false}
    done={props.state === "done"}
    href="#mockup"
    {instance}
    line={textOf(props.line)}
    machineId="mockup"
    mark={MARK[props.state] ?? "idle"}
    peek={false}
    {title}
    trail={textOf(props.age)}
  />
</div>

<style>
  .row {
    min-inline-size: 0;
  }
</style>
