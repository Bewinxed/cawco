<script lang="ts">
  /**
   * TEMPORARY verification bench: the real Transcript and Composer against
   * a synthetic Claude session in the store (dev only, via __cawcoDebug).
   * Driven from window.__bench.
   */
  import { blankSession, cawco, type SessionState } from "#lib/cawco/client.svelte.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import Transcript from "#lib/cawco/transcript/Transcript.svelte";
  import type { Message } from "#lib/cawco/types.js";

  const INSTANCE = "composer-bench";
  const store = (globalThis as unknown as { __cawcoDebug: { state: { sessions: Record<string, SessionState> } } }).__cawcoDebug.state;
  store.sessions[INSTANCE] = blankSession(INSTANCE);
  const session = cawco.session(INSTANCE) as SessionState;
  session.harness = "claude";
  session.machineId = "bench-machine";
  session.sessionId = "bench-session";
  session.cursor = null;

  const drafts = [new ComposerDraft(), new ComposerDraft()];
  let draft = $state(drafts[0]);
  const min = 60_000;
  let n = 0;
  const at = (ago: number) => new Date(Date.now() - ago).toISOString();
  function place(): void {
    session.messages = [...session.blocks, ...session.queued, ...session.local];
  }
  function user(text: string, ago: number, state: Message["state"] = "read"): Message {
    n += 1;
    return { id: `u-${n}`, instanceId: INSTANCE, type: "user", content: text, timestamp: at(ago), state } as Message;
  }
  function agent(text: string, ago: number): Message {
    n += 1;
    return { id: `a-${n}`, instanceId: INSTANCE, type: "assistant", content: text, timestamp: at(ago) } as Message;
  }
  const HISTORY = [
    "summarise what changed in the release notes\nkeep it to five lines, no marketing",
    "whenever you investigate a piece, see if there's a primitive or an established library that will solve it",
    "inherit",
    "can't it be like 60 days instead of 30?",
    "uh drop it for now",
    "and the duplicate update notif + the update notif keeps appearing (find root issue not patch)",
    "for some reason the toast appears above the sidebar instead of like the top right or bottom right, and i can slide it right or up and it dismisses, this normal?",
    "the x button pushing the heading isn't good design imo...",
    "agreed, and for the configure needs to have clear copy, no redundancy, like \"Configure update behavior\" subtle",
  ];
  function seed(queued: string | null): void {
    const blocks: Message[] = [];
    HISTORY.forEach((text, i) => {
      const ago = (HISTORY.length - i) * 7 * min;
      blocks.push(user(text, ago));
      blocks.push(agent(`Answer ${i + 1}: done, and checked in both schemes.`, ago - min));
    });
    session.blocks = blocks;
    session.queued = queued ? [user(queued, 0, "pending")] : [];
    session.local = [];
    session.busy = !!queued;
    place();
  }
  seed(null);

  function onsubmit(text: string): void {
    // As a busy hub would: the send is queued behind the turn in flight.
    session.queued = [...session.queued, user(text, 0, "pending")];
    session.busy = true;
    place();
  }

  Object.assign(window, {
    __bench: {
      session,
      get draft() {
        return draft;
      },
      switchTo: (i: number) => {
        draft = drafts[i];
      },
      seed,
      place,
      /** The session reads its queued sends. */
      read: () => {
        session.blocks = [...session.blocks, ...session.queued.map((m) => ({ ...m, state: "read" as const }))];
        session.queued = [];
        place();
      },
      /** The hub places a replacement send, queued. */
      queue: (id: string, text: string) => {
        session.queued = [...session.queued, { ...user(text, 0, "pending"), id }];
        place();
      },
    },
  });
</script>

<div class="pane">
  <Transcript agentName="Claude" focused {session} visible />
  <Composer
    busy={session.busy}
    {draft}
    delegatesOf={INSTANCE}
    {onsubmit}
    onstop={() => {
      session.busy = false;
    }}
    recallOf={INSTANCE}
  />
</div>

<style>
  .pane {
    position: relative;
    display: flex;
    flex-direction: column;
    height: 100dvh;
    min-height: 0;
    background: var(--surface-recess);
    --composer-clearance: calc(var(--c-composer-panel) + var(--c-tray-row) + var(--space-4) + var(--space-4));
  }
</style>
