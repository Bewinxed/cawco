<script lang="ts">
  /**
   * The kit's Alert in a frame of its own (its states file's): its glyph,
   * its title, its line and, where it offers one, the kit Button as its
   * action, as the fleet's faults and a form's notices compose it.
   */
  import type { Component } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import Alert from "./alert.svelte";
  import AlertAction from "./alert-action.svelte";
  import AlertDescription from "./alert-description.svelte";
  import AlertTitle from "./alert-title.svelte";

  let {
    variant,
    surface,
    layout,
    icon: Icon,
    title,
    line,
    action,
  }: {
    /** Its tint: what the notice says about the work. */
    variant?: "default" | "destructive" | "warning" | "success" | "info";
    /** Standing on a card. */
    surface?: "card";
    /** One line beside its action. */
    layout?: "row";
    /** The glyph before its words. */
    icon?: Component;
    /** Its title. */
    title: string;
    /** What it says under the title. */
    line?: string;
    /** Its action's words. */
    action?: string;
  } = $props();
</script>

<div class="w-field-group max-w-full">
  <Alert {layout} {surface} {variant}>
    {#if Icon}
      <Icon />
    {/if}
    <AlertTitle>{title}</AlertTitle>
    {#if line}
      <AlertDescription>{line}</AlertDescription>
    {/if}
    {#if action}
      <AlertAction>
        <Button size="sm" variant="outline">{action}</Button>
      </AlertAction>
    {/if}
  </Alert>
</div>
