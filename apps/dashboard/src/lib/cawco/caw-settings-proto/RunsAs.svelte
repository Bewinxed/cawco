<script lang="ts">
  /**
   * What a run starts as, in one row of setting chips (DESIGN.md, Setting
   * chip): its account (the shipped AccountSwitch, for a harness whose
   * models come by account), its harness and model (the New session
   * dialog's ModelSection, in its own popover as the session card opens it),
   * and its mode (the New session dialog's PermissionSection, as its
   * permission chip opens it). The chips share one popover surface
   * (NsPopoverGroup), so moving from one to the next glides.
   *
   * A field the row does not set itself is drawn in the chip's muted tone,
   * its value the one in effect and its word saying where that comes from
   * ("fleet", "your chat"). A pick sends only that field; a harness picked
   * on the rail sends no model, so the harness's default runs until one is
   * picked. With `onreset`, a field the row sets itself carries a small
   * reset beside its chip, which sets it back to what it inherits (harness
   * and model go back together, as they are picked together).
   */
  import { CLAUDE_PROVIDER } from "@cawco/core/accounts";
  import type { HarnessKind } from "@cawco/core/harness/kinds";
  import {
    type PermissionMode,
    permissionModeNamed,
  } from "@cawco/core/harness/modes";
  import { traitsOf } from "@cawco/core/harness/traits";
  import { cawSettingsWords as words } from "@cawco/core/words/caw-settings";
  import { spawnWords } from "@cawco/core/words/spawn";
  import { MediaQuery } from "svelte/reactivity";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    chipsVariants,
    chipVariants,
  } from "#lib/components/ui/chip/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { PHONE_QUERY } from "#lib/hooks/is-mobile.svelte.js";
  import {
    IconChevronDown as Down,
    IconCpuBolt,
    IconReset,
    IconShield,
  } from "#lib/icons.js";
  import AccountSwitch from "../accounts/AccountSwitch.svelte";
  import { nameOf } from "../accounts/model.svelte";
  import HarnessLogo from "../HarnessLogo.svelte";
  import { modelLabel } from "../models.svelte";
  import { permissionModesFor } from "../permission-modes";
  import ModelSection from "../spawn/ModelSection.svelte";
  import NsPopover from "../spawn/NsPopover.svelte";
  import NsPopoverGroup from "../spawn/NsPopoverGroup.svelte";
  import PermissionSection from "../spawn/PermissionSection.svelte";
  import { permissionLook } from "../spawn/permission-look";
  import { accountsStore } from "../stores/accounts.svelte";
  import type { TriggerField, TriggerLayer } from "./caw-settings";

  let {
    id,
    machineId,
    machineName,
    installed,
    harness,
    model,
    mode,
    account,
    from = {},
    readonly = false,
    onchange,
    onreset,
    resetLabel,
    tight = false,
    tips = {},
  }: {
    /** Prefix for its popovers' ids. */
    id: string;
    /** The machine the run starts on: what its accounts and models are read for. */
    machineId: string;
    machineName: string;
    /** The harnesses installed there. */
    installed: HarnessKind[];
    /** Null: unknown here (each project's own Caw's). */
    harness: HarnessKind | null;
    /** Null: the harness's default model. */
    model: string | null;
    /** Null: the harness's own default mode. */
    mode: PermissionMode | null;
    /** Null: placement picks one. */
    account: string | null;
    /** Each field the row does not set itself: the words of where its value comes from. */
    from?: Partial<Record<TriggerField, string>>;
    /** No change can be asked now (the hub is away). */
    readonly?: boolean;
    /** A pick: only the field it changes. */
    onchange: (patch: Partial<TriggerLayer>) => void;
    /** A field set back to what it inherits; absent where nothing is inherited. */
    onreset?: (fields: TriggerField[]) => void;
    /** A reset's name, for the field it sets back. */
    resetLabel?: (field: "account" | "model" | "mode") => string;
    /**
     * Its row is indented under a name (a trigger row): under the phone
     * line the mode chip, and an account chip whose value is unknown here
     * (only where it comes from), draw their glyph alone, the words in
     * their tooltip, so the row's three pickers keep one line.
     */
    tight?: boolean;
    /** A field's own tooltip, in place of where it inherits from (a trigger's default mode). */
    tips?: Partial<Record<TriggerField, string>>;
  } = $props();

  const phone = new MediaQuery(PHONE_QUERY);
  /** The row's chips draw their glyph alone where they can ({@link tight}). */
  const glyphOnly = $derived(tight && phone.current);

  /** A reset stands beside a field the row sets itself, while changes can be asked. */
  const resettable = (field: TriggerField): boolean =>
    Boolean(onreset) && !readonly && !from[field];

  let pop = $state<"model" | "mode" | null>(null);
  /** The side each picker opens to, chosen as it opens ({@link sideFor}). */
  let side = $state<{ model: "start" | "end"; mode: "start" | "end" }>({
    model: "start",
    mode: "start",
  });
  /** The pickers' widths, as the session card and New session open them. */
  const MODEL_W = 360;
  const MODE_W = 340;
  /** The screen's edge kept clear, px (the house's 12px collision padding). */
  const EDGE = 12;
  /**
   * The side a picker `width` wide opens to from its chip: aligned to the
   * chip's start where the room past it holds the picker, else to its end,
   * so it keeps its own width rather than being squeezed by the screen's
   * edge (a chip near a panel's trailing edge).
   */
  function sideFor(chipId: string, width: number): "start" | "end" {
    const chip = document.getElementById(chipId);
    if (!chip) {
      return "start";
    }
    const { left } = chip.getBoundingClientRect();
    return left + width > window.innerWidth - EDGE ? "end" : "start";
  }

  /**
   * A chip's words: its value alone (muting says it is inherited, and its
   * tooltip from where), or where it comes from when its value is unknown
   * here (the fleet's row, left to each project).
   */
  const withFrom = (label: string | null, field: TriggerField): string => {
    const source = from[field];
    if (label || !source) {
      return label ?? "";
    }
    return `${source.charAt(0).toUpperCase()}${source.slice(1)}`;
  };
  /** A field's tooltip: where an inherited value comes from; none for the row's own. */
  const tipOf = (field: TriggerField): string => {
    const own = tips[field];
    if (own) {
      return own;
    }
    const source = from[field];
    return source ? words.inheritedFrom(source) : "";
  };
  /** The harness the pickers list for: the one in effect, else the first installed. */
  const listed = $derived<HarnessKind>(harness ?? installed[0] ?? "claude");

  /** Accounts are picked for a harness whose models come by account (Claude Code). */
  const byAccount = $derived(
    harness !== null && traitsOf(harness).modelCatalog === "account"
  );
  const accountRow = $derived(
    accountsStore.accounts?.accounts.find((one) => one.id === account) ?? null
  );
  /** The account's name; none named is placement's pick, or unknown here when inherited. */
  const accountName = $derived.by(() => {
    if (accountRow) {
      return nameOf(accountRow);
    }
    return from.account ? null : spawnWords.account.auto;
  });
  /** Its own account is the chip's account; one it inherits is the chip's words. */
  const holder = $derived({
    id: `${id}-account`,
    accountId: account,
    machineId,
    owedMove: undefined,
  });
  const none = $derived(
    holder.accountId
      ? undefined
      : {
          label: withFrom(accountName, "account"),
          provider: CLAUDE_PROVIDER,
        }
  );

  const modelName = $derived(
    withFrom(harness ? modelLabel(model ?? "", harness) : null, "model")
  );
  /** The modes the harness has (Auto on Claude Code alone), as New session lists them. */
  const modes = $derived(
    permissionModesFor(listed).map((one) => ({
      value: one.value,
      disabled: false,
    }))
  );
  const look = $derived(mode ? permissionLook(mode, listed) : null);
  const modeName = $derived(
    withFrom(look?.name ?? (from.mode ? null : spawnWords.unchosenMode), "mode")
  );
  /**
   * An inherited value's face drops its colour (a harness's mark, a mode's
   * hue), as its words drop to muted ink: the label alone muted left the
   * chip reading as set, its coloured glyph carrying it.
   */
  const faded = (field: TriggerField) =>
    from[field] ? "grayscale opacity-70" : undefined;
  const chip = (field: TriggerField) =>
    chipVariants({
      variant: "setting",
      tone: from[field] ? "muted" : undefined,
    });
</script>

<div data-slot="runs-as" class={chipsVariants({ class: "min-w-0" })}>
  <NsPopoverGroup>
    {#if byAccount}
      <Tip disabled={!tipOf("account")} label={tipOf("account")}>
        {#snippet children(tip)}
          <span
            {...tip}
            data-slot="field"
            class="inline-flex min-w-0 items-center gap-space-1"
          >
            <AccountSwitch
              bare={glyphOnly && !accountRow && Boolean(from.account)}
              instance={holder}
              {none}
              short
              tone={from.account ? "muted" : undefined}
              onpick={(accountId) => onchange({ account: accountId })}
              {readonly}
            />
            {@render reset("account", ["account"])}
          </span>
        {/snippet}
      </Tip>
    {/if}
    {#if readonly}
      <span data-tool data-variant="static" class={chip("model")}>
        {@render harnessFace()}
        <span data-slot="chip-label">{modelName}</span>
      </span>
      <span data-tool data-variant="static" class={chip("mode")}>
        {@render modeFace()}
      </span>
    {:else}
      <Tip disabled={!tipOf("model")} label={tipOf("model")}>
        {#snippet children(tip)}
          <span
            {...tip}
            data-slot="field"
            class="inline-flex min-w-0 items-center gap-space-1"
          >
            <NsPopover
              aria-label={modelName}
              haspopup="listbox"
              align={side.model}
              id={`${id}-model`}
              onchange={(value) => {
                if (value) {
                  side.model = sideFor(`${id}-model`, MODEL_W);
                }
                pop = value ? "model" : null;
              }}
              open={pop === "model"}
              triggerClass={chip("model")}
              triggerData={{ "data-tool": true }}
              width={MODEL_W}
            >
              {#snippet trigger()}
                {@render harnessFace()}
                <span data-slot="chip-label">{modelName}</span>
                <Down data-slot="chevron" />
              {/snippet}
              <div data-slot="model-pop" class="session-details-model-pop">
                <ModelSection
                  harness={listed}
                  {installed}
                  machineIds={[machineId]}
                  {machineName}
                  model={model ?? ""}
                  onharness={(next) => {
                    // A model follows its harness: its default until one is picked.
                    onchange({ harness: next, model: null });
                  }}
                  onmodel={(next) => {
                    pop = null;
                    onchange({ harness: listed, model: next });
                  }}
                />
              </div>
            </NsPopover>
            {@render reset("model", ["harness", "model"])}
          </span>
        {/snippet}
      </Tip>
      <Tip
        disabled={!((glyphOnly && look) || tipOf("mode"))}
        label={glyphOnly && look
          ? [modeName, tipOf("mode")].filter(Boolean).join(". ")
          : tipOf("mode")}
      >
        {#snippet children(tip)}
          <span
            {...tip}
            data-slot="field"
            class="inline-flex min-w-0 items-center gap-space-1"
          >
            <NsPopover
              align={side.mode}
              id={`${id}-mode`}
              label={spawnWords.permissionMode(modeName)}
              onchange={(value) => {
                if (value) {
                  side.mode = sideFor(`${id}-mode`, MODE_W);
                }
                pop = value ? "mode" : null;
              }}
              open={pop === "mode"}
              triggerClass={chip("mode")}
              triggerData={{ "data-tool": true }}
              width={MODE_W}
            >
              {#snippet trigger()}
                {@render modeFace()}
                <Down data-slot="chevron" />
              {/snippet}
              <PermissionSection
                embedded
                harness={listed}
                {modes}
                onchange={(next) => {
                  pop = null;
                  const offered = permissionModeNamed(next);
                  if (offered) {
                    onchange({ mode: offered });
                  }
                }}
                value={mode}
              />
            </NsPopover>
            {@render reset("mode", ["mode"])}
          </span>
        {/snippet}
      </Tip>
    {/if}
  </NsPopoverGroup>
</div>

{#snippet reset(field: "account" | "model" | "mode", fields: TriggerField[])}
  {#if resettable(field)}
    {@const label = resetLabel?.(field) ?? field}
    <Tip {label}>
      {#snippet children(tip)}
        <Button
          {...tip}
          aria-label={label}
          data-slot="reset"
          onclick={() => onreset?.(fields)}
          size="icon-xs"
          variant="ghost"
        >
          <IconReset />
        </Button>
      {/snippet}
    </Tip>
  {/if}
{/snippet}

{#snippet harnessFace()}
  {#if harness}
    <span data-box class={["inline-grid flex-none", faded("model")]}
      ><HarnessLogo {harness} /></span
    >
  {:else}
    <IconCpuBolt class="text-ink-subtle" />
  {/if}
{/snippet}

{#snippet modeFace()}
  {#if look}
    {@const Icon = look.icon}
    <span
      data-box
      class={[
        "inline-grid flex-none text-(--hue) [&>svg]:size-icon-md",
        faded("mode"),
      ]}
      style:--hue={look.hue}><Icon /></span
    >
  {:else}
    <IconShield class="text-ink-subtle" />
  {/if}
  <span class={glyphOnly ? "sr-only" : undefined} data-slot="chip-label"
    >{modeName}</span
  >
{/snippet}
