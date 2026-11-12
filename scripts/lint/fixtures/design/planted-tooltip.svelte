<!--
  Planted mistakes for house/tooltip-provider-at-root (scripts/lint/fixtures/
  expected.txt): a component that is no tree's root supplying its own tooltip
  provider, by the namespace and by a name of its own; planted-tooltip-mount.ts
  mounts it as a tree whose root is off the list. bits-ui's provider stands
  for the kit's: a fixture the scripts' type check reads resolves no `#lib`.
-->
<script lang="ts">
  import { Tooltip } from "bits-ui";

  const TooltipProvider = Tooltip.Provider;
</script>

<Tooltip.Provider>
  <p>Stray</p>
</Tooltip.Provider>
<TooltipProvider>
  <p>Stray</p>
</TooltipProvider>
