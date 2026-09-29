<script lang="ts" module>
  import type { EffortLevel, PermissionMode } from "@whiffle/core";

  /** The run settings that ride on a model: its effort and the session's permission mode. */
  export interface ModelTools {
    effort: EffortLevel | null;
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
{#snippet permissionChip()}
  {@const Icon = look.icon}
  <Icon style={`color:${look.hue}`} />
  <span class="chip-label">{look.short}</span>
{/snippet}

<!-- Read-only and editable cross-fade in place (motion/curves crossIn/crossOut). -->
<span class="tool-chips">
  {#if readonly}
    <span class="swap" in:crossIn out:crossOut>
      {#if tools.efforts.length}
        <span class="ns-chip-btn tool static">{@render effortChip()}</span>
      {/if}
      {#if tools.modes.length}
        <span class="ns-chip-btn tool static">{@render permissionChip()}</span>
      {/if}
    </span>
  {:else}
    <span class="swap" in:crossIn out:crossOut>
      <NsPopoverGroup>
        {#if tools.efforts.length}
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
  /* The chips keep the gap of the row they sit in. */
  .tool-chips {
    position: relative;
    display: inline-flex;
    gap: inherit;
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
