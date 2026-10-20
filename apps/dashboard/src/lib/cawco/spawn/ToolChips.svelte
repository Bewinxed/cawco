<script lang="ts" module>
  import type { EffortLevel, HarnessKind, PermissionMode } from "@cawco/core";
  import { accountsWords } from "@cawco/core";

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

  const HARNESS_NAMES: Record<HarnessKind, string> = accountsWords.harnesses;

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
    /** The harness the modes are described for. */
    harness: HarnessKind | undefined;
    modes: { value: PermissionMode; disabled: boolean; reason?: string }[];
    oneffort: (level: EffortLevel) => void;
    onpermission: (mode: PermissionMode) => unknown;
    permission: PermissionMode | null;
    /** Switching into Full Send restarts the running session in place. */
    restartsOnFullSend?: boolean;
  }
</script>

<script lang="ts">
  /**
   * Effort and permission as chips that open their pickers on one shared
   * popover surface. Read-only, they are the same chips as plain text.
   */
  import {
    type ChipSize,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import { IconShield } from "#lib/icons.js";
  import Down from "~icons/solar/alt-arrow-down-linear";
  import Tuning from "~icons/solar/tuning-2-bold-duotone";
  import { crossIn, crossOut } from "../motion/curves.svelte";
  import EffortPips from "./EffortPips.svelte";
  import NsPopover from "./NsPopover.svelte";
  import NsPopoverGroup from "./NsPopoverGroup.svelte";
  import PermissionSection from "./PermissionSection.svelte";
  import { permissionLook } from "./permission-look";

  /** The permission chip while no mode is chosen. */
  const UNCHOSEN_MODE = "Choose a mode";

  let {
    tools,
    id = "session",
    closeOnCommit = false,
    readonly = false,
    size = "regular",
  }: {
    tools: ModelTools;
    /** Prefix for the chips' popover ids. */
    id?: string;
    /** Apply the effort once the level is let go, then close the picker. */
    closeOnCommit?: boolean;
    readonly?: boolean;
    /** The chips' size: the dialog's, or the session card's `compact` group. */
    size?: ChipSize;
  } = $props();
  let pop = $state<"effort" | "permission" | null>(null);
  const look = $derived(
    tools.permission ? permissionLook(tools.permission, tools.harness) : null
  );
  /**
   * A session or form in Full Send says so on its chip, editable or not, in
   * the consequential grant's warning tint (DESIGN.md, The Consequential
   * Grant Rule): it never reads as a routine setting.
   */
  const fullSend = $derived(tools.permission === "fullSend");
  /** The effort chip is always there; when it has no level, it says why. */
  const effortOff = $derived(
    tools.effortOff ??
      (tools.efforts.length || tools.effort ? null : NO_EFFORT_MODEL)
  );
  /** A scale to pick from, on a chip that can change it. */
  const effortPicker = $derived(
    !(readonly || effortOff) && tools.efforts.length > 0
  );
  /** A setting chip at this row's size; Full Send's in the grant's tone. */
  const chip = $derived(chipVariants({ variant: "setting", size }));
  const permissionChipClass = $derived(
    chipVariants({
      variant: "setting",
      size,
      tone: fullSend ? "grant" : undefined,
    })
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
  <Tuning class="text-hue-orange-500" />
  <span data-slot="chip-label" class="capitalize"
    >{tools.effort ?? "Default"}</span
  >
{/snippet}
<!-- The level as plain text, or why there is none: never a picker. -->
{#snippet effortStatic()}
  {#if effortOff}
    <span
      data-tool
      aria-disabled="true"
      class={chip}
      data-variant={readonly ? "static" : undefined}
      title={effortOff.reason}
    >
      <Tuning class="text-hue-orange-500" />
      <span data-slot="chip-label">{effortOff.label}</span>
      <span class="sr-only">: {effortOff.reason}</span>
    </span>
  {:else}
    <span data-tool data-variant="static" class={chip}
      >{@render effortChip()}</span
    >
  {/if}
{/snippet}
{#snippet permissionChip()}
  {#if look}
    {@const Icon = look.icon}
    <Icon style={`color:${look.hue}`} />
    <span data-slot="chip-label">{look.name}</span>
  {:else}
    <IconShield class="text-ink-subtle" />
    <span data-slot="chip-label">{UNCHOSEN_MODE}</span>
  {/if}
{/snippet}

<!-- Read-only and editable cross-fade in place (motion/curves crossIn/crossOut).
     The chips keep the gap of the row they sit in (gap-inherit). -->
<span data-slot="tool-chips" class="relative inline-flex flex-none gap-inherit">
  {#if readonly}
    <span
      data-slot="swap"
      class="inline-flex items-center gap-inherit"
      in:crossIn
      out:crossOut
    >
      {@render effortStatic()}
      {#if tools.modes.length && tools.permission}
        <span
          data-tool
          data-variant="static"
          class={permissionChipClass}
          title={look?.desc || undefined}>{@render permissionChip()}</span
        >
      {/if}
    </span>
  {:else}
    <span
      data-slot="swap"
      class="inline-flex items-center gap-inherit"
      in:crossIn
      out:crossOut
    >
      {#if !effortPicker}
        {@render effortStatic()}
      {/if}
      <NsPopoverGroup>
        {#if effortPicker}
          <NsPopover
            align="end"
            id={`${id}-effort`}
            label={`Effort: ${tools.effort ?? "Default"}`}
            onchange={(value) => {
              pop = value ? "effort" : null;
            }}
            open={pop === "effort"}
            triggerClass={chip}
            triggerData={{ "data-tool": true }}
            width={300}
          >
            {#snippet trigger()}
              {@render effortChip()}
              <Down data-slot="chevron" />
            {/snippet}
            <div class="p-space-2">
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
        <!-- A harness with no modes shows nothing here; one with modes and
             none chosen yet (a form with nothing remembered) says so. -->
        {#if tools.modes.length}
          <NsPopover
            align="end"
            id={`${id}-permission`}
            label={`Permission mode: ${look?.name ?? UNCHOSEN_MODE}`}
            onchange={(value) => {
              pop = value ? "permission" : null;
            }}
            open={pop === "permission"}
            triggerClass={permissionChipClass}
            triggerData={{ "data-tool": true }}
            width={340}
          >
            {#snippet trigger()}
              {@render permissionChip()}
              <Down data-slot="chevron" />
            {/snippet}
            <PermissionSection
              embedded
              harness={tools.harness}
              modes={tools.modes}
              onchange={(mode) => {
                pop = null;
                return tools.onpermission(mode);
              }}
              restarts={tools.restartsOnFullSend}
              value={tools.permission}
            />
          </NsPopover>
        {/if}
      </NsPopoverGroup>
    </span>
  {/if}
</span>
