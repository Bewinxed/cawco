<script lang="ts">
  import type {
    BinaryUpdateChannels,
    BinaryUpdatePolicy,
    BinaryUpdateState,
    KeptProcess,
  } from "@cawco/core/binary-updates";
  /**
   * UPDATE STATES — every look of the update screens from fixtures, with no
   * hub needed: the channel cards (the fleet on Stable, then on Nightly with
   * Stable chosen), one table row for each row of the Update cell (row 12
   * also with a keeper handing over, and with one kept for what its unit
   * holds), and the
   * notices as the update row of Caw's panel.
   */
  import { machineLabel } from "@cawco/core/machine-names";
  import UpdateCard from "#lib/cawco/home/UpdateCard.svelte";
  import ChannelCards from "#lib/cawco/updates/ChannelCards.svelte";
  import {
    type Notice,
    type NoticeInput,
    noticeFor,
    type UpdateMachine,
    updatedNotice,
  } from "#lib/cawco/updates/model.js";
  import UpdateTable from "#lib/cawco/updates/UpdateTable.svelte";
  import { floatingSurface } from "#lib/components/ui/popover/index.js";

  /**
   * Caw's panel as the notices stand in it: the kit's floating surface at the
   * panel's width, and no wider than the page's column (a phone's).
   */
  const panel = floatingSurface({ class: "w-full max-w-c-panel-w" });
  /** The notice grids: panels at their width where it fits, the column's where not. */
  const NOTICE_COLS =
    "repeat(auto-fill, minmax(min(100%, var(--c-panel-w)), 1fr))";

  /** Notes as every release writes them (docs/releases/README.md). */
  const NOTES = [
    "### New",
    "",
    "- Sessions reopen where you left them",
    "- The update notice opens to every change in the build",
    "",
    "### Improved",
    "",
    "- Long transcripts load faster",
    "- The channel cards remember your pick",
    "- Fewer hub restarts",
    "",
    "### Fixed",
    "",
    "- Push approvals arrive once",
    "- Install state survives a restart",
    "- Rollbacks name the build they undid",
    "- A `cawco update` started twice no longer installs twice",
  ].join("\n");
  /** Notes written before sections: bullet lines under no heading. */
  const PLAIN_NOTES = [
    "- Sessions reopen where you left them",
    "- Long transcripts load faster",
    "- Push approvals arrive once",
    "- Install state survives a restart",
    "- Rollbacks name the build they undid",
  ].join("\n");
  const NIGHTLY = "0.2.0-nightly.412+abc123def456";
  /** What a ready build waits on: two relayed tool calls and an image generation. */
  const WAITING_ON: BinaryUpdateState["waitingOn"] = [
    { reason: "tool-call", ids: ["delegate#3f2a91c0", "start_session#8b1e"] },
    { reason: "image", ids: ["image-request-1"] },
  ];

  /** What keeps a keeper: a container's conmon an old session left in its unit, and a stray sleep. */
  const CONMON: KeptProcess[] = [
    {
      pid: 1_234_567,
      command:
        // biome-ignore lint/plugin/no-system-path: display text, a kept process's command line as ps shows it; nothing runs it.
        "/usr/bin/conmon --api-version 1 -c 4f2a91c03b1e8b1e4f2a91c03b1e8b1e -u 4f2a91c03b1e8b1e4f2a91c03b1e8b1e -r /usr/bin/crun -b /home/cawco/.local/share/containers/storage/overlay-containers/4f2a91c0/userdata",
    },
  ];
  const SLEEP: KeptProcess = { pid: 88_421, command: "sleep 86400" };

  const CHANNELS: BinaryUpdateChannels = {
    checkedAt: 0,
    channels: {
      stable: { version: "1.4.2", sequence: 90, notes: NOTES },
      nightly: { version: NIGHTLY, sequence: 412, notes: NOTES },
    },
  };

  const update = (over: Partial<BinaryUpdateState>): BinaryUpdateState => ({
    channel: "stable",
    installedVersion: "1.4.1",
    availableVersion: "1.4.2",
    hostsHub: false,
    notes: NOTES,
    phase: "none",
    updatedAt: 1,
    ...over,
  });

  type Fixture = UpdateMachine & { os: string };
  const machine = (
    id: string,
    hostname: string,
    os: string,
    over: Partial<Fixture> = {}
  ): Fixture => ({
    machineId: id,
    hostname,
    os,
    status: "online",
    ...over,
  });
  const NAMES = [
    ["m1", "obelisk-of-light", "linux"],
    ["m2", "Omars-MacBook-Pro", "darwin"],
    ["m3", "nixbox", "linux"],
  ] as const;
  const trio = (
    states: Partial<BinaryUpdateState>[],
    hub?: number
  ): Fixture[] =>
    NAMES.map(([id, host, os], i) =>
      machine(id, host, os, {
        binaryUpdate: update({ ...states[i], hostsHub: hub === i }),
      })
    );

  // One row of the table for each row of the Update cell.
  const ROWS: Fixture[] = [
    machine("r1", "nixbox", "linux", {
      status: "offline",
      binaryUpdate: update({ phase: "available" }),
    }),
    machine("r2", "Omars-MacBook-Pro", "darwin", {
      build: { commit: "abc1234def" },
    }),
    machine("r3", "obelisk-of-light", "linux", {
      binaryUpdate: update({
        phase: "failed-rolled-back",
        failedVersion: "1.4.2",
        error: "The new build did not become healthy.",
      }),
    }),
    machine("r4", "nixbox", "linux", {
      binaryUpdate: update({ phase: "failed", error: "Download failed." }),
    }),
    machine("r5", "Omars-MacBook-Pro", "darwin", {
      binaryUpdate: update({ phase: "installing" }),
    }),
    machine("r6", "obelisk-of-light", "linux", {
      binaryUpdate: update({
        phase: "downloading",
        download: { received: 45_200_000, total: 117_733_127 },
      }),
    }),
    machine("r7", "nixbox", "linux", {
      binaryUpdate: update({ phase: "ready", waitingOn: WAITING_ON }),
    }),
    machine("r8", "Omars-MacBook-Pro", "darwin", {
      binaryUpdate: update({
        phase: "waiting-sessions",
        installedVersion: "1.4.2",
      }),
    }),
    machine("r9", "obelisk-of-light", "linux", {
      binaryUpdate: update({ phase: "waiting-sessions", heldChildren: 2 }),
    }),
    machine("r10", "nixbox", "linux", {
      binaryUpdate: update({
        phase: "waiting-for-channel",
        channel: "nightly",
        installedVersion: NIGHTLY,
        availableVersion: undefined,
      }),
    }),
    machine("r11", "Omars-MacBook-Pro", "darwin", {
      binaryUpdate: update({ phase: "available" }),
    }),
    machine("r12", "obelisk-of-light", "linux", {
      binaryUpdate: update({ phase: "none", installedVersion: "1.4.2" }),
    }),
    machine("r12-handing", "nixbox", "linux", {
      binaryUpdate: update({
        phase: "none",
        installedVersion: "1.4.2",
        retiringKeepers: [{ version: NIGHTLY, sessions: 3 }],
      }),
    }),
    machine("r12-kept", "obelisk-of-light", "linux", {
      binaryUpdate: update({
        phase: "none",
        installedVersion: "1.4.2",
        retiringKeepers: [{ version: NIGHTLY, sessions: 0, kept: CONMON }],
      }),
    }),
    machine("r12-silent", "nixbox", "linux", {
      binaryUpdate: update({
        phase: "none",
        installedVersion: "1.4.2",
        retiringKeepers: [
          { version: "1.4.1", sessions: 3, notAnswering: true },
        ],
      }),
    }),
    machine("r13", "nixbox", "linux", {
      binaryUpdate: update({
        phase: "none",
        installedVersion: "1.4.2",
        sessiondKept: [CONMON[0] as KeptProcess, SLEEP],
      }),
    }),
    machine("r14", "Omars-MacBook-Pro", "darwin", {
      binaryUpdate: update({ phase: "waiting-for-hub", hubWait: "behind" }),
    }),
    machine("r14-unanswered", "obelisk-of-light", "linux", {
      binaryUpdate: update({ phase: "waiting-for-hub", hubWait: "unanswered" }),
    }),
    machine("r14-trial", "nixbox", "linux", {
      binaryUpdate: update({ phase: "waiting-for-hub", hubWait: "trial" }),
    }),
  ];

  const OFF: BinaryUpdatePolicy = { autoUpdate: false, channel: "stable" };
  const ON: BinaryUpdatePolicy = { autoUpdate: true, channel: "stable" };

  const input = (over: Partial<NoticeInput>): NoticeInput => ({
    refused: new Map(),
    commanded: new Set(),
    machines: [],
    newerBuild: null,
    policy: OFF,
    seen: new Set(),
    ...over,
  });
  const LANDED = {
    at: 1,
    outcome: "installed",
    version: "1.4.2",
    notes: NOTES,
  } as const;
  const NOTICES: Notice[] = [
    noticeFor(
      input({
        machines: trio([
          {},
          {},
          {
            phase: "failed-rolled-back",
            failedVersion: "1.4.2",
            landed: { at: 1, outcome: "rolled-back", version: "1.4.2" },
          },
        ]),
      }),
      machineLabel
    ),
    noticeFor(
      input({
        commanded: new Set(["m1", "m2", "m3"]),
        machines: trio(
          [
            { phase: "installing" },
            { phase: "installed", installedVersion: "1.4.2" },
            { phase: "ready" },
          ],
          0
        ),
      }),
      machineLabel
    ),
    noticeFor(
      input({
        commanded: new Set(["m1", "m2", "m3"]),
        machines: trio([
          { phase: "installed", installedVersion: "1.4.2" },
          { phase: "installed", installedVersion: "1.4.2" },
          { phase: "installed", installedVersion: "1.4.2" },
        ]),
      }),
      machineLabel
    ),
    noticeFor(
      input({
        machines: trio([{ phase: "available" }, { phase: "available" }, {}]),
      }),
      machineLabel
    ),
    noticeFor(
      input({
        policy: ON,
        machines: trio([{ phase: "ready", waitingOn: WAITING_ON }, {}, {}]),
      }),
      machineLabel
    ),
    noticeFor(
      input({
        policy: ON,
        machines: trio([
          { phase: "installed", installedVersion: "1.4.2", landed: LANDED },
          {},
          {},
        ]),
      }),
      machineLabel
    ),
  ].filter((notice): notice is Notice => notice !== null);

  const UPDATED = updatedNotice(
    trio([
      { phase: "installed", installedVersion: "1.4.2", landed: LANDED },
      {},
      {},
    ])
  ) as Notice;
  const UPDATED_PLAIN = updatedNotice(
    trio([
      {
        phase: "installed",
        installedVersion: "1.4.2",
        landed: { ...LANDED, notes: PLAIN_NOTES },
      },
      {},
      {},
    ])
  ) as Notice;

  const noop = () => undefined;
</script>

<svelte:head><title>Update states · CawCo</title></svelte:head>

<!-- One column the viewport's width at most (minmax(0, 1fr)), so the page
     holds the screen, and the notice grids' panels keep their 380px only
     where it fits (min(100%, …)): on a phone each takes the column. -->
<main
  class="mx-auto grid w-full max-w-decisions-900px grid-cols-(--main-cols) gap-space-5 p-space-6 max-phone:px-space-5"
  style:--main-cols="minmax(0, 1fr)"
  style:--notice-cols={NOTICE_COLS}
>
  <h1 class="type-title">Channel cards</h1>
  <section
    data-slot="updates-page-card"
    class="rounded-lg bg-surface-raised p-space-5 shadow-tile"
    data-states="cards-stable"
  >
    <p class="type-meta mb-space-2 text-ink-muted">
      The fleet follows Stable; Stable chosen.
    </p>
    <ChannelCards channels={CHANNELS} chosen="stable" current="stable" />
  </section>
  <section
    data-slot="updates-page-card"
    class="rounded-lg bg-surface-raised p-space-5 shadow-tile"
    data-states="cards-nightly"
  >
    <p class="type-meta mb-space-2 text-ink-muted">
      The fleet follows Nightly; Stable chosen.
    </p>
    <ChannelCards channels={CHANNELS} chosen="stable" current="nightly" />
  </section>

  <h1 class="type-title">Update cell, rows 1 to 13</h1>
  <section
    data-slot="updates-page-card"
    class="rounded-lg bg-surface-raised p-space-5 shadow-tile"
    data-states="table"
  >
    <UpdateTable machines={ROWS} policy={OFF} />
  </section>

  <h1 class="type-title">Notices, as the update row of Caw's panel</h1>
  <div
    data-slot="notices"
    class="grid grid-cols-(--notice-cols) items-box-start gap-space-5"
    data-states="notices"
  >
    {#each NOTICES as notice (notice.kind)}
      <div class={panel} data-notice={notice.kind}>
        <UpdateCard alone={false} {notice} onaction={noop} ondismiss={noop} />
      </div>
    {/each}
  </div>

  <h1 class="type-title">Updated, with notes written before sections</h1>
  <div
    data-slot="notices"
    class="grid grid-cols-(--notice-cols) items-box-start gap-space-5"
    data-states="notice-plain"
  >
    <div class={panel} data-notice="plain">
      <UpdateCard
        alone
        notice={UPDATED_PLAIN}
        onaction={noop}
        ondismiss={noop}
      />
    </div>
  </div>

  <div
    data-slot="notices"
    class="grid grid-cols-(--notice-cols) items-box-start gap-space-5"
    data-states="update-card"
  >
    <div class={panel}>
      <UpdateCard alone notice={UPDATED} onaction={noop} ondismiss={noop} />
    </div>
  </div>
</main>
