<script lang="ts">
  /**
   * Under a control the hub or a service refused: its words, announced, and
   * one act that sends the same change again.
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconWarningTriangle } from "#lib/icons.js";
  import { words } from "./words";

  let {
    said,
    disabled,
    onretry,
  }: {
    /** The refusal in the hub's or the service's own words. */
    said: string;
    disabled: boolean;
    onretry: () => void;
  } = $props();
</script>

<Alert aria-live="assertive" layout="row" variant="destructive">
  <IconWarningTriangle aria-hidden="true" />
  <AlertDescription>{said}</AlertDescription>
  <AlertAction>
    <Button {disabled} onclick={onretry} size="xs" variant="outline">
      {words.hub.tryAgain}
    </Button>
  </AlertAction>
</Alert>
