<script lang="ts" module>
  import type { EffortLevel, HarnessKind, PermissionMode } from "@cawco/core";

  /** Why the effort chip offers no level, in the chip's words and its title's. */
  export interface EffortOff {
    label: string;
    reason: string;
  }

  /** A model with no effort scale: nothing to pick, and the chip says so. */
  export const NO_EFFORT_MODEL: EffortOff = {
    label: "No effort",
    reason: "This model has no effort setting",
  };

  const HARNESS_NAMES: Record<HarnessKind, string> = {
    claude: "Claude Code",
    opencode: "OpenCode",
    pi: "Pi",
  };

  /** A harness that can neither report nor change effort. */
  export const effortNotExposed = (harness: HarnessKind): EffortOff => ({
    label: "Effort n/a",
    reason: `${HARNESS_NAMES[harness]} doesn't expose effort`,
  });

  /** The run settings that ride on a model: its effort and the session's permission mode. */
  export interface ModelTools {
    effort: EffortLevel | null;
    /**
     * Set when the chip cannot show a level: the harness has no effort, the
     * session sends none, or it has not been read yet. Absent with an empty
     * {@link efforts} and no {@link effort} reads as {@link NO_EFFORT_MODEL}.
     */
    effortOff?: EffortOff | null;
    efforts: EffortLevel[];
    modes: { value: PermissionMode; disabled: boolean; reason?: string }[];
    oneffort: (level: EffortLevel) => void;
    onpermission: (mode: PermissionMode) => void;
    permission: PermissionMode | null;
  }
</script>

<script lang="ts">
  /**
   * Effort and permission as chips that open their pickers on one shared
   * popover surface. Read-only, they are the same chips as plain text.
   */
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Tuning from "~icons/solar/tuning-2-bold-duotone";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import EffortPips from "./EffortPips.svelte";
  import NsPopover from "./NsPopover.svelte";
  import NsPopoverGroup from "./NsPopoverGroup.svelte";
  import PermissionSection from "./PermissionSection.svelte";
  import { permissionLook } from "./permission-look";

  let {
    tools,
    id = "session",
    closeOnCommit = false,
    readonly = false,
  }: {
    tools: ModelTools;
    /** Prefix for the chips' popover ids. */
    id?: string;
    /** Apply the effort once the level is let go, then close the picker. */
    closeOnCommit?: boolean;
    readonly?: boolean;
  } = $props();
  let pop = $state<"effort" | "permission" | null>(null);
  const look = $derived(permissionLook(tools.permission ?? ""));
  /** The effort chip is always there; when it has no level, it says why. */
  const effortOff = $derived(
    tools.effortOff ??
      (tools.efforts.length || tools.effort ? null : NO_EFFORT_MODEL)
  );
  /** A scale to pick from, on a chip that can change it. */
  const effortPicker = $derived(
    !(readonly || effortOff) && tools.efforts.length > 0
  );
  /** Apply the level now, but keep the picker open while the chip settles on it. */
  const SETTLE_MS = 260;
  let closeTimer: ReturnType<typeof setTimeout> | undefined;
  function commitEffort(level: EffortLevel) {
    tools.oneffort(level);
    clearTimeout(closeTimer);
    closeTimer = setTimeout(() => {
      pop = null;
    }, SETTLE_MS);
  }
  $effect(() => () => clearTimeout(closeTimer));
</script>

{#snippet effortChip()}
  <Tuning style="color:var(--hue-orange-500)" />
  <span class="chip-label level">{tools.effort ?? "Default"}</span>
{/snippet}
<!-- The level as plain text, or why there is none: never a picker. -->
{#snippet effortStatic()}
  {#if effortOff}
    <span
      aria-disabled="true"
      class={["ns-chip-btn tool off", readonly && "static"]}
      title={effortOff.reason}
    >
      <Tuning style="color:var(--hue-orange-500)" />
      <span class="chip-label">{effortOff.label}</span>
      <span class="sr-only">: {effortOff.reason}</span>
    </span>
  {:else}
    <span class="ns-chip-btn tool static">{@render effortChip()}</span>
  {/if}
{/snippet}
{#snippet permissionChip()}
  {@const Icon = look.icon}
  <Icon style={`color:${look.hue}`} />
  <span class="chip-label">{look.short}</span>
{/snippet}

<!-- Read-only and editable cross-fade in place (motion/curves crossIn/crossOut). -->
<span class="tool-chips">
  {#if readonly}
    <span class="swap" in:crossIn out:crossOut>
      {@render effortStatic()}
      {#if tools.modes.length}
        <span class="ns-chip-btn tool static">{@render permissionChip()}</span>
      {/if}
    </span>
  {:else}
    <span class="swap" in:crossIn out:crossOut>
      {#if !effortPicker}
        {@render effortStatic()}
      {/if}
      <NsPopoverGroup>
        {#if effortPicker}
          <NsPopover
            align="end"
            id={`${id}-effort`}
            label="Effort"
            onchange={(value) => { pop = value ? 'effort' : null; }}
            open={pop === "effort"}
            triggerClass="ns-chip-btn tool"
            width={300}
          >
            {#snippet trigger()}
              {@render effortChip()}
              <Down class="chevron" />
            {/snippet}
            <div class="effort-pop">
              <EffortPips
                efforts={tools.efforts}
                embedded
                onchange={tools.oneffort}
                oncommit={closeOnCommit ? commitEffort : undefined}
                value={tools.effort}
              />
            </div>
          </NsPopover>
        {/if}
        {#if tools.modes.length}
          <NsPopover
            align="end"
            id={`${id}-permission`}
            label="Permission mode"
            onchange={(value) => { pop = value ? 'permission' : null; }}
            open={pop === "permission"}
            triggerClass="ns-chip-btn tool"
            width={340}
          >
            {#snippet trigger()}
              {@render permissionChip()}
              <Down class="chevron" />
            {/snippet}
            <PermissionSection
              embedded
              modes={tools.modes}
              onchange={(mode) => { tools.onpermission(mode); pop = null; }}
              value={tools.permission}
            />
          </NsPopover>
        {/if}
      </NsPopoverGroup>
    </span>
  {/if}
</span>

<style>
  /* The chips keep the gap of the row they sit in, and never shrink or wrap
     in it: a row that runs short gives the room up from its other chips. */
  .tool-chips {
    position: relative;
    display: inline-flex;
    flex: none;
    gap: inherit;
  }
  /* Unavailable: the chip's own look, faded as a disabled control is. */
  .off {
    cursor: not-allowed;
    opacity: 0.55;
  }
  @media (hover: hover) {
    .tool-chips .off:hover {
      background: var(--surface-raised);
    }
    .tool-chips .off.static:hover {
      background: transparent;
    }
  }
  .swap {
    display: inline-flex;
    align-items: center;
    gap: inherit;
  }
  .level {
    text-transform: capitalize;
  }
  .effort-pop {
    padding: 8px 6px 6px;
  }
</style>
