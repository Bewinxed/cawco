<script lang="ts">
  import type { SetupLook } from "#lib/cawco/decisions/host/setup-look.js";
  import SetupPagePreview from "#lib/cawco/decisions/SetupPagePreview.svelte";
  /**
   * SETUP PAGE BENCH (dev only): the PR team's setup page on the decision
   * host's own components (SetupPagePreview), with no hub, standing alone
   * as Caw's Preview tab and a page's own tab draw it. While the cards
   * `stage-rest` and `setup-groups` are open, `?stages=reminders|notion`
   * and `?groups=document|cards` draw each option (setup-look.ts);
   * `?stages-case=long|one` draws twelve stages with long names, or one.
   */
  import { page } from "$app/state";

  const query = page.url.searchParams;
  const CASES = ["long", "one"] as const;
  const look: SetupLook = {
    stages: query.get("stages") === "notion" ? "notion" : "reminders",
    groups: query.get("groups") === "cards" ? "cards" : "document",
  };
</script>

<div class="h-dvh">
  <SetupPagePreview
    {look}
    stages={CASES.find((one) => one === query.get("stages-case")) ?? "team"}
  />
</div>
