<script lang="ts">
  /**
   * Project bar, single row at desk:
   * - Leading: inline-editable project name + PlacesAnchor.
   * - Centre: Caw's seat (live CawSeat avatar, muted truncated current line,
   *   Caw on/off Switch, AccountAnchor).
   * - Trailing: BarGlass (Spin off, More menu: Spend / Forget / Delete) and
   *   Ask Caw — the page's only coral primary button.
   */
  import { tick } from "svelte";
  import CawSeat from "#lib/cawco/project/CawSeat.svelte";
  import { RESTING_LEAD } from "#lib/cawco/project/caw-lead.fixture.js";
  import type { SeatedLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import NsPopoverGroup from "#lib/cawco/spawn/NsPopoverGroup.svelte";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Spinner } from "#lib/components/ui/spinner/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import {
    IconChatLinear,
    IconDeleteForGood,
    IconDollar,
    IconForkLinear,
    IconMoreLinear,
    IconTrash,
  } from "#lib/icons.js";
  import AccountAnchor from "./AccountAnchor.svelte";
  import { hubReading, isPending, refusalFor } from "./format";
  import PlacesAnchor from "./PlacesAnchor.svelte";
  import RefusalNote from "./RefusalNote.svelte";
  import type { Change, Changes, GovernedRecord, PlaceAct } from "./records";
  import { words } from "./words";

  let {
    record,
    lead = RESTING_LEAD,
    changes,
    onchange,
    onplace,
    onreread,
    onask,
    onspinoff,
    onmore,
  }: {
    record: GovernedRecord;
    lead?: SeatedLead;
    changes: Changes;
    onchange: (change: Change) => void;
    onplace: (act: PlaceAct, placeId: string) => void;
    onreread: (what: "decides" | "tracker" | "connections") => void;
    onask: () => void;
    onspinoff: () => void;
    onmore: (item: "spend" | "forget" | "delete") => void;
  } = $props();

  const { asOfTime, reachable } = $derived(hubReading(record));

  // ── Inline rename ────────────────────────────────────────────────────────
  let editingName = $state(false);
  let nameDraft = $state("");
  let lastNameAttempt = $state<string | null>(null);
  let nameInputRef = $state<HTMLInputElement | null>(null);
  let nameButtonRef = $state<HTMLButtonElement | null>(null);

  const namePending = $derived(isPending(changes, "name"));
  const nameRefusal = $derived(refusalFor(changes, "name"));

  async function beginRename() {
    if (!reachable || namePending) {
      return;
    }
    nameDraft =
      nameRefusal && lastNameAttempt ? lastNameAttempt : record.project.name;
    editingName = true;
    await tick();
    nameInputRef?.focus();
    nameInputRef?.select();
  }

  function commitRename() {
    if (!editingName) {
      return;
    }
    const trimmed = nameDraft.trim();
    editingName = false;
    if (!trimmed || trimmed === record.project.name || !reachable) {
      return;
    }
    lastNameAttempt = trimmed;
    onchange({ key: "name", name: trimmed });
  }

  async function cancelRename() {
    editingName = false;
    nameDraft = "";
    await tick();
    nameButtonRef?.focus();
  }

  function retryRename() {
    if (!reachable || namePending || !lastNameAttempt) {
      return;
    }
    onchange({ key: "name", name: lastNameAttempt });
  }

  // ── Caw on/off switch ────────────────────────────────────────────────────
  let lastCawAttempt = $state<boolean | null>(null);
  const cawPending = $derived(isPending(changes, "caw"));
  const cawRefusal = $derived(refusalFor(changes, "caw"));

  function toggleCaw(next: boolean) {
    if (!reachable || cawPending || next === record.caw.on) {
      return;
    }
    lastCawAttempt = next;
    onchange({ key: "caw", on: next });
  }

  function retryCaw() {
    if (!reachable || cawPending) {
      return;
    }
    const target = lastCawAttempt ?? !record.caw.on;
    onchange({ key: "caw", on: target });
  }
  const cawTip = $derived.by(() => {
    if (asOfTime) {
      return words.hub.outOfReachTip(asOfTime);
    }
    return record.caw.on ? words.bar.cawSwitchTipOn : words.bar.cawSwitchTipOff;
  });
</script>

<NsPopoverGroup>
  <header
    class="grid gap-space-2 px-space-5 pb-space-2 pt-space-3"
    data-slot="project-bar"
  >
    <div class="flex flex-wrap items-center gap-x-space-4 gap-y-space-2">
      <!-- Leading group: project name + Places anchor -->
      <div class="flex min-w-0 shrink-0 items-center gap-space-2">
        {#if editingName}
          <div class="w-48 max-w-full">
            <Input
              aria-label={words.bar.renameLabel}
              onblur={commitRename}
              onkeydown={(event) => {
                if (event.key === "Enter") {
                  event.preventDefault();
                  commitRename();
                } else if (event.key === "Escape") {
                  event.preventDefault();
                  cancelRename();
                }
              }}
              text="title"
              bind:ref={nameInputRef}
              bind:value={nameDraft}
            />
          </div>
        {:else}
          <button
            aria-busy={namePending || undefined}
            aria-label={words.bar.renameHint(record.project.name)}
            class="mark-line touch-hit -ms-space-2 inline-flex min-w-0 max-w-56 items-center gap-space-2 rounded-sm px-space-2 py-space-1 text-start type-title text-ink-strong transition-control hover:bg-surface-hover disabled:pointer-events-none disabled:opacity-50"
            disabled={!reachable || namePending}
            onclick={beginRename}
            type="button"
            bind:this={nameButtonRef}
          >
            <span class="overflow-clip text-ellipsis whitespace-nowrap"
              >{record.project.name}</span
            >
            {#if namePending}
              <Spinner box="small" class="shrink-0" tone="muted" />
            {/if}
          </button>
        {/if}

        <PlacesAnchor {changes} {onchange} {onplace} {onreread} {record} />
      </div>

      <!-- Centre group: Caw's seat + live line + Caw switch + Account anchor -->
      <div
        class="flex min-w-0 flex-1 basis-64 items-center justify-center gap-space-2 @max-[760px]/project:order-3 @max-[760px]/project:basis-full @max-[760px]/project:justify-start"
        data-slot="caw-seat"
      >
        <div class="shrink-0">
          <CawSeat
            {lead}
            projectId={record.project.id}
            projectName={record.project.name}
            size={28}
          />
        </div>

        <span
          class="min-w-0 max-w-72 flex-1 truncate type-meta text-ink-muted"
          title={record.caw.on ? record.caw.line : words.bar.cawOffLine}
        >
          {record.caw.on ? record.caw.line : words.bar.cawOffLine}
        </span>

        <div class="flex shrink-0 items-center gap-space-1">
          <Tip label={cawTip}>
            {#snippet children(tipProps)}
              <Switch
                {...tipProps}
                aria-label={words.bar.cawSwitchLabel(record.project.name)}
                disabled={!reachable || cawPending}
                bind:checked={() => record.caw.on, toggleCaw}
              />
            {/snippet}
          </Tip>
          {#if cawPending}
            <Spinner box="small" tone="muted" />
          {/if}
        </div>

        <AccountAnchor {changes} {onchange} {record} />
      </div>

      <!-- Trailing group: Spin off, More, Ask Caw (the page's only coral button) -->
      <div class="ms-auto flex shrink-0 items-center gap-space-2">
        <BarGlass form="group">
          <BarItem
            icon={IconForkLinear}
            label={words.bar.spinOff}
            onclick={onspinoff}
          />
          <DropdownMenu.Root>
            <DropdownMenu.Trigger>
              {#snippet child({ props })}
                <BarItem icon={IconMoreLinear} label={words.bar.more} {props} />
              {/snippet}
            </DropdownMenu.Trigger>
            <BarMenu label={words.bar.more} width="compact">
              <DropdownMenu.Item onSelect={() => onmore("spend")}>
                <IconDollar aria-hidden="true" />
                <span>{words.bar.moreItems.spend}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Separator />
              <DropdownMenu.Item onSelect={() => onmore("forget")}>
                <IconTrash aria-hidden="true" />
                <span>{words.bar.moreItems.forget}</span>
              </DropdownMenu.Item>
              <DropdownMenu.Item
                onSelect={() => onmore("delete")}
                variant="destructive"
              >
                <IconDeleteForGood aria-hidden="true" />
                <span>{words.bar.moreItems.delete}</span>
              </DropdownMenu.Item>
            </BarMenu>
          </DropdownMenu.Root>
        </BarGlass>

        <Button onclick={onask} shape="capsule" size="sm" variant="default">
          <IconChatLinear aria-hidden="true" />
          <span>{words.bar.askCaw}</span>
        </Button>
      </div>
    </div>

    {#if nameRefusal}
      <RefusalNote
        disabled={!reachable || namePending}
        onretry={retryRename}
        said={nameRefusal}
      />
    {/if}

    {#if cawRefusal}
      <RefusalNote
        disabled={!reachable || cawPending}
        onretry={retryCaw}
        said={cawRefusal}
      />
    {/if}
  </header>
</NsPopoverGroup>
