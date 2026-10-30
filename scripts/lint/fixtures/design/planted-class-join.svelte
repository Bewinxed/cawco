<!--
  Planted class joins for house/no-class-join, each where the rule must report
  it (scripts/lint/fixtures/expected.txt), and the shapes it must leave alone.
-->
<script lang="ts">
  import { Collapsible } from "bits-ui";
  import { Button } from "#lib/components/ui/button";
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
  const held = $derived(["flex", className]);
  const aliased = $derived(className ?? "");
  const remerged = $derived(cn("grid", className));
  const clsx = (...parts: unknown[]): string => parts.join(" ");
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

<div class={["flex", className]}></div>
<div class={["flex", open && [barClass]]}></div>
<svg aria-hidden="true" class={["flex", open ? className : ""]}></svg>
<div class={["flex", cn("grid", className)]}></div>

<Button class={["mt-space-2", className]}>Its own to merge</Button>
<div class={cn(["flex", className])}></div>
<div class={["flex", steady]}></div>
<div class={cn(className, "flex")}></div>
<div class={cn(["flex", className, "grid"])}></div>
<div class={`flex ${cn("grid", className)}`}></div>
<div class={held}></div>
<div class="flex {aliased}"></div>
<div class="flex {remerged}"></div>
<Collapsible.Root class={["flex", className]} />
<div class={clsx("flex", className)}></div>

<div class={aliased}></div>
<div class={remerged}></div>
<div class={cn("flex", open && className)}></div>
