<script lang="ts">
  import { commonWords } from "@cawco/core";
  /**
   * BUTTON BENCH: the kit Button's label and its pending wording
   * (pending-content), read by the `button-pending` spec. A label-only
   * button cycles through rest, pending and done on
   * `window.__buttonBench` (`start`, then `stop`, the work ending well);
   * the icon cases stand still; and every label-only call site that gives
   * a literal `pendingLabel` stands at rest, for its width.
   */
  import { onMount } from "svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { IconRefresh } from "#lib/icons.js";

  let cycling = $state(false);
  onMount(() => {
    (
      window as unknown as {
        __buttonBench: { start: () => void; stop: () => void };
      }
    ).__buttonBench = {
      start: () => {
        cycling = true;
      },
      stop: () => {
        cycling = false;
      },
    };
  });
</script>

<div class="flex flex-wrap items-box-start gap-space-4 p-space-7">
  <Button
    data-case="label-cycle"
    label="Save"
    pending={cycling}
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
<div class="flex flex-wrap items-box-start gap-space-4 p-space-7">
  <Button
    data-site="lib/cawco/HubBand.svelte:268"
    label="Reconnect now"
    pendingLabel="Reconnecting…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="lib/cawco/config/FetchSkillPopover.svelte:232"
    label="Fetch skill"
    pendingLabel="Fetching…"
    size="default"
    variant="default"
  />
  <Button
    data-site="lib/cawco/config/LinkMarketplacePopover.svelte:197"
    label="Link"
    pendingLabel="Linking…"
    size="default"
    variant="default"
  />
  <Button
    data-site="lib/cawco/config/NewMemoryPopover.svelte:125"
    label="Create and open"
    pendingLabel="Creating…"
    size="default"
    variant="default"
  />
  <Button
    data-site="lib/cawco/home/CawPanel.svelte:213"
    label="Reset"
    pendingLabel="Resetting…"
    size="xs"
    variant="secondary"
  />
  <Button
    data-site="lib/cawco/move/MoveWait.svelte:543"
    label="Cancel"
    pendingLabel="Stopping…"
    size="sm"
    variant="secondary"
  />
  <Button
    data-site="lib/cawco/move/MoveWait.svelte:553"
    label="Retry"
    pendingLabel="Retrying…"
    size="sm"
    variant="secondary"
  />
  <Button
    data-site="lib/cawco/move/MoveWait.svelte:585"
    label="Cancel"
    pendingLabel="Stopping…"
    size="default"
    variant="secondary"
  />
  <Button
    data-site="lib/cawco/preview/PreviewPane.svelte:2075"
    label={commonWords.tryAgain}
    pendingLabel="Reloading…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="lib/cawco/preview/PreviewPane.svelte:2084"
    label={commonWords.tryAgain}
    pendingLabel="Closing…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="lib/cawco/project/ProjectDetails.svelte:406"
    label="Add"
    pendingLabel="Adding…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/project/ProjectHead.svelte:521"
    label="Start"
    pendingLabel="Starting…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/tasks/NewTaskForm.svelte:114"
    label="Add task"
    pendingLabel="Adding…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/tasks/TaskNeeds.svelte:236"
    label={commonWords.tryAgain}
    pendingLabel="Starting…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/tasks/TaskReview.svelte:437"
    label={commonWords.tryAgain}
    pendingLabel="Starting…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/tasks/TaskReview.svelte:445"
    label="Approve → Review"
    pendingLabel="Approving…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/tasks/TaskReview.svelte:499"
    label="Send back → In progress"
    pendingLabel="Sending back…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/tasks/TextSection.svelte:93"
    label="Save"
    pendingLabel="Saving…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="lib/cawco/transcript/DelegateTray.svelte:1311"
    label="Dismiss"
    pendingLabel="Dismissing…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="lib/cawco/transcript/DelegateTray.svelte:1548"
    label="Dismiss all"
    pendingLabel="Dismissing…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="lib/cawco/transcript/Prompt.svelte:866"
    label="Dismiss"
    pendingLabel="Dismissing…"
    size="default"
    variant="outline"
  />
  <Button
    data-site="lib/cawco/usage/ProjectSpend.svelte:337"
    label="Save"
    pendingLabel="Saving…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="lib/cawco/usage/ProjectSpend.svelte:409"
    label="Save"
    pendingLabel="Saving…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/connections/+page.svelte:483"
    label="Sign in"
    pendingLabel="Signing in…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/connections/+page.svelte:591"
    label="Save key"
    pendingLabel="Saving…"
    size="xs"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/devices/+page.svelte:178"
    label="Require paired devices"
    pendingLabel="Pairing this browser…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/devices/+page.svelte:204"
    label="Stop requiring paired devices"
    pendingLabel="Stopping…"
    size="sm"
    variant="grant"
  />
  <Button
    data-site="routes/(app)/config/models/+page.svelte:310"
    label="Disconnect"
    pendingLabel="Disconnecting…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="routes/(app)/config/models/+page.svelte:320"
    label="Connect OpenRouter"
    pendingLabel="Opening OpenRouter…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/models/+page.svelte:394"
    label="Remove key"
    pendingLabel="Removing…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="routes/(app)/config/models/+page.svelte:404"
    label="Save key"
    pendingLabel="Saving…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/phone/+page.svelte:138"
    label="Send test push"
    pendingLabel="Sending…"
    size="sm"
    variant="outline"
  />
  <Button
    data-site="routes/(app)/config/previews/+page.svelte:210"
    label="Save"
    pendingLabel="Saving…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/subagents/+page.svelte:177"
    label="Push to machines"
    pendingLabel="Pushing…"
    size="default"
    variant="outline"
  />
  <Button
    data-site="routes/(app)/config/updates/+page.svelte:157"
    label="Reset"
    pendingLabel="Resetting…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/updates/+page.svelte:184"
    label="Switch to Nightly"
    pendingLabel="Switching…"
    size="sm"
    variant="default"
  />
  <Button
    data-site="routes/(app)/config/updates/+page.svelte:259"
    label={commonWords.checkForUpdates}
    pendingLabel="Checking…"
    size="sm"
    variant="outline"
  />
</div>
