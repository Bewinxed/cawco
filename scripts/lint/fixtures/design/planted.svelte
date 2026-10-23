<!--
  Planted mistakes, one or more per design rule, each where the rule must
  report it (scripts/lint/fixtures/expected.txt), and beside each the
  shape the rule must leave alone. Golar lints this file with the dashboard's
  (golar.config.ts); scripts/lint/golar-lint.ts holds the report to the list.
-->
<script lang="ts">
  import { Button } from "#lib/components/ui/button";

  let { width = 0 } = $props();
  let picked = $state("");
  const steady = "mt-space-2";

  const wait = (node: HTMLElement): number =>
    Number.parseFloat(getComputedStyle(node).getPropertyValue("--dur-settle"));
</script>

<div class="rounded-huge nodrag nopan rounded-md"></div>
<div class="p-[13px] transition-[opacity]"></div>
<div class:rounded-huge-too={picked !== ""}></div>
<Button class="p-space-4 {steady}">Restyled</Button>
<Button class={picked}>Unreadable</Button>
<div style="color: var(--ink); --tint: var(--mark-1)"></div>
<div style:--tint="#ff0000"></div>
<div bind:clientWidth={width}></div>
<div class="hover:opacity-50 focus-visible:opacity-75"></div>
<div class="group-not-data-ready:opacity-50"></div>
<div class="group">
  <span class="group-not-data-ready:opacity-50"></span>
</div>
<span>{wait}</span>
<svg aria-hidden="true" viewBox="0 0 1 1"
  ><path fill="#ec4899" stroke="currentColor" d="M0 0" /></svg
>
