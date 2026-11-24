<script lang="ts">
  import { cawOffWords } from "@cawco/core/words/caw-off";
  /**
   * The head of Caw's settings: a hero picture of Caw awake or asleep,
   * edge to edge across the panel's top, its top corners the panel's, and
   * his one switch on it. The switch (CawLeadSwitch, the head's and the
   * details tray's own) stands at the hero's top-right corner in a capsule
   * of the bar's Liquid Glass (BarGlass, a head's floating group), which
   * keeps its label readable over the day scene and the night one. The
   * picture's foot fades through a short gradient into the panel's surface
   * (`surface-raised`). What being asleep means is said where it is chosen,
   * in the confirm card, and in the switch's tooltip while he sleeps, so
   * nothing under the hero moves as he turns. Turning him off with sessions running asks in a card that
   * comes down out of the capsule, one shape with it (CawLeadSwitch's
   * `hang`, BarCard), and goes back up into it; what the switch says after
   * it (the stops parked there once put away, a refusal) stands under the
   * hero.
   *
   * Flipping him crossfades the hero between the awake and the asleep
   * scene once the hub says he turned: both stand in
   * one cell, so nothing around them moves, and only their opacity changes,
   * over the house's fade on its ease-out. The scenes are one composition at
   * 16:10, day and night (Caw at work in his attic, then curled asleep
   * with the lamp out), the night an edit of the day so they cross in
   * register. The hero is a short 5:2 band of them, framed 62% down the
   * picture so Caw, the corkboard and the lamp fill it and Caw stands above
   * the fade. Served from static/caw at twice the desk panel's width.
   */
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  import CawLeadSwitch, {
    type SwitchedLead,
  } from "#lib/cawco/project/CawLeadSwitch.svelte";
  import { BarGlass } from "#lib/components/ui/bar-glass/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { stopWork } from "../stop-work.svelte";

  let {
    lead,
    projectId,
    projectName,
    sheet = false,
    disabled = false,
  }: {
    lead: SwitchedLead;
    projectId: string;
    projectName: string;
    /** In the touch sheet: the hero reaches past the sheet's 16px inset to its edges. */
    sheet?: boolean;
    /** No change can be asked now (the hub is away): the switch is sunk. */
    disabled?: boolean;
  } = $props();

  /**
   * Asleep only once the hub says so, and his off tray with it (stop-work
   * `awake`); awake while it is read.
   */
  const asleep = $derived(stopWork.awake(projectId, lead.on) === false);
  const SCENES = [
    { asleep: false, scene: "/caw/hero-awake.webp" },
    { asleep: true, scene: "/caw/hero-asleep.webp" },
  ] as const;
</script>

<section
  data-slot="caw-hero"
  class={[
    "relative isolate grid",
    sheet ? "-mx-4" : "overflow-clip rounded-inherit",
  ]}
>
  <!-- The scene, a short 5:2 band across the panel's width: the 16:10
       picture framed on Caw, the corkboard and the lamp, its window top and
       the desk's legs cropped away. -->
  <div
    aria-hidden="true"
    class="relative aspect-5/2 w-full overflow-clip bg-surface-recess"
    data-slot="scene"
  >
    {#each SCENES as one (one.scene)}
      <img
        alt=""
        class={[
          "absolute inset-0 size-full object-cover object-(--focus) transition-opacity duration-(--duration-fade) ease-out data-hidden:opacity-0",
        ]}
        data-hidden={one.asleep !== asleep || undefined}
        decoding="async"
        style:--focus="50% 62%"
        src={one.scene}
      />
    {/each}
    <!-- The scrim: the scene's lower part fades into the panel's surface,
         solid by its foot; the line stands below it, clear of the scene. -->
    <span
      class="absolute inset-x-0 bottom-0 h-1/4 bg-linear-to-b/srgb from-transparent to-surface-raised to-70%"
    ></span>
  </div>

  <!-- His switch, in a capsule of the bar's glass at the hero's
       top-right corner, over either scene. -->
  <div class="absolute end-space-3 top-space-3 z-1">
    <BarGlass form="group">
      <!-- The switch and its words on one line in the capsule: they never
           wrap, so the words never fall under the switch; positioned, so
           they stand over the glass's join while the confirm hangs. -->
      <!-- Asleep, its tooltip says what that means (the confirm card says
           it while he is being turned off). -->
      <Tip disabled={!asleep} label={cawOffWords.waits}>
        {#snippet children(tip)}
          <span
            {...tip}
            class="relative flex h-c-btn-h-sm items-center px-space-2"
          >
            <CawLeadSwitch
              {disabled}
              hang
              label={asleep ? words.switchOff : words.switchOn}
              {lead}
              part="switch"
              {projectId}
              {projectName}
            />
          </span>
        {/snippet}
      </Tip>
    </BarGlass>
  </div>
  <div class={["flex flex-col gap-space-3", sheet ? "px-4" : "px-space-4"]}>
    <!-- What the switch says after it: the stops parked there once its
         confirm is pressed, a refusal. -->
    <CawLeadSwitch
      label={asleep ? words.switchOff : words.switchOn}
      {lead}
      part="after"
      {projectId}
      {projectName}
    />
  </div>
</section>
