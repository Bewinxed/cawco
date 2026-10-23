<script lang="ts">
  /**
   * A machine whose fleet items didn't set up, in the machines list's own
   * row and fault lines, with no hub: niftybot.art as the hub held it on
   * 2026-10-23, 141 of 141 items failed with one cause (OpenCode not
   * installed there; the bench gives its own words for it), beside a
   * machine whose failures have three causes (two items with one, one with
   * a long unbroken path, one with none). It
   * stands on the floating surface at the machines card's width,
   * `--c-machines-w`, and no wider than the page's column (a phone's), with
   * the list's own insets (MachinesList `--fault-indent`, `--fault-end`).
   */
  import type { FleetItemStatus } from "@cawco/core";
  import ItemFaults from "#lib/cawco/ItemFaults.svelte";
  import {
    MachineRow,
    machineHue,
    machineIcon,
  } from "#lib/components/ui/machine-row/index.js";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";

  /** One cause for all 141, as the agent joins a harness's thrown converge (session.ts `#harnessFailures`): the harness, then its words. */
  const OPENCODE =
    "opencode: Error: the bench's one cause, given for every item of the pass alike";
  const MCP = [
    "Exa_ai",
    "hig",
    "backlot",
    "chrome-devtools",
    "rive",
    "MobileBuildMCP",
    "x-browser",
    "ElevenLabs",
    "mail-setup-browser",
    "crw",
    "brave",
    "mobbin-web",
  ];
  const SKILLS = [
    "designing-skills-and-tools",
    "svelte-house-rules",
    "moderncss",
    "ui-observer",
    "skills",
    "unlazy",
    "interface-craft",
  ];
  const failed = (id: string, error?: string): FleetItemStatus => ({
    id,
    hash: "bench",
    state: "failed",
    ...(error ? { error } : {}),
  });
  /** 141 items: the hub-only list, the policy, 12 servers and 127 skills, every one failed for the one cause. */
  const NIFTY: FleetItemStatus[] = [
    failed("hubOnly", OPENCODE),
    failed("policy", OPENCODE),
    ...MCP.map((name) => failed(`mcp:${name}`, OPENCODE)),
    ...SKILLS.map((name) => failed(`skill:${name}`, OPENCODE)),
    ...Array.from({ length: 141 - 2 - MCP.length - SKILLS.length }, (_, n) =>
      failed(`skill:bench-skill-${String(n + 1).padStart(3, "0")}`, OPENCODE)
    ),
  ];
  const MIXED: FleetItemStatus[] = [
    failed(
      "mcp:crw",
      'claude: MCP server "crw" connection timed out after 30000ms'
    ),
    failed(
      "mcp:brave",
      'claude: MCP server "crw" connection timed out after 30000ms'
    ),
    failed(
      "skill:svelte-house-rules",
      "EACCES: permission denied, open '/srv/bench/skills/svelte-house-rules/references/a-very-long-file-name-that-does-not-break-on-its-own.md'"
    ),
    failed("memory"),
    { id: "skill:unlazy", hash: "bench", state: "ok" },
  ];
  const MACHINES = [
    { name: "niftybot.art", os: "linux", items: NIFTY, live: 0 },
    { name: "obelisk-of-light", os: "linux", items: MIXED, live: 11 },
  ];
  const panel = floatingSurface({
    class: "mx-auto my-space-5 w-full max-w-c-machines-w p-space-1",
  });
</script>

<div class={panel} data-bench data-cause={OPENCODE}>
  <ul data-slot="list" class="m-0 flex list-none flex-col gap-space-row p-0">
    {#each MACHINES as machine, index (machine.name)}
      {@const failedCount = machine.items.filter(
        (item) => item.state === "failed"
      ).length}
      <li
        data-machine={machine.name}
        style:--fault-end="var(--space-2)"
        style:--fault-indent="calc(var(--space-2) * 2 + var(--icon-md))"
      >
        <div
          data-slot="row"
          class="flex w-full min-h-space-8 items-center gap-space-2 rounded-sm px-space-2 py-space-1 text-ink-strong coarse:min-h-c-row-h"
        >
          <MachineRow
            hue={machineHue(index, true)}
            icon={machineIcon(machine.os)}
            meta={`${machine.live} live · ${failedCount} of ${machine.items.length} not set up`}
            name={machine.name}
            presence="away"
          />
        </div>
        <ItemFaults items={machine.items} retry={() => undefined} />
      </li>
    {/each}
  </ul>
</div>
