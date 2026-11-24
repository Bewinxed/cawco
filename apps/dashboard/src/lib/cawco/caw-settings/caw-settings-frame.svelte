<script lang="ts">
  import type { TriggerKind, TriggerSetting } from "@cawco/core/triggers";
  import {
    triggerKindWords,
    cawSettingsWords as words,
  } from "@cawco/core/words/caw-settings";
  /**
   * Caw's settings in a states frame (CawSettings.stories): the project
   * head's More in its glass (BarGlass, BarItem), and his settings open from
   * it as the head opens them (CawSettingsLayer: a popover on a desk, the
   * drawer's sheet under the phone line), drawn in the frame. Fed the
   * fixtures (caw-settings.fixtures): the page's Caw ({@link FixtureCaw}),
   * his chat and each kind as the hub answers them, a pick shown as it is
   * made. A flip the person has just made is `asked`, made through the
   * switch's own path (`flipCaw`) as the frame opens: off asks through the
   * Caw-off confirm hung from the switch's glass while what he started
   * runs. Every layer the kit portals opens inside the frame (bits-ui's
   * `defaultPortalTo`), so the frame and its moves hold it.
   */
  import { commonWords } from "@cawco/core/words/common";
  import { BitsConfig } from "bits-ui";
  import { untrack } from "svelte";
  import { flipCaw } from "#lib/cawco/project/CawLeadSwitch.svelte";
  import { BarGlass, BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconMoreLinear } from "#lib/icons.js";
  import CawSettings from "./CawSettings.svelte";
  import CawSettingsLayer from "./CawSettingsLayer.svelte";
  import type { CawRunsAs } from "./caw-settings";
  import {
    CHAT,
    FixtureCaw,
    INSTALLED,
    KINDS_UNSET,
    MACHINE,
    OWN_OVERRIDDEN,
    REFUSED,
    triggersOf,
  } from "./caw-settings.fixtures.svelte";

  let {
    projectId,
    projectName = "cockpit",
    on = true,
    answer = "accepts",
    running = true,
    hub = "connected",
    overridden = false,
    asked = null,
    changes = false,
    triggers = "read",
    refusedKind = null,
    height = 900,
  }: {
    /** The project, one per story: its Caw-off job is kept by it (each frame's its own, `project`). */
    projectId: string;
    projectName?: string;
    /** He is awake as the panel opens. */
    on?: boolean;
    /** What the hub does with his switch. */
    answer?: "accepts" | "refuses";
    /** What his chat started still runs as he is turned off. */
    running?: boolean;
    /** Whether the hub answers at all. */
    hub?: "connected" | "away";
    /** Routine results run on their own harness and model. */
    overridden?: boolean;
    /**
     * The person has just flipped him, as the frame opens: off asks
     * through the Caw-off confirm while what he started runs, on wakes him.
     */
    asked?: "on" | "off" | null;
    /** Caw may change these settings. */
    changes?: boolean;
    /** The kinds as read: read, still on their way, or refused. */
    triggers?: "read" | "reading" | "unread";
    /** A kind whose last change the hub refused. */
    refusedKind?: TriggerKind | null;
    /** The frame's least height, px: room for the panel under More. */
    height?: number;
  } = $props();

  /**
   * The project as this frame keeps it: the stage draws a story in many
   * frames on one page (each interaction, each move), and a Caw-off job is
   * kept per project, so frames sharing one pressed, flew and closed each
   * other's.
   */
  const frame = $props.id();
  const project = $derived(`${projectId}-${frame}`);

  const caw = $derived(
    new FixtureCaw({ on, running, refuses: answer === "refuses" })
  );
  // The flip the frame opens on, as the person just made it.
  $effect(() => {
    if (asked) {
      const flipped = { id: project, name: projectName };
      untrack(() => flipCaw(caw, flipped, asked === "on"));
    }
  });

  /** What the person has picked here, over the fixtures. */
  let chat = $state<CawRunsAs>({ ...CHAT });
  let own = $derived(overridden ? OWN_OVERRIDDEN : KINDS_UNSET);
  let allowed = $derived(changes);
  const view = $derived(triggers === "read" ? triggersOf(own, chat) : null);
  const refused = $derived(
    refusedKind
      ? {
          kind: refusedKind,
          words: words.refused(
            words.kindUnchanged(triggerKindWords[refusedKind].name),
            REFUSED
          ),
        }
      : null
  );

  const pickChat = (patch: Partial<TriggerSetting>) => {
    const { harness, ...rest } = patch;
    chat = { ...chat, ...rest, ...(harness ? { harness } : {}) };
  };
  const pickKind = (kind: TriggerKind, patch: Partial<TriggerSetting>) => {
    own = { ...own, [kind]: { ...own[kind], ...patch } };
  };

  let open = $state(true);
  let more = $state<HTMLElement | null>(null);
  let layer = $state<HTMLElement | null>(null);
</script>

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
    {#if layer}
      <CawSettingsLayer anchor={more} frame={layer} {projectName} bind:open>
        {#snippet panel(sheet)}
          <CawSettings
            changesSettings={allowed}
            {chat}
            hubAway={hub === "away"}
            installed={INSTALLED}
            lead={caw}
            machine={MACHINE}
            onchanges={(next) => {
              allowed = next;
            }}
            onchat={pickChat}
            onkind={pickKind}
            projectId={project}
            {projectName}
            refusedKind={refused}
            {sheet}
            triggers={view}
            unread={triggers === "unread" ? REFUSED : null}
          />
        {/snippet}
      </CawSettingsLayer>
    {/if}
  </BitsConfig>
</div>
