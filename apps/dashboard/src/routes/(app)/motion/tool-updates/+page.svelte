<script lang="ts">
  /**
   * Configure › Command-line tools' bench: the built screen (OutOfDate, the
   * tool ledgers) in Configure's shell, over a fleet fourteen minutes after
   * a release (fixtures.ts), its cells read through core tool-updates.ts as
   * a live fleet's are. Nothing here reaches a hub: the switch writes this
   * page's own value, and a press is refused by the stood hub.
   *
   * `?updates=ask`  The fleet set to Ask me.
   * `?fleet=one`    One machine; `?fleet=current` nothing behind.
   * `?caw`          Caw's panel open on Needs you.
   * `?block`        A session's harness block while CawCo updates OpenCode.
   * `?theme=dark`   Drawn dark (`light` back); the reader's theme otherwise.
   */
  import { harnessSpec } from "@cawco/core/harness-refusal";
  import { TOOL_CATALOG, type ToolUpdates } from "@cawco/core/tools";
  import { onMount } from "svelte";
  import ConfigRail from "#lib/cawco/config/ConfigRail.svelte";
  import SectionFrame from "#lib/cawco/config/SectionFrame.svelte";
  import { sectionOf } from "#lib/cawco/config/sections.js";
  import {
    ConfigStore,
    provideConfig,
  } from "#lib/cawco/config/store.svelte.js";
  import HarnessBlock from "#lib/cawco/HarnessBlock.svelte";
  import CawBenchPop from "#lib/cawco/home/CawBenchPop.svelte";
  import type { CawFeed } from "#lib/cawco/home/caw-feed.svelte.js";
  import { toolNeedsOf } from "#lib/cawco/home/tool-needs.js";
  import OutOfDate from "#lib/cawco/OutOfDate.svelte";
  import ToolMatrix from "#lib/cawco/ToolMatrix.svelte";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";
  import { stageUsage } from "../usage-relay/stage";
  import { fleet, RELEASES } from "./fixtures";

  const caw = page.url.searchParams.has("caw");
  const block = page.url.searchParams.has("block");
  const machines = fleet(page.url.searchParams.get("fleet"));
  let updates = $state<ToolUpdates>(
    page.url.searchParams.get("updates") === "ask" ? "ask" : "update"
  );
  const section = sectionOf("cli-tools");
  provideConfig(new ConfigStore());

  // The shell as a reached hub draws it, with nothing running.
  onMount(() => {
    const scheme = page.url.searchParams.get("theme");
    if (scheme === "dark" || scheme === "light") {
      theme.set(scheme);
    }
    window.__cawcoDebug.standHub(() => undefined);
    window.__cawcoDebug.boardState.machines = machines;
    stageUsage(2);
  });

  const feed: CawFeed = $derived({
    live: true,
    connected: true,
    needs: toolNeedsOf(machines, updates, RELEASES),
    updated: null,
    moved: [],
    rebalanced: [],
    artifactNotices: [],
    noticesDamaged: null,
    resetNotices: () => Promise.resolve(),
    acknowledge: () => undefined,
    dismissUpdate: () => undefined,
    actOnUpdate: () => undefined,
  });
</script>

{#if caw}
  <CawBenchPop {feed} />
{/if}

<div
  class="flex min-h-0 min-w-0 flex-auto bg-surface-recess"
  data-bench="tool-updates"
>
  <div class="flex min-h-0 py-space-2 pl-space-5 max-desk:hidden">
    <ConfigRail current="cli-tools" />
  </div>
  <SectionFrame {section}>
    {#if block}
      <HarnessBlock
        block={{
          harness: "opencode",
          kind: "version",
          machine: "obelisk-of-light",
          spec: harnessSpec("opencode"),
          why: "OpenCode 2.0.29 on obelisk-of-light isn't one CawCo runs: it runs 2.3.0.",
          fix: {
            phase: "running",
            byCawco: true,
            byPerson: false,
            to: "2.3.0",
          },
          auto: true,
        }}
        machineId="m-obelisk"
        online
      />
    {/if}
    <OutOfDate
      catalog={TOOL_CATALOG}
      {machines}
      releases={RELEASES}
      updateAll={() => Promise.resolve()}
      {updates}
      write={(next) => {
        updates = next;
        return Promise.resolve();
      }}
    />
    <ToolMatrix
      catalog={TOOL_CATALOG}
      {machines}
      policies={[]}
      releases={RELEASES}
      {updates}
    />
  </SectionFrame>
</div>
