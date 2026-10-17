<script lang="ts">
  /**
   * The pairing sheet's Needs you stop: Caw's real panel (CawPanel) on a
   * fixture feed holding one pairing, Scan code at its head's trailing edge
   * and the pairing row as the app shows it. Preview only.
   */
  import CawPanel from "../../home/CawPanel.svelte";
  import type { CawFeed } from "../../home/caw-feed.svelte";
  import type { NeedsItem } from "../../home/home-state.svelte";
  import { FIXTURE } from "./picks.svelte";

  const raisedAt = Date.now() - 20_000;
  const needs: NeedsItem[] = [
    {
      kind: "pairing",
      key: `pairing:${FIXTURE.code}`,
      href: "/config/devices",
      place: FIXTURE.address,
      raisedAt,
      title: FIXTURE.device,
      request: {
        address: FIXTURE.address,
        at: raisedAt,
        kind: "app",
        name: FIXTURE.device,
        userCode: FIXTURE.code,
      },
    },
  ];

  const feed: CawFeed = {
    live: true,
    connected: true,
    needs,
    updated: null,
    moved: [],
    rebalanced: [],
    noticesDamaged: null,
    resetNotices: () => Promise.resolve(),
    acknowledge: () => undefined,
    dismissUpdate: () => undefined,
    actOnUpdate: () => undefined,
  };
</script>

<!-- The panel's own card, as it hangs from Caw's glass. -->
<div class="needs">
  <div class="kit-pop caw-pop">
    <CawPanel
      {feed}
      onchoose={() => undefined}
      onscan={() => undefined}
      quiet="All caught up"
    />
  </div>
</div>

<style>
  /* On a phone the panel is the screen's width less its margin; here it
     stands in the sheet's frame, so the frame bounds it too. */
  .needs > :global(.kit-pop.caw-pop) {
    max-inline-size: 100%;
  }
</style>
