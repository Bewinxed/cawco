<script lang="ts">
  /**
   * A native app in the artifact panel. `stream`: the running app as a
   * live stream in the well, letterboxed whole, with the app's view tree
   * over it as boxes (NodeTree) and a band naming the device, that it is
   * live, and the machine it runs on (the Browser view's address band);
   * the picked node in the inspector. `mirror`: HTML the agent wrote to
   * look like the app, framed as any page is, the band saying so; the
   * picked element in the inspector with the native view it stands for.
   *
   * The app's pixels here are a stand-in (AppStandIn), captioned so.
   */
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Toggle } from "#lib/components/ui/toggle/index.js";
  import {
    IconChevronDown,
    IconFileCode,
    IconLayers,
    IconPhone,
    IconToolCode,
  } from "#lib/icons.js";
  import AppStandIn, { screenShape } from "./AppStandIn.svelte";
  import { DEVICE, type NativeNode, PICKED, PIN } from "./fixture";
  import NativeSurface from "./NativeSurface.svelte";
  import NodeInspector from "./NodeInspector.svelte";
  import NodeTree from "./NodeTree.svelte";

  let {
    kind,
    still = false,
    wire = $bindable(false),
    same = null,
    hover = null,
  }: {
    /** A node held under the pointer, by its label: a story's pointer. */
    hover?: string | null;
    /** Words on the picked box naming it the node another picture picks too. */
    same?: string | null;
    /** The live app with its tree over it, or the agent's HTML mirror of it. */
    kind: "stream" | "mirror";
    /** The band stands Still (a frame sent to the canvas) and Wire: the tree shared with the canvas. */
    still?: boolean;
    /** Every box of the tree drawn, the picture dimmed. */
    wire?: boolean;
  } = $props();

  let screen = $state<HTMLElement>();
  let picked = $state(true);
  const shape = screenShape(false);

  /** What the mirror's picked element is: an HTML element standing for the native view. */
  const MIRRORED: NativeNode = {
    ...PICKED,
    kind: "button · NeedsYouChip.svelte",
    at: "mirror/ProjectPage.svelte:41",
  };
</script>

<NativeSurface subtitle="Pin what reads wrong" title="CawCo iOS">
  <div
    class="@container/pane absolute inset-0 flex flex-col"
    data-slot="native-pane"
    data-native={kind}
  >
    <!-- The band: the device and where it runs, or what the mirror is. -->
    <div
      class="flex flex-none flex-wrap items-center gap-x-space-2 gap-y-space-1 min-w-0 px-space-3 py-space-2 border-b border-border-hairline bg-surface-raised type-meta"
      data-slot="native-band"
    >
      {#if kind === "stream"}
        <span
          class="mark-line flex flex-1 flex-wrap items-center gap-x-space-1 min-w-0 text-ink-strong"
        >
          <span class="mark-cell flex-none text-ink-muted"><IconPhone /></span>
          <span class="min-w-0">{DEVICE.model} · {DEVICE.os}</span>
          <span
            class="mark-line inline-flex items-center gap-space-1 text-status-live-ink"
            data-box
          >
            <LiveDot size="row" /><span>Live</span>
          </span>
          <span class="min-w-0 text-ink-muted wrap-anywhere"
            >on {DEVICE.machine}</span
          >
        </span>
        {#if still}
          <span class="flex flex-none items-center gap-space-1">
            <Button
              size="sm"
              title="Send this frame to the canvas as a still"
              variant="ghost"><span>Still</span><IconChevronDown /></Button
            >
            <Toggle
              aria-label="Wire"
              bind:pressed={wire}
              size="sm"
              title="Wire: draw every box of the app's tree"
            >
              <IconLayers /><span>Wire</span>
            </Toggle>
          </span>
        {/if}
      {:else}
        <span
          class="mark-line flex flex-1 items-center gap-space-1 min-w-0 text-ink-strong"
        >
          <span class="mark-cell flex-none text-ink-muted"
            ><IconFileCode /></span
          >
          <span
            class="min-w-0 overflow-x-clip text-ellipsis whitespace-nowrap type-code liga-none"
            >mirror/ProjectPage.svelte</span
          >
        </span>
        <!-- What this option rests on: the kit's ink-strong chip, not its muted one. -->
        <Badge class="flex-none" data-slot="agent-written"
          ><IconToolCode /><span>Agent-written</span></Badge
        >
      {/if}
    </div>
    <div class="relative flex min-h-0 flex-1 @max-phone/pane:flex-col">
      <!-- The well: the screen letterboxed whole, its caption under it. -->
      <div
        class="flex min-h-0 min-w-0 flex-1 flex-col gap-space-2 bg-surface-recess px-space-4 pt-space-5 pb-space-3"
        data-slot="native-well"
      >
        <div
          class="@container-size relative grid min-h-0 flex-1 place-items-center"
        >
          <div
            class="relative aspect-(--shape) w-(--fit)"
            style:--fit={`min(100cqi, 100cqb * ${shape})`}
            style:--shape={shape}
          >
            <div
              class="size-full overflow-hidden rounded-lg border border-border-well shadow-tile transition-opacity duration-(--dur-control) ease-out data-wire:opacity-40"
              data-wire={wire || undefined}
            >
              <AppStandIn bind:root={screen} />
            </div>
            <NodeTree
              bind:picked
              {hover}
              pin={PIN.number}
              root={screen}
              {wire}
            />
          </div>
        </div>
        <p
          class="m-0 flex-none text-center text-ink-muted type-meta text-pretty"
          data-slot="native-caption"
        >
          {kind === "stream"
            ? "Stand-in for the app's screen"
            : "The agent's HTML, written to look like the app"}
        </p>
      </div>
      {#if picked}
        <NodeInspector
          node={kind === "stream" ? PICKED : MIRRORED}
          note={kind === "mirror"
            ? `Written to look like ${PICKED.kind} “${PICKED.label}” at ${PICKED.at}; not read from it.`
            : null}
          {same}
          onclose={() => {
            picked = false;
          }}
          pin={PIN}
        />
      {/if}
    </div>
  </div>
</NativeSurface>
