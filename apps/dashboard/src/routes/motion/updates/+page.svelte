<script lang="ts">
  /**
   * UPDATE STATES — every look of the update screens from fixtures, with no
   * hub needed: the channel cards (the fleet on Stable, then on Nightly with
   * Stable chosen), one table row for each row of the Update cell, and the
   * seven notices as the update row of Caw's panel.
   */
  import { machineLabel } from "@cawco/core";
  import type {
    BinaryUpdateChannels,
    BinaryUpdatePolicy,
    BinaryUpdateState,
  } from "@cawco/core/binary-updates";
  import UpdateCard from "#lib/cawco/home/UpdateCard.svelte";
  import { reflow } from "#lib/cawco/motion/rows.svelte.js";
  import ChannelCards from "#lib/cawco/updates/ChannelCards.svelte";
  import {
    type Notice,
    type NoticeInput,
    noticeFor,
    type UpdateMachine,
    updatedNotice,
  } from "#lib/cawco/updates/model.js";
  import UpdateTable from "#lib/cawco/updates/UpdateTable.svelte";

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
    "- Telegram approvals arrive once",
    "- Install state survives a restart",
    "- Rollbacks name the build they undid",
    "- A `cawco update` started twice no longer installs twice",
  ].join("\n");
  /** Notes written before sections: bullet lines under no heading. */
  const PLAIN_NOTES = [
    "- Sessions reopen where you left them",
    "- Long transcripts load faster",
    "- Telegram approvals arrive once",
    "- Install state survives a restart",
    "- Rollbacks name the build they undid",
  ].join("\n");
  const NIGHTLY = "0.2.0-nightly.412+abc123def456";
  /** What a ready build waits on: two relayed tool calls and an image generation. */
  const WAITING_ON: BinaryUpdateState["waitingOn"] = [
    { reason: "tool-call", ids: ["delegate#3f2a91c0", "start_session#8b1e"] },
    { reason: "image", ids: ["image-request-1"] },
  ];

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
      binaryUpdate: update({ phase: "downloading" }),
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
  ];

  const OFF: BinaryUpdatePolicy = { autoUpdate: false, channel: "stable" };
  const ON: BinaryUpdatePolicy = { autoUpdate: true, channel: "stable" };

  const input = (over: Partial<NoticeInput>): NoticeInput => ({
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
    noticeFor(
      input({ newerBuild: "e3cbba1", machines: trio([{}, {}, {}]) }),
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

  /** A landing's notice in a tab older than the dashboard: notes, Configure and Reload. */
  const UPDATED_RELOAD = noticeFor(
    input({
      newerBuild: "e3cbba1",
      machines: trio([
        { phase: "installed", installedVersion: "1.4.2", landed: LANDED },
        {},
        {},
      ]),
    }),
    machineLabel
  ) as Notice;

  /**
   * The row in a tab older than the dashboard, which the acknowledgement
   * drops as Reload is chosen. Reload here does not reload: the notice goes
   * at once, so the goodbye can be seen to stand on its own until the tab
   * would go.
   */
  let reloadRow = $state<Notice | null>(UPDATED_RELOAD);
  function rowAction(action: NonNullable<Notice["action"]>) {
    if (action === "reload") {
      reloadRow = null;
    }
  }
  const noop = () => undefined;
</script>

<svelte:head><title>Update states · CawCo</title></svelte:head>

<main>
  <h1>Channel cards</h1>
  <section class="card" data-states="cards-stable">
    <p>The fleet follows Stable; Stable chosen.</p>
    <ChannelCards channels={CHANNELS} chosen="stable" current="stable" />
  </section>
  <section class="card" data-states="cards-nightly">
    <p>The fleet follows Nightly; Stable chosen.</p>
    <ChannelCards channels={CHANNELS} chosen="stable" current="nightly" />
  </section>

  <h1>Update cell, rows 1 to 12</h1>
  <section class="card" data-states="table">
    <UpdateTable machines={ROWS} policy={OFF} />
  </section>

  <h1>Notices 1 to 7, as the update row of Caw's panel</h1>
  <div class="notices" data-states="notices">
    {#each NOTICES as notice (notice.kind)}
      <div class="kit-pop panel" data-notice={notice.kind}>
        <UpdateCard {notice} onaction={noop} ondismiss={noop} />
      </div>
    {/each}
  </div>

  <h1>Updated, with notes written before sections</h1>
  <div class="notices" data-states="notice-plain">
    <div class="kit-pop panel" data-notice="plain">
      <UpdateCard notice={UPDATED_PLAIN} onaction={noop} ondismiss={noop} />
    </div>
  </div>

  <h1>Updated, in a tab older than the dashboard: Reload says goodbye</h1>
  <!-- As the panel has it: the row in a `reflow`, a row under it. -->
  <div class="kit-pop panel" data-states="notice-reload" {@attach reflow()}>
    <div data-flip="box">
      <UpdateCard notice={reloadRow} onaction={rowAction} ondismiss={noop} />
    </div>
    <div class="under" data-flip="box">
      The next row of the panel follows the row's edge
    </div>
  </div>
  <div class="notices" data-states="update-card">
    <div class="kit-pop panel">
      <UpdateCard notice={UPDATED} onaction={noop} ondismiss={noop} />
    </div>
  </div>
</main>

<style>
  main {
    display: grid;
    gap: var(--space-5);
    max-inline-size: 980px;
    margin-inline: auto;
    padding: var(--space-6);
  }
  h1 {
    font: var(--type-title);
  }
  .card {
    padding: 18px;
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    box-shadow: var(--shadow-tile);
  }
  .card p {
    margin-bottom: var(--space-2);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .notices {
    display: grid;
    grid-template-columns: repeat(auto-fill, minmax(380px, 1fr));
    align-items: start;
    gap: var(--space-5);
  }
  /* The panel's own width (NeedsCaw). */
  .panel {
    inline-size: 380px;
  }
  .under {
    padding: var(--space-3);
    border-block-start: 1px solid var(--border-hairline);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
</style>
