<script lang="ts">
  /**
   * BUTTON BENCH: the kit Button's label in the cell it shares with its
   * pending wording (pending-content `.kit-words`), at rest and pending,
   * label-only and beside a rest icon. hub-states reads each one's rects:
   * a label-only wording at the button's centre, a wording beside an icon
   * at its start, right after the slot.
   */
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRefresh } from "#lib/icons.js";
</script>

<div class="bench">
  <Button data-case="label-rest" label="Save" pendingLabel="Saving…" />
  <Button
    data-case="label-pending"
    label="Save"
    pending
    pendingLabel="Saving…"
  />
  <Button
    data-case="icon-rest"
    icon={IconRefresh}
    label="Save"
    pendingLabel="Saving…"
  />
  <Button
    data-case="icon-pending"
    icon={IconRefresh}
    label="Save"
    pending
    pendingLabel="Saving…"
  />
</div>

<style>
  .bench {
    display: flex;
    flex-wrap: wrap;
    gap: var(--space-4);
    padding: var(--space-7);
  }
</style>
