<script lang="ts">
  /**
   * A member's settings, or Add a member, hung from the card that opened
   * them in the kit's popover, as a kind's hand-over hangs from its tile:
   * nothing on the page moves and nothing is held. ×, Escape or a press
   * elsewhere closes it and parks a changed draft (WhoDecides `closeSetup`).
   */
  import type { Snippet } from "svelte";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import type { WhoDecides } from "./decides.svelte";
  import MemberSetup from "./MemberSetup.svelte";

  let {
    who,
    at,
    anchor,
    project,
    trigger,
  }: {
    who: WhoDecides;
    /** Whose settings: a member's id, or Add a member's key. */
    at: string;
    /** The card it hangs from. */
    anchor: HTMLElement | null;
    project: string | null;
    /** The control that opens it, given the popover's trigger props. */
    trigger: Snippet<[Record<string, unknown>]>;
  } = $props();

  const uid = $props.id();
  const open = $derived(who.setup?.from === at);
  /** It was opened by a press here: the focus goes into it. Standing open as it mounts, it takes none. */
  let pressed = false;
</script>

<Popover.Root
  bind:open={
    () => open,
    (next) => {
      if (next && !open) {
        pressed = true;
        who.openSetup(at);
      } else if (open) {
        who.closeSetup();
      }
    }
  }
>
  <Popover.Trigger>
    {#snippet child({ props })}
      {@render trigger(props)}
    {/snippet}
  </Popover.Trigger>
  <Popover.Content
    align="start"
    aria-labelledby="{uid}-head"
    customAnchor={anchor}
    gap="none"
    height="room"
    onOpenAutoFocus={(event) => {
      if (!pressed) {
        event.preventDefault();
      }
      pressed = false;
    }}
    overflow="clip"
    pad="none"
    side="bottom"
    style="--pop-w: min(var(--c-member-setup-max-w), var(--bits-popover-content-available-width, 100vw)); --pop-max-h: var(--bits-popover-content-available-height)"
    width="room"
  >
    {#if who.setup && open}
      <MemberSetup headId="{uid}-head" {project} setup={who.setup} {who} />
    {/if}
  </Popover.Content>
</Popover.Root>
