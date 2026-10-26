<script lang="ts">
  import MessageBody from "#lib/cawco/MessageBody.svelte";
  import CommentCallFixture from "#lib/cawco/transcript/preview/CommentCallFixture.svelte";
  import {
    AGENT,
    askedFor,
    awayNotes,
    opening,
    SHIPPED,
    SIZING,
  } from "#lib/cawco/transcript/preview/comment-chip-pins.js";
  import ToolGroup from "#lib/cawco/transcript/ToolGroup.svelte";
  import Turn from "#lib/cawco/turn/Turn.svelte";
  import Well from "#lib/cawco/turn/Well.svelte";
  import Who from "#lib/cawco/turn/Who.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import * as Tabs from "#lib/components/ui/tabs/index.js";
  /**
   * COMMENT CHIP BENCH (dev only): the owner's ask of 10-25 and 10-26, live.
   * A conversation's comment_reply and comment_resolve rows as chips, like
   * any tool call: pressing a chip (or resting a mouse on it) opens its
   * thread with a reply box; its chevron unfolds the exchange inline. The
   * rows around them are ToolGroup's own. One switch: where a phone's thread
   * opens. His real threads (comment-chip-pins), held in the page.
   */
  import pinCardSource from "../../../lib/cawco/preview/PinCard.svelte?raw";

  const UNDER = "Under the chip";
  const SHEET = "Bottom sheet";
  let phoneWay = $state(UNDER);
  const anchor = $derived(phoneWay === SHEET ? "sheet" : "popover");

  /** A call of this session's, as the hub's transcript holds it. */
  const called = (
    id: string,
    at: string,
    toolName: string,
    toolInput: Record<string, unknown>,
    toolResult: string
  ): Message => ({
    id,
    instanceId: "comment-chip-bench",
    content: "",
    type: "tool.use",
    timestamp: at,
    toolCallId: id,
    metadata: { toolName, toolInput, toolResult, toolStatus: "success" },
  });

  /** What the agent read and ran before answering him (this session's own calls). */
  const before: Message[] = [
    called(
      "read-pins",
      "2026-10-26T18:07:52.235Z",
      "mcp__cawco__comment_read",
      { artifact: "2bede487", filter: "all" },
      "1 pin on shipped-without-approval: Whole page, answered."
    ),
    called(
      "read-card",
      "2026-10-26T18:09:10.000Z",
      "Read",
      {
        file_path:
          "/home/bewinxed/.worktrees/cockpit-f8d030ad/apps/dashboard/src/lib/cawco/preview/PinCard.svelte",
      },
      pinCardSource
    ),
  ];
  const after: Message[] = [
    called(
      "check",
      "2026-10-26T18:20:41.000Z",
      "Bash",
      {
        command: "bun run check",
        description: "Run repo check over the change set",
      },
      "check: 31 checks passed in 10.9s (17 more unchanged since their last pass)"
    ),
  ];

  /** His words on the keep-or-roll-back page, 10-26. */
  const his =
    "I already said that on hover, there should be the ability to open the comment thread and be able to reply from within the pop-over. I never said to show the whole thing expanded within the transcript, unless I expand the card, just like any tool call I can click the chip to view the comment thread and reply with the option to link to it within the place or the preview or the canvas";
  /** The agent's answer after the rows: its first paragraph, as it wrote it in the thread. */
  const answered = askedFor.thread[2]?.text.split("\n\n")[0] ?? "";
  const oneReply = { ...awayNotes, thread: awayNotes.thread.slice(0, 2) };
</script>

<svelte:head><title>Comment chip</title></svelte:head>

<div class="min-h-dvh bg-surface-page text-ink-strong">
  <!-- The one choice: where a phone's thread opens. -->
  <header
    class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2 border-b border-border-hairline bg-surface-raised px-space-5 py-space-3"
  >
    <span class="type-meta text-ink-muted">On a phone, a thread opens</span>
    <Tabs.Root bind:value={phoneWay}>
      <Tabs.List>
        <Tabs.Trigger value={UNDER}>{UNDER}</Tabs.Trigger>
        <Tabs.Trigger value={SHEET}>{SHEET}</Tabs.Trigger>
      </Tabs.List>
    </Tabs.Root>
  </header>

  <main
    class="tx-columns py-space-5 max-phone:pb-c-sheet-max-h ps-space-7 pe-space-6 max-desk:ps-space-5 max-desk:pe-space-5"
  >
    <Turn you>
      <Who name="You" shown timestamp="2026-10-26T17:58:00.000Z" you />
      <Well><MessageBody source={his} wrap="pretty" /></Well>
    </Turn>

    <Turn>
      <Who name={AGENT} shown timestamp="2026-10-26T18:05:00.000Z" />
      <ToolGroup messages={before} />
      <div class="rail-row">
        <CommentCallFixture
          agentName={AGENT}
          {anchor}
          artifact={SIZING}
          pin={oneReply}
          reply={oneReply.thread[1]?.text ?? ""}
        />
      </div>
      <div class="rail-row">
        <CommentCallFixture
          agentName={AGENT}
          {anchor}
          artifact={SIZING}
          pin={opening}
          reply={opening.thread[4]?.text ?? ""}
        />
      </div>
      <div class="rail-row">
        <CommentCallFixture
          agentName={AGENT}
          {anchor}
          artifact={SHIPPED}
          call="resolve"
          pin={askedFor}
        />
      </div>
      <ToolGroup messages={after} />
      <div class="mt-space-4">
        <MessageBody source={answered} wrap="pretty" />
      </div>
    </Turn>
  </main>
</div>
