<script lang="ts">
  /**
   * The Comments rail's toggle in the artifact panel's head (the artifact
   * panel's surface brief, The head): the bar's own item (BarItem), its
   * bubble, standing open while the rail stands (BarItem `open`). It is its
   * neighbours' size and shape, its bubble at their symbol size and centred,
   * with an even inset round it. Its badge is the kit Badge's `corner`
   * form on the top trailing corner (SwiftUI badge: "Badges appear in list
   * rows, tab bars, toolbar items, and menus"), taking no room, only above 0
   * (The Earned Count Rule) and only while the rail is shut (the rail's
   * title says its count while it stands), and it says one count in that count's own
   * look: what waits on him (To check) in the needs-you pair, else what he
   * holds to send hollow, as a held pill is, else the open comments in
   * plain ink. Comments not reaching the agent draw the bubble in the fail
   * ink; ⇧C's hidden pins put a closed eye on the bubble's foot corner,
   * opposite the badge. Its name says every count.
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

  /**
   * The badge: one count in the look that says what it counts, never a
   * look over another's number. What waits on him first (To check, the
   * needs-you pair), then what he holds to send (hollow), else the open
   * comments (plain ink).
   */
  const badge = $derived.by(
    (): { n: number; look: "attn" | "held" | undefined } => {
      if (toCheck > 0) {
        return { n: toCheck, look: "attn" };
      }
      if (held > 0) {
        return { n: held, look: "held" };
      }
      return { n: count, look: undefined };
    }
  );

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
  count={open ? 0 : badge.n}
  countLook={badge.look}
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
