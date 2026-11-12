<!--
  An HTML page's dials, drawn in a shadow root of their own (dials.ts): the
  element that stands where the dashboard's document root stands (core
  dials-root.ts), on which the host's dials sheet stands every rule the
  house writes on `:root`, named the page's scheme and dark while it draws
  dark as the dashboard's root is (`data-theme`, the `dark` class), with the
  type and ink the dashboard's body carries; in it each panel the page's script
  called for, in the page's own dock, else in a column at the page's
  bottom-right; and the layer the kit's selects, menus and tips open in,
  inside the same root, so none of them lands on the page.
-->
<script lang="ts" module>
  import type { DialValues } from "../../graph/dials";

  /** A panel the page's script called for: its name, its config, and what hears each turn's values. */
  export interface Panel {
    config: Record<string, unknown>;
    name: string;
    onvalues: (values: DialValues) => void;
  }

  /** The page's panels, in the order its script called for them. */
  class Shown {
    list = $state.raw<Panel[]>([]);
  }
  export const shown = new Shown();
</script>

<script lang="ts">
  import { DIALS_ROOT } from "@cawco/core/dials-root";
  import { BitsConfig } from "bits-ui";
  import { TooltipProvider } from "#lib/components/ui/tooltip/index.js";
  import Dials from "./Dials.svelte";
  import { scheme } from "./scheme.svelte.js";

  let {
    docked,
  }: {
    /** The page has a dock of its own (`[data-cawco-dials]`): the panels stand in its flow. */
    docked: boolean;
  } = $props();

  let layer = $state<HTMLElement>();
</script>

<!-- This mount's one tooltip provider, at its root: a dial's segments and
     reset draw tips. -->
<TooltipProvider>
  <div
    {...{ [DIALS_ROOT]: "" }}
    data-theme={scheme.now}
    class={[
      "type-body text-ink-strong antialiased",
      scheme.now === "dark" && "dark",
    ]}
  >
    <BitsConfig defaultPortalTo={layer}>
      <!-- Undocked, a box over the page inset by --spacing-space-4 that takes no
           pointer, the column at its bottom-right: the room's width at most,
           scrolling inside the box past the window's height. -->
      <div
        class={[
          !docked &&
            "pointer-events-none fixed inset-space-4 flex flex-col items-end justify-end",
        ]}
      >
        <div
          class={[
            "flex flex-col gap-space-3",
            !docked &&
              "pointer-events-auto max-h-full w-c-graph-room-w max-w-full min-h-0 overflow-y-auto",
          ]}
          data-slot="dials-column"
        >
          {#each shown.list as panel (panel)}
            <Dials
              onvalues={panel.onvalues}
              props={{ name: panel.name, config: panel.config }}
            />
          {/each}
        </div>
      </div>
    </BitsConfig>
    <div bind:this={layer} data-slot="dials-layer"></div>
  </div>
</TooltipProvider>
