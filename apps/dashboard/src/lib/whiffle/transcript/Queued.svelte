<script lang="ts">
  /**
   * A message the session has been handed and has not started.
   *
   * The reader's own turn, at reduced presence: the same sunken well, the same
   * Who line, the same body — because it IS their message, and it will read
   * exactly like this once the session gets to it. What separates the two is
   * everything a turn earns by having happened: full presence, and a clock.
   * This has neither. The chip in the clock's place says why.
   *
   * No timestamp is rendered at all, not even the time it was queued. The time
   * the reader wants from a turn is when it was said, and this has not been
   * said yet — a time here would be a promise about the wrong moment.
   */
  import { dur } from "$lib/whiffle/motion/curves.svelte";
  import { land } from "$lib/whiffle/motion/share.svelte";
  import type { QueueEntry } from "../queue";
  import MessageBody from "./MessageBody.svelte";
  import Who from "./Who.svelte";

  let { queued }: { queued: QueueEntry } = $props();
</script>

<!-- Sent from this tab to a busy session, the row is drawn at the press and
     is the composer's text landing (motion/share, departed by Composer's
     submit); the daemon's announcement keeps the row, so the flight lands
     once. -->
<section
  class="turn you queued"
  {@attach land(
    () => queued.sentAs ? `sent:${queued.text}` : undefined,
    { ms: dur('--dur-pop'), uniform: true }
  )}
>
  <Who name="You" note="queued" you />
  <MessageBody source={queued.text} />
  {#if queued.images}
    <!-- The payloads never crossed the wire — the queue is broadcast state —
         so what is said is that pictures are riding with it, not which. -->
    <p class="carried">{queued.images} image{queued.images === 1 ? '' : 's'}</p>
  {/if}
</section>

<style>
  /* Deliberately MessageRow.svelte's `.turn.you`, rule for rule: the queued row
     is the reader's own turn and must sit on the same column, in the same well,
     at the same bleed. Svelte scopes styles per component, so the well is
     restated here rather than shared — the values are the ones to keep in step. */
  .turn {
    margin-top: var(--space-4);
  }
  .turn.you {
    margin-inline: calc(var(--space-4) * -1);
    padding: var(--space-3) var(--space-4);
    background: var(--surface-recess);
    border-radius: var(--radius-sm);
  }
  /* The whole difference, in one number: present, legible, and plainly not yet
     part of the conversation. */
  .queued {
    opacity: 0.7;
  }
  .carried {
    margin-top: var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  @media (max-width: 900px) {
    .turn.you {
      margin-inline: calc(var(--space-3) * -1);
      padding-inline: var(--space-3);
    }
  }
</style>
