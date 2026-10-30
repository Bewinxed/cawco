<!--
  Planted class joins for house/no-class-join, each where the rule must report
  it (scripts/lint/fixtures/expected.txt), and the shapes it must leave alone.
-->
<script lang="ts">
  import { cn } from "#lib/utils.js";

  let {
    class: className = "",
    barClass = "",
    open = false,
    ...rest
  }: {
    class?: string;
    barClass?: string;
    open?: boolean;
    [key: string]: unknown;
  } = $props();

  const steady = "flex";
  const joined = $derived(`flex ${className}`);
  const merged = $derived(cn("flex", className));
  const glued = steady + className;
</script>

<div class="flex {className}"></div>
<div class={`flex ${className}`}></div>
<div class="flex {open ? className : ''}"></div>
<div class="flex {cn('grid', className)}"></div>
<div class="flex {barClass}"></div>
<div class="flex {rest.class}"></div>
<div class={joined}></div>
<div class={glued}></div>

<div class={className}></div>
<div class={cn("flex", className)}></div>
<div class={merged}></div>
<div class="flex {steady}"></div>
<div class={`grid ${steady}`}></div>
{#each [className] as className (className)}
  <div class="flex {className}"></div>
{/each}
