<script lang="ts">
  /** Button, drawn as CawCo's: the kit's Button in the variant the mockup names; inert. */
  import {
    Button,
    type ButtonVariant,
  } from "#lib/components/ui/button/index.js";
  import type { OpenUIRenderProps } from "../../OpenUiRenderer.svelte";
  import { textOf } from "../context";

  let {
    props,
  }: OpenUIRenderProps<{ label: unknown; variant?: string; size?: string }> =
    $props();
  const VARIANT: Record<string, ButtonVariant> = {
    primary: "default",
    secondary: "secondary",
    quiet: "ghost",
    danger: "destructive",
  };
</script>

<div class="button" data-mk="Button" inert>
  <Button
    size={props.size === "small" ? "sm" : "default"}
    variant={VARIANT[props.variant ?? "secondary"] ?? "secondary"}
    >{textOf(props.label)}</Button
  >
</div>

<style>
  .button {
    display: inline-flex;
    align-self: flex-start;
  }
</style>
