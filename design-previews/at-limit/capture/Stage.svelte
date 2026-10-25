<!--
  The capture stage (capture.ts): every surface a session at its limit
  stands on, drawn by its real component among its real neighbours, with
  the stores seeded from the hub's records for this pass (seed.js). The
  same stage runs on today's tree (main) and the design's, so the two are
  drawn by their own components from the same records. Nothing here is
  shown to anyone; capture.ts reads each `data-part` and writes it into
  parts.js.
-->
<script>
  import * as switching from "../../../apps/dashboard/src/lib/cawco/accounts/switch.svelte.ts";
  import SessionRow from "../../../apps/dashboard/src/lib/cawco/SessionRow.svelte";
  import AccountMoveDivider from "../../../apps/dashboard/src/lib/cawco/transcript/AccountMoveDivider.svelte";
  import DelegateTray from "../../../apps/dashboard/src/lib/cawco/transcript/DelegateTray.svelte";
  import PaneTabs from "../../../apps/dashboard/src/lib/cawco/workspace/PaneTabs.svelte";
  import { TooltipProvider } from "../../../apps/dashboard/src/lib/components/ui/tooltip/index.ts";
  import { provideHangLayer } from "../../../apps/dashboard/src/lib/components/ui/hang-card/hang-layer.ts";
  import { formatAgeShort } from "../../../apps/dashboard/src/lib/utils/time.ts";

  let { pass, designed, held, message, records } = $props();

  /** The tab strip's session card hangs in the stage's own layer, as the Shell gives one. */
  const layer = provideHangLayer("stage");

  /** The project these sessions work in, as the fleet names it. */
  const PROJECT = "Cawco-Dev";
  const at = records.at;
  const neighbours = records.neighbours;
  /** The held session among the four that were busy just before it, newest first. */
  const home = [...neighbours.slice(0, 2), records.stalled, ...neighbours.slice(2, 4)];
  const row = {
    kind: "account",
    key: `account:${message.id}`,
    messages: [message],
    brief: null,
  };
  /** Its second, pressed-open twin keeps its own disclosure: another session's key. */
  const pressed = {
    ...row,
    key: `${row.key}:pressed`,
  };
  /** Today's stop sentence (switch.svelte.ts `stopWords`), on today's tree. */
  const stop = designed ? undefined : switching.stopWords?.(held);
  const ageOf = (one) => formatAgeShort(Date.parse(one.updatedAt), at);
  const href = (one) => `/s/${one.id}`;
  /** The line is live only while the session waits (Transcript's `waitsHere`). */
  const lineProps = designed
    ? { waiting: held.stalled ? held : undefined }
    : { stop };
  const leaf = {
    t: "l",
    id: "stage",
    tabs: [neighbours[0].id, records.stalled.id, neighbours[1].id, neighbours[2].id],
    active: records.stalled.id,
  };
</script>

<div
  class="@container/shell hang-layer-screen fixed inset-x-0 top-0"
  data-hang-layer={layer.id}
></div>
<TooltipProvider>
<main style="display: grid; gap: 24px; padding: 24px; inline-size: 1440px">
  <div data-part="{pass}:tabs" style="inline-size: 1037px">
    <PaneTabs {leaf} />
  </div>
  <div data-part="{pass}:home" style="inline-size: 560px">
    <ul class="m-0 flex list-none flex-col gap-(--tree-gap) p-0">
      {#each home as one (one.id)}
        {@const row = one.id === held.id ? held : one}
        <li>
          <SessionRow
            href={href(one)}
            instance={row}
            line={PROJECT}
            machineId={one.machineId}
            title={one.title}
            trail={ageOf(one)}
          />
        </li>
      {/each}
    </ul>
  </div>
  <div data-part="{pass}:rail" style="inline-size: 280px">
    <ul class="m-0 flex list-none flex-col gap-(--tree-gap) p-0">
      <li>
        <SessionRow
          compact
          fold={{ count: home.length, open: true, ontoggle: () => undefined }}
          href={href(records.parent)}
          instance={records.parent}
          machineId={records.parent.machineId}
          peek={false}
          title={records.parent.title}
          trail={ageOf(records.parent)}
        />
        <ul class="kit-nest flex min-w-0 list-none flex-col gap-(--tree-gap) pt-(--tree-gap) pl-(--nest-pad)" data-nest>
          {#each home as one (one.id)}
            {@const row = one.id === held.id ? held : one}
            <li>
              <SessionRow
                compact
                href={href(one)}
                instance={row}
                machineId={one.machineId}
                peek={false}
                title={one.title}
                trail={ageOf(one)}
              />
            </li>
          {/each}
        </ul>
      </li>
    </ul>
  </div>
  <!-- The transcript's columns, as its list lays its rows on them: what a
       pressed line unfolds stands at the text column. -->
  <div data-part="{pass}:line" style="inline-size: 720px">
    <div class="tx-columns"><AccountMoveDivider {row} {...lineProps} /></div>
  </div>
  <div data-part="{pass}:pressed" data-press style="inline-size: 720px">
    <div class="tx-columns">
      <AccountMoveDivider row={pressed} {...lineProps} />
    </div>
  </div>
  <div data-part="{pass}:tray" style="inline-size: 720px; padding-block-start: 48px">
    <DelegateTray parentId={records.parent.id} />
  </div>
</main>
</TooltipProvider>
