<script lang="ts" module>
  /** Something else done to the kind, under the members. */
  export interface PickerAction {
    label: string;
    run: () => unknown;
  }
</script>

<script lang="ts">
  /**
   * Who answers a kind, picked from its face chip. On a desk it is the
   * kit's menu hung from the chip: each member a radio item (its face, its
   * name, what it runs on, the one answering now ticked), the arrows moving
   * through them and Enter or a press picking, then a consequence line and
   * what else is done to the kind. Under the phone line it is the kit's
   * bottom sheet holding the same list as bits-ui's radio group, a tap
   * picking. In
   * a states file's frame it draws in place.
   */
  import type { Kind, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { RadioGroup } from "bits-ui";
  import type { Snippet } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import * as DropdownMenu from "#lib/components/ui/dropdown-menu/index.js";
  import { IconTick } from "#lib/icons.js";
  import Hung from "./Hung.svelte";
  import { drawnInPlace } from "./in-place";
  import MemberFace from "./MemberFace.svelte";

  let {
    open,
    onopen,
    anchor,
    kind,
    members,
    current,
    fleetChoice,
    runsOn,
    onpick,
    note = null,
    actions = [],
    trigger,
  }: {
    open: boolean;
    onopen: (open: boolean) => void;
    /** The chip it hangs from, in a frame drawn in place. */
    anchor: HTMLElement | null;
    kind: Kind;
    members: Member[];
    current: string;
    fleetChoice: string | null;
    runsOn: (member: Member) => string | null;
    onpick: (member: string) => void;
    /** What stays where it is if he picks, under the members. */
    note?: string | null;
    /** What else is done to the kind, under the members. */
    actions?: PickerAction[];
    trigger: Snippet<[Record<string, unknown>]>;
  } = $props();

  const still = drawnInPlace();
  const phone = new MediaQuery("width < 640px");
</script>

{#snippet row(member: Member)}
  {@const runs = runsOn(member)}
  <span class="flex" data-box><MemberFace {member} size={28} /></span>
  <span class="flex min-w-0 flex-auto flex-col" data-box>
    <span class="type-label text-ink-strong wrap-anywhere">{member.name}</span>
    {#if member.id === fleetChoice || runs}
      <span class="type-meta text-ink-muted wrap-anywhere"
        >{member.id === fleetChoice ? decidesWords.fleetsChoice : runs}</span
      >
    {/if}
  </span>
{/snippet}

{#snippet noteLine()}
  {#if note}
    <p class="px-space-2 py-space-1 type-meta text-ink-muted text-pretty">
      {note}
    </p>
  {/if}
{/snippet}

{#if still || phone.current}
  <Hung
    align="end"
    {anchor}
    label={kind.name}
    {onopen}
    {open}
    width="var(--c-pop-w)"
    {trigger}
  >
    <!-- The members as bits-ui's radio group: a tap picks. -->
    <RadioGroup.Root
      aria-label={kind.name}
      class="flex flex-col gap-px"
      onValueChange={(next) => onpick(next)}
      value={current}
    >
      {#each members as member (member.id)}
        <RadioGroup.Item
          class="mark-line flex min-h-c-touch-floor w-full items-center gap-space-2 concentric-xs px-space-2 py-space-1 text-start transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
          onclick={() => {
            if (member.id === current) {
              onpick(member.id);
            }
          }}
          value={member.id}
        >
          {@render row(member)}
          {#if member.id === current}
            <IconTick aria-hidden="true" class="size-icon-sm text-ink-strong" />
          {/if}
        </RadioGroup.Item>
      {/each}
    </RadioGroup.Root>
    {@render noteLine()}
    {#if actions.length > 0}
      <div
        class="mt-space-1 flex flex-col gap-px border-border-hairline border-t pt-space-1"
      >
        {#each actions as action (action.label)}
          <button
            class="flex min-h-c-touch-floor w-full items-center concentric-xs px-space-2 py-space-1 text-start type-label text-ink-strong transition-control can-hover:hover:bg-surface-hover focus-visible:outline-2 focus-visible:-outline-offset-2 focus-visible:outline-focus-ring focus-visible:outline-solid"
            onclick={() => {
              onopen(false);
              action.run();
            }}
            type="button">{action.label}</button
          >
        {/each}
      </div>
    {/if}
  </Hung>
{:else}
  <DropdownMenu.Root bind:open={() => open, onopen}>
    <DropdownMenu.Trigger>
      {#snippet child({ props })}
        {@render trigger(props)}
      {/snippet}
    </DropdownMenu.Trigger>
    <DropdownMenu.Content align="end" class="w-c-pop-w">
      <DropdownMenu.RadioGroup
        aria-label={kind.name}
        onValueChange={(next) => onpick(next)}
        value={current}
      >
        {#each members as member (member.id)}
          <DropdownMenu.RadioItem value={member.id}>
            <span
              class="flex min-w-0 flex-auto items-center gap-space-2"
              data-box
            >
              {@render row(member)}
            </span>
          </DropdownMenu.RadioItem>
        {/each}
      </DropdownMenu.RadioGroup>
      {@render noteLine()}
      {#if actions.length > 0}
        <DropdownMenu.Separator />
        {#each actions as action (action.label)}
          <DropdownMenu.Item onSelect={() => action.run()}
            >{action.label}</DropdownMenu.Item
          >
        {/each}
      {/if}
    </DropdownMenu.Content>
  </DropdownMenu.Root>
{/if}
