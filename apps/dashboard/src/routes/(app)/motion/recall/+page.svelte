<script lang="ts">
  /**
   * RECALL BENCH: the composer's recall wheel (transcript/RecallWheel), no
   * hub. The real Composer at the page's foot, pointed at a conversation
   * whose transcript is sixty messages the reader sent, so the wheel has
   * more to roll than any window shows. ↑ in the empty field, or a press
   * held on the pill on a touch screen, brings it up.
   *
   * The conversation is the client's own state, as the hub's frames would
   * have set it (dev's `__cawcoDebug`, set when client.svelte.ts loads,
   * which Composer imports ahead of this script). Its / menu holds two
   * skills and a built-in, which the field draws as chips (composer-chips);
   * "@" names what the hub's names answer (`GET /api/find`, which a probe
   * answers: session-mention); `window.__recall` holds the draft, and what
   * was sent, in order.
   */
  import type { AvailableCommand } from "@cawco/core";
  import { blankSession, type SessionState } from "#lib/cawco/client.svelte.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import type { Message } from "#lib/cawco/types.js";

  const ID = "recall-bench";
  const SENT = 60;
  const SAID = [
    "Run the migrations against staging and tell me what changed",
    "continue",
    "Why does the tab strip jump when a session finishes?",
    "Rename the ws/ branches to match the workspace ids",
    "Fix the failing lint in apps/dashboard and commit it",
    "What does the hub do when a machine's clock is behind?",
    "Make the composer's hint shorter on a phone",
    "Show me the diff before you push",
    "Write the release notes for 0.2.0",
    "Check the push probe on the Mac and report back",
  ];

  const debug = (
    globalThis as unknown as {
      __cawcoDebug: { state: { sessions: Record<string, SessionState> } };
    }
  ).__cawcoDebug;
  const now = Date.now();
  const messages = Array.from(
    { length: SENT },
    (_, i): Message =>
      ({
        id: `recall-sent-${i}`,
        instanceId: ID,
        type: "user",
        content: `${SAID[i % SAID.length]} (${i + 1})`,
        timestamp: new Date(now - (SENT - i) * 7 * 60_000).toISOString(),
      }) as Message
  );
  debug.state.sessions[ID] = { ...blankSession(ID), messages };

  /** The session's `/` menu: skills (a plugin's among them) and a built-in. */
  const COMMANDS: AvailableCommand[] = [
    {
      name: "clean-copy",
      type: "skill",
      description: "Cut interface copy that shouldn't exist.",
    },
    {
      name: "interfaces:better-typography",
      type: "skill",
      source: "interfaces",
      description: "Sets and reviews how text renders in your product.",
    },
    { name: "compact", type: "builtin", description: "Compact the context." },
  ];

  const draft = new ComposerDraft();
  /** What the composer sent, in order: the words exactly as they left. */
  const sent: string[] = [];

  // The probes write the draft as a restore does, and read what was sent.
  Object.assign(globalThis, { __recall: { draft, sent } });
</script>

<svelte:head>
  <title>Recall wheel · CawCo</title>
</svelte:head>

<!-- The composer's box, as a pane's dock is (PaneLeaf `dock`): the whole
     page, and the composer docks itself at its foot as a conversation's
     does, 14px above it plus the safe area, at most 720px wide, and full
     width with 11px margins under 900px. -->
<div data-slot="dock" class="relative h-full">
  <Composer
    fleet={composerFleet}
    commands={COMMANDS}
    {draft}
    mentionsFrom={ID}
    onstop={() => undefined}
    onsubmit={(text) => {
      sent.push(text);
    }}
    recallOf={ID}
  />
</div>
