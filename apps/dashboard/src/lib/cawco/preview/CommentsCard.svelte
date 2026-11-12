<script lang="ts">
  /**
   * The Comments card on a desk: hung from the head's Comments button as
   * one shape with its glass (BarCard), down to the side card's foot, the
   * open thread joined to its leading edge (the owner's pick on pin 51:
   * selecting a comment shows its thread as a second card, connected). It
   * stays while he works on the page: only Comments shuts it, so a press
   * outside, Escape and focus moves leave it be.
   *
   * `trigger` draws the button with the popover's trigger props; `children`
   * is the list (CommentRail `layout="beside"`); `thread`, while one is
   * open, its card's contents, keyed by `threadKey`.
   */
  import { type Snippet, untrack } from "svelte";
  import { BarCard } from "#lib/components/ui/bar-glass/index.js";
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { frameObserver } from "../frame-observer";
  import { numberOf } from "../motion/curves.svelte";

  let {
    open,
    onOpenChange,
    panel,
    label,
    trigger,
    thread = null,
    threadKey,
    threadLabel,
    children,
  }: {
    /** The card stands open. */
    open: boolean;
    /** The trigger pressed: the card asked open or shut. */
    onOpenChange: (open: boolean) => void;
    /** The side card it hangs in (SideSurface `section`): the card reaches its foot. */
    panel: HTMLElement | undefined;
    /** The list, read out. */
    label: string;
    /** The Comments button, handed the trigger's props. */
    trigger: Snippet<[Record<string, unknown>]>;
    /** The open thread's card contents; none while no thread is open. */
    thread?: Snippet | null;
    /** What the thread is: a new one draws its card afresh. */
    threadKey?: string;
    /** The thread's card, read out. */
    threadLabel?: string;
    /** The list. */
    children: Snippet;
  } = $props();

  /** The card's height, down to the side card's foot, px. It floats over the page, which keeps its width. */
  let height = $state(0);
  const reach = () => {
    // Read off the glass it hangs from, never its own box: the card comes
    // down out of the glass, and read mid-way its top stood above its rest.
    const read = () => {
      const card = panel?.getBoundingClientRect();
      const glass = panel
        ?.querySelector<HTMLElement>(
          '[data-slot="side-head"] [data-slot="tools"]'
        )
        ?.getBoundingClientRect();
      if (!(card && glass)) {
        return;
      }
      const next = Math.max(
        0,
        Math.round(card.bottom - glass.bottom - numberOf("--spacing-space-2"))
      );
      if (next !== height) {
        height = next;
      }
    };
    // Read untracked: the attachment would re-run on what it writes.
    untrack(read);
    const watch = frameObserver(read);
    const card = untrack(() => panel);
    if (card) {
      watch.observe(card);
    }
    return () => {
      watch.disconnect();
      height = 0;
    };
  };
</script>

<!-- The open thread, joined to the card's leading edge (BarCard `beside`):
     padded and scrolling as the floating thread is (PinFloat's surface),
     its rows scrolling, the card never sideways. -->
{#snippet joined()}
  {#if thread}
    {#key threadKey}
      <div
        class="flex w-c-comments-w min-h-0 flex-col gap-space-2 overflow-x-hidden overflow-y-auto overscroll-contain p-space-3"
        data-slot="thread-card"
      >
        {@render thread()}
      </div>
    {/key}
  {/if}
{/snippet}

<Popover.Root {onOpenChange} {open}>
  <Popover.Trigger>
    {#snippet child({ props })}
      {@render trigger(props)}
    {/snippet}
  </Popover.Trigger>
  <BarCard
    bare
    beside={thread ? joined : null}
    besideLabel={thread ? threadLabel : undefined}
    escapeKeydownBehavior="ignore"
    interactOutsideBehavior="ignore"
    {label}
    onCloseAutoFocus={(event: Event) => event.preventDefault()}
    onOpenAutoFocus={(event: Event) => event.preventDefault()}
    trapFocus={false}
  >
    <div
      class="flex h-(--rail-h) w-c-comments-w min-h-0 flex-col"
      data-slot="rail-card"
      style:--rail-h="{height}px"
      {@attach reach}
    >
      {@render children()}
    </div>
  </BarCard>
</Popover.Root>
