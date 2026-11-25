<script lang="ts" module>
  /** A machine as a row shows it. */
  export interface PieceMachine {
    badge: string;
    icon: "cpu" | "key" | "folder";
    live?: boolean;
    meta: string;
    name: string;
  }

  /** A session as its card shows it. */
  export interface PieceSession {
    status: string;
    summary: string;
    title: string;
  }

  /** A file as its picture card shows it. */
  export interface PieceFile {
    kind: string;
    name: string;
    picture: string;
    state: string;
  }

  /** The pieces the kit's skeletons are captured from and stand for. */
  export type PieceName = "rows" | "card" | "picture";

  /** Two of the same row: a list is captured with two, its skeleton one row repeated. */
  export const CAPTURE_MACHINES: PieceMachine[] = [
    {
      name: "obelisk-of-light",
      meta: "Linux · 3 sessions running",
      badge: "Live",
      icon: "cpu",
      live: true,
    },
    {
      name: "obelisk-of-light",
      meta: "Linux · 3 sessions running",
      badge: "Live",
      icon: "cpu",
      live: true,
    },
  ];

  export const CAPTURE_SESSION: PieceSession = {
    title: "Deploy the hub to obelisk-of-light",
    status: "Working",
    summary: "Started 2 min ago by Caw on main, 3 files changed so far.",
  };

  /** A picture drawn for the fixture: a dusk-coloured gradient, as a file's preview stands. */
  export const MOCK_PICTURE = `data:image/svg+xml,${encodeURIComponent(
    '<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 16 10" preserveAspectRatio="none"><defs><linearGradient id="g" x1="0" y1="0" x2="1" y2="1"><stop offset="0" stop-color="#d9a066"/><stop offset=".6" stop-color="#b0533a"/><stop offset="1" stop-color="#3b3355"/></linearGradient></defs><rect width="16" height="10" fill="url(#g)"/></svg>'
  )}`;

  export const CAPTURE_FILE: PieceFile = {
    name: "Hub release notes",
    kind: "PNG · 1.2 MB",
    state: "Draft",
    picture: MOCK_PICTURE,
  };
</script>

<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { EmptyState } from "#lib/components/ui/empty/index.js";
  import { Row, RowList } from "#lib/components/ui/row/index.js";
  /**
   * The pieces the kit's skeletons stand for, drawn from the kit's own
   * parts with the data they are given: a list of machine rows (or its
   * empty state), a session's card, and a file's picture card. /dev/bones
   * draws them with the capture's data for `bun run bones`; the skeleton's
   * states file draws them as the content that lands.
   */
  import { IconCpu, IconFolder, IconKey } from "#lib/icons.js";

  let {
    piece,
    machines = CAPTURE_MACHINES,
    session = CAPTURE_SESSION,
    file = CAPTURE_FILE,
  }: {
    /** Which piece. */
    piece: PieceName;
    /** The list's rows; none draws its empty state. */
    machines?: PieceMachine[];
    /** The card's session. */
    session?: PieceSession;
    /** The picture card's file. */
    file?: PieceFile;
  } = $props();

  const ICON = { cpu: IconCpu, key: IconKey, folder: IconFolder };
</script>

{#if piece === "rows"}
  <div class="w-full rounded-lg border border-ui bg-bg px-space-3 py-space-2">
    {#if machines.length}
      <RowList aria-label="Machines">
        {#each machines as machine, k (k)}
          {@const Mark = ICON[machine.icon]}
          <Row data-bones-row>
            {#snippet lead()}
              <span
                class="grid size-row-compact place-items-center rounded-sm bg-bg-2 text-tx-2"
              >
                <Mark class="size-icon-md" />
              </span>
            {/snippet}
            <div class="flex min-w-0 flex-col">
              <span class="truncate type-label text-tx">{machine.name}</span>
              <span class="truncate type-meta text-tx-2">{machine.meta}</span>
            </div>
            {#snippet trail()}
              <Badge variant={machine.live ? "live" : "secondary"}
                ><span>{machine.badge}</span></Badge
              >
            {/snippet}
          </Row>
        {/each}
      </RowList>
    {:else}
      <EmptyState
        icon={IconCpu}
        line="Pair a machine and its sessions show here."
        title="No machines yet"
      >
        {#snippet action()}
          <Button size="sm" variant="outline">Add a machine</Button>
        {/snippet}
      </EmptyState>
    {/if}
  </div>
{:else if piece === "card"}
  <div
    class="flex w-full flex-col gap-space-2 rounded-lg border border-ui bg-bg p-space-4"
  >
    <div class="flex items-center justify-between gap-space-2">
      <span class="min-w-0 truncate type-label">{session.title}</span>
      <Badge variant="live"><span>{session.status}</span></Badge>
    </div>
    <p class="text-tx-2 type-body">{session.summary}</p>
    <div class="flex gap-space-2">
      <Button size="sm" variant="outline">Open</Button>
      <Button size="sm" variant="ghost">Stop</Button>
    </div>
  </div>
{:else}
  <div
    class="flex w-full flex-col gap-space-4 rounded-lg border border-ui bg-bg p-space-4"
  >
    <img
      class="aspect-16/10 w-full rounded-sm object-cover"
      alt={file.name}
      src={file.picture}
    />
    <div class="flex items-start justify-between gap-space-2">
      <div class="flex min-w-0 flex-col">
        <span class="truncate type-label text-tx">{file.name}</span>
        <span class="truncate type-meta text-tx-2">{file.kind}</span>
      </div>
      <Badge variant="secondary"><span>{file.state}</span></Badge>
    </div>
  </div>
{/if}
