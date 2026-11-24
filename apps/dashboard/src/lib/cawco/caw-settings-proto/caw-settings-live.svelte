<script lang="ts">
  import type { TriggerKind } from "@cawco/core/triggers";
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  /**
   * Caw's settings to use (CawSettings.stories `Live`): the project head's
   * More in its glass (BarGlass, BarItem), and his settings open from it as
   * the head opens them, a popover on a desk and the drawer's sheet under
   * the phone line, both drawn in place (their portals off) so the frame
   * holds them. The page's Caw and the hub behind him are a stand-in
   * (caw-stand-in): the switch, a scene, a pick of his chat's or a kind's
   * waits and is answered as the `answer` dial says, and turning him off
   * with `running` on asks through the Caw-off confirm hung from the switch's glass, answered at
   * the hub's route. That card, and every other layer the kit portals,
   * opens inside the frame (bits-ui's `defaultPortalTo`), so the frame and
   * its moves hold them. `hub` away sinks every control. `again` starts over.
   */
  import { commonWords } from "@cawco/core/words/common";
  import { BitsConfig } from "bits-ui";
  import { MediaQuery } from "svelte/reactivity";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import { IconMoreLinear } from "#lib/icons.js";
  import CawSettings from "./CawSettings.svelte";
  import type { TriggerLayer } from "./caw-settings";
  import { INSTALLED, MACHINE } from "./caw-settings-seed";
  import { type HubAnswer, StandInCaw } from "./caw-stand-in.svelte";

  let {
    projectId,
    projectName = "cockpit",
    on = true,
    answer = "accepts",
    running = true,
    hub = "connected",
    overridden = false,
    asked = null,
    hubWait = 900,
    again = 0,
    height = 900,
  }: {
    /** The project, one per story: its Caw-off job is kept by it (each frame's its own, `project`). */
    projectId: string;
    projectName?: string;
    /** He is awake as the panel opens. */
    on?: boolean;
    /** What the hub does with a change. */
    answer?: HubAnswer;
    /** What his chat started still runs as he is turned off. */
    running?: boolean;
    /** Whether the hub answers at all. */
    hub?: "connected" | "away";
    /** Routine results run on their own harness and model. */
    overridden?: boolean;
    /**
     * The person has just flipped him, as the frame opens: off asks
     * through the Caw-off confirm while what he started runs, on wakes him;
     * either waits on the hub's answer.
     */
    asked?: "on" | "off" | null;
    /** How long the hub takes to answer, ms. */
    hubWait?: number;
    /** Start over: each press makes the hub again. */
    again?: number;
    /** The frame's least height, px: room for the panel under More. */
    height?: number;
  } = $props();

  const OVERRIDE: Partial<Record<TriggerKind, TriggerLayer>> = {
    "routine-results": {
      account: null,
      harness: "codex",
      model: "gpt-5.5-codex-mini",
      mode: null,
    },
  };

  /**
   * The project as this frame keeps it: the stage draws a story in many
   * frames on one page (each interaction, each move), and a Caw-off job is
   * kept per project, so frames sharing one pressed, flew and closed each
   * other's.
   */
  const frame = $props.id();
  const project = $derived(`${projectId}-${frame}`);

  // A press of the dial's action starts the hub over.
  const caw = $derived.by(
    () =>
      new StandInCaw({
        round: again,
        projectId: project,
        on,
        answer: () => answer,
        running: () => running,
        waitMs: hubWait,
        own: overridden ? OVERRIDE : {},
      })
  );
  $effect(() => caw.stand());
  // The flip the frame opens on, as the person just made it.
  $effect(() => caw.opensOn(asked, projectName));

  const phone = new MediaQuery(PHONE_QUERY);
  let open = $state(true);
  let more = $state<HTMLElement | null>(null);
  let layer = $state<HTMLElement | null>(null);
</script>

{#snippet panel(sheet: boolean)}
  <CawSettings
    chat={caw.chat}
    hubAway={hub === "away"}
    installed={INSTALLED}
    lead={caw}
    machine={MACHINE}
    onchat={(patch) => caw.setChat(patch)}
    onproposes={(next) => caw.setProposes(next)}
    onkind={(kind, patch) => caw.setKind(kind, patch)}
    projectId={project}
    {projectName}
    proposesDecides={caw.proposesDecides}
    refusedChat={caw.refusedChat}
    refusedProposes={caw.refusedProposes}
    refusedKind={caw.refusedKind}
    {sheet}
    triggers={caw.triggers}
  />
{/snippet}

<div
  class="relative flex min-h-(--frame-h) flex-col items-end bg-surface-page p-space-4 contain-layout"
  style:--frame-h={`${height}px`}
  bind:this={layer}
>
  <BitsConfig defaultPortalTo={layer ?? undefined}>
    <BarGlass form="group">
      <BarItem
        icon={IconMoreLinear}
        label={commonWords.moreFor(projectName)}
        onclick={() => {
          open = !open;
        }}
        bind:ref={more}
      />
    </BarGlass>
    {#if phone.current}
      {#if layer}
        <Drawer.Root
          container={layer}
          dismissible={false}
          modal={false}
          bind:open
          shouldScaleBackground={false}
        >
          <Drawer.Content
            contained
            modal={false}
            onOpenAutoFocus={(event: Event) => event.preventDefault()}
            portalProps={{ disabled: true }}
            title={words.panel(projectName)}
            trapFocus={false}
          >
            {@render panel(true)}
          </Drawer.Content>
        </Drawer.Root>
      {/if}
    {:else}
      <Popover.Root bind:open>
        <Popover.Content
          align="end"
          aria-label={words.panel(projectName)}
          collisionPadding={12}
          customAnchor={more}
          onOpenAutoFocus={(event) => event.preventDefault()}
          height="available"
          overflow="scroll"
          pad="none"
          portalProps={{ disabled: true }}
          side="bottom"
          sideOffset={4}
          style="--pop-w: max-content"
          trapFocus={false}
          width="room"
        >
          {@render panel(false)}
        </Popover.Content>
      </Popover.Root>
    {/if}
  </BitsConfig>
</div>
