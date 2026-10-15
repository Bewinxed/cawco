<script lang="ts">
  /** Switch, drawn as CawCo's: the kit's Switch and Label, on or off; inert. */
  import { Label } from "#lib/components/ui/label/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let { props }: OpenUIRenderProps<{ label: unknown; on?: boolean }> = $props();
</script>

<div class="switch" data-mk="Switch" data-on={props.on ? "" : undefined} inert>
  <Switch checked={props.on ?? false} />
  <Label>{textOf(props.label)}</Label>
</div>

<style>
  .switch {
    display: inline-flex;
    align-items: center;
    align-self: flex-start;
    gap: var(--space-2);
  }
</style>
