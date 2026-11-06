<script lang="ts">
  /**
   * The Comments rail's toggle in the artifact panel's head (the artifact
   * panel's surface brief, The head): the bar's own item (BarItem), its
   * bubble, on the pressed surface while the rail stands (BarItem `open`). It is its
   * neighbours' size and shape, its bubble at their symbol size and centred,
   * with an even inset round it: the open comments' count is the bar's
   * count badge on its top trailing corner (the kit Badge `corner`; SwiftUI
   * badge: "Badges appear in list rows, tab bars, toolbar items, and
   * menus"), taking no room, only above 0 (The Earned Count Rule). While
   * comments wait on him (To check) the badge takes the needs-you pair and
   * its name says how many; while he holds comments to send together it is
   * hollow, a held pill's own look, and counts them. Comments not reaching
   * the agent draw the bubble in the fail ink; ⇧C's hidden pins put a
   * closed eye on the bubble's foot corner, opposite the badge. Each is
   * said in its name.
   */
  import { commentWords } from "@cawco/core/words/comments";
  import { BarItem } from "#lib/components/ui/bar-glass/index.js";
  import { IconChat, IconEyeClosed } from "#lib/icons.js";

  let {
    open,
    count,
    toCheck,
    held = 0,
    pinsShown = true,
    down = null,
    label,
    onclick,
    props = {},
  }: {
    /** The rail stands. */
    open: boolean;
    /** Open comments. */
    count: number;
    /** Comments waiting on him (To check). */
    toCheck: number;
    /** Comments he holds to send together. */
    held?: number;
    /** ⇧C has not hidden the pins. */
    pinsShown?: boolean;
    /** Why comments aren't reaching the agent, in words; null while they are. */
    down?: string | null;
    /** Its tooltip. */
    label: string;
    onclick?: () => void;
    /** A primitive's trigger props (a card hung from it), merged in. */
    props?: Record<string, unknown>;
  } = $props();

  /** How the badge is dressed: what waits on him, what he holds, or the count alone. */
  const look = $derived.by(() => {
    if (toCheck > 0) {
      return "attn" as const;
    }
    return held > 0 && count === 0 ? ("held" as const) : undefined;
  });

  const name = $derived(
    [
      commentWords.comments,
      count > 0 ? `${count} open` : null,
      toCheck > 0 ? commentWords.toCheckWaiting(toCheck) : null,
      held > 0 ? commentWords.heldWaiting(held) : null,
      pinsShown ? null : "pins hidden",
      down,
    ]
      .filter(Boolean)
      .join(", ")
  );
</script>

<BarItem
  count={count > 0 ? count : held}
  countLook={look}
  data-link-down={down ? "" : undefined}
  data-slot="comments"
  expanded={open}
  label={name}
  {open}
  {onclick}
  {props}
  tip={label}
  tone={down ? "fail" : "muted"}
>
  <IconChat aria-hidden="true" data-slot="bar-symbol" />
  {#if !pinsShown}
    <!-- ⇧C hid the pins: a closed eye on the bubble's foot corner, opposite
         the count, taking no room. -->
    <IconEyeClosed
      aria-hidden="true"
      class="pointer-events-none absolute end-space-row bottom-space-row size-icon-sm rounded-pill bg-surface-raised text-ink-muted"
      data-slot="pins-hidden"
    />
  {/if}
</BarItem>
