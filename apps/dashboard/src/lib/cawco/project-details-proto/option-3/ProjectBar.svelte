<script lang="ts">
  /**
   * Option 3's project bar: project title, one compact Details trigger beside
   * it (calm icon + Details when healthy; crimson fault glyph + Details +
   * fault count when in trouble), Caw's seat snippet, and the trailing glass
   * group (Spin off, More). Hosts the Project Passport as a hanging card on
   * desk (HangCard, hung from Details, bottom-start) and as a
   * bottom sheet on narrow screens (kit Drawer).
   */
  import type { Snippet } from "svelte";
  import { Badge } from "#lib/components/ui/badge/index.js";
  import {
    BarGlass,
    BarItem,
    BarMenu,
  } from "#lib/components/ui/bar-glass/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import * as Drawer from "#lib/components/ui/drawer/index.js";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { HangCard } from "#lib/components/ui/hang-card/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import {
    IconForkLinear,
    IconMoreLinear,
    IconPen,
    IconRefresh,
    IconTuningLinear,
    IconWarningTriangle,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import ProjectPassport from "./ProjectPassport.svelte";
  import { faultsOf, type PassportActs, type PassportReading } from "./records";
  import { passportWords as words } from "./words";

  let {
    name,
    reading,
    acts,
    open = $bindable(false),
    narrow = false,
    seat,
    onspinoff,
  }: {
    name: string;
    reading: PassportReading;
    acts: PassportActs;
    open?: boolean;
    narrow?: boolean;
    seat?: Snippet;
    onspinoff?: () => void;
  } = $props();

  /** The card's tallest: the room under its anchor, at most a dialog's. */
  const PASSPORT_MAX_H =
    "min(var(--spacing-c-dialog-max-h), var(--bits-popover-content-available-height, var(--spacing-c-dialog-max-h)))";

  /** The Details button: the card hangs from it. */
  let trigger = $state<HTMLElement | null>(null);

  const faults = $derived(faultsOf(reading));
  const hubAway = $derived(reading.hubAwaySince !== null);
  const hasTracker = $derived(
    reading.tracker.state === "read" && reading.tracker.value.binding !== null
  );
  const syncing = $derived(
    reading.tracker.state === "read" &&
      reading.tracker.value.binding?.state === "syncing"
  );

  const passportActs = $derived<PassportActs>({
    ...acts,
    editRules(section) {
      open = false;
      acts.editRules(section);
    },
  });
</script>

{#snippet detailsTrigger(triggerProps: Record<string, unknown>)}
  <Button
    aria-label={faults > 0
      ? words.bar.detailsWithFaults(faults)
      : words.bar.details}
    expanded="unfilled"
    shape="capsule"
    size="sm"
    variant="ghost"
    {...triggerProps}
    bind:ref={trigger}
  >
    {#if faults > 0}
      <IconWarningTriangle
        aria-hidden="true"
        class="size-icon-md text-status-fail-glyph"
      />
    {:else}
      <IconTuningLinear
        aria-hidden="true"
        class="size-icon-md text-ink-muted"
      />
    {/if}
    <span>{words.bar.details}</span>
    {#if faults > 0}
      <Badge data-box size="tally" variant="fail">
        <span>{faults}</span>
      </Badge>
    {/if}
  </Button>
{/snippet}

<header
  class="flex min-h-c-top-bar-h flex-none items-center justify-between gap-space-2 px-space-4 py-space-1"
  data-slot="project-head"
>
  <div class="flex min-w-0 flex-1 items-center gap-space-2">
    <h1 class="m-0 min-w-0 truncate type-title text-ink-strong">{name}</h1>

    {#if narrow}
      <Drawer.Root bind:open>
        <Drawer.Trigger>
          {#snippet child({ props })}
            {@render detailsTrigger(props)}
          {/snippet}
        </Drawer.Trigger>
        <Drawer.Content pad="none" title={words.bar.details}>
          <div
            data-safe-bottom
            class={cn(
              Drawer.scroller,
              "min-h-0 flex-1 overflow-y-auto overscroll-contain pb-safe-space-3"
            )}
          >
            <ProjectPassport acts={passportActs} narrow {reading} />
          </div>
        </Drawer.Content>
      </Drawer.Root>
    {:else}
      <Popover.Root bind:open>
        <Popover.Trigger>
          {#snippet child({ props })}
            {@render detailsTrigger(props)}
          {/snippet}
        </Popover.Trigger>
        <HangCard
          align="start"
          anchor={trigger}
          aria-label={words.passport.label}
          collisionPadding={12}
          customAnchor={trigger}
          frame="details"
          onOpenAutoFocus={(event) => event.preventDefault()}
          side="bottom"
          sideOffset={0}
          trapFocus={false}
          class="w-details max-w-full"
        >
          <div
            class="flex max-h-(--passport-max-h) flex-col overflow-y-auto overscroll-contain"
            style:--passport-max-h={PASSPORT_MAX_H}
          >
            <ProjectPassport acts={passportActs} narrow={false} {reading} />
          </div>
        </HangCard>
      </Popover.Root>
    {/if}
  </div>

  <div class="flex flex-none items-center gap-space-2">
    {#if seat}
      {@render seat()}
    {/if}

    <BarGlass form="group">
      <BarItem
        icon={IconForkLinear}
        label={words.bar.spinOff}
        onclick={() => onspinoff?.()}
      />
      <DropdownMenu.Root>
        <DropdownMenu.Trigger>
          {#snippet child({ props })}
            <BarItem
              icon={IconMoreLinear}
              label={words.bar.moreFor(name)}
              {props}
            />
          {/snippet}
        </DropdownMenu.Trigger>
        <BarMenu label={words.bar.moreFor(name)} width="compact">
          <DropdownMenu.Item
            disabled={hubAway}
            onSelect={() => passportActs.editRules()}
          >
            <IconPen aria-hidden="true" class="size-icon-md text-ink-muted" />
            <span>{words.bar.editRulesMenu}</span>
          </DropdownMenu.Item>
          {#if hasTracker}
            <DropdownMenu.Item
              disabled={hubAway || syncing}
              onSelect={() => acts.sync()}
            >
              <IconRefresh
                aria-hidden="true"
                class="size-icon-md text-ink-muted"
              />
              <span>{words.bar.syncNowMenu}</span>
            </DropdownMenu.Item>
          {/if}
        </BarMenu>
      </DropdownMenu.Root>
    </BarGlass>
  </div>
</header>
