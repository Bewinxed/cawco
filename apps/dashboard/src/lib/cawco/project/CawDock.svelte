<script lang="ts">
  /**
   * Caw's dock beside the project's page (Caw assistant design): his head,
   * his settings folded under a gear, and the project's latest thread drawn
   * by the transcript a thread tab draws (ThreadPane's Transcript, his face
   * on the speaker line), with the composer at its foot.
   *
   * - Head: his face, his name, what he is doing (`lead.sentence`); off, it
   *   says so and offers Turn on under it. A menu of the project's threads
   *   stands under it once there is more than one.
   * - Body: before any thread, his greeting and three things to ask; your
   *   first words land as your row at once and the dock binds to the thread
   *   the hub makes, its rows taking the echo's place.
   * - Foot: the field to Caw (CawField, its words flying to their row) until
   *   a thread exists, then the session Composer bound to the thread.
   * - Under your newest words, one line says where they stand: Sending…,
   *   Delivered · waking Caw, Delivered, or Caw didn't wake with the reason
   *   and Try again. His reply ends it.
   */
  import type { ThreadMessage } from "@cawco/core";
  import { untrack } from "svelte";
  import {
    blankSession,
    cawco,
    readThread,
    type SessionState,
    sayInThread,
    startThread,
    submitCommand,
    threadsOf,
  } from "#lib/cawco/client.svelte.js";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { failureWords } from "#lib/cawco/hub-read.js";
  import { newId } from "#lib/cawco/id.js";
  import { appear, crossOut } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import SideSurface from "#lib/cawco/side/SideSurface.svelte";
  import { threadBlockOf } from "#lib/cawco/thread-blocks.js";
  import Composer, {
    type ComposerFoot,
  } from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import Transcript from "#lib/cawco/transcript/Transcript.svelte";
  import { setVoice } from "#lib/cawco/transcript/voice.js";
  import type { Message } from "#lib/cawco/types.js";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Select from "#lib/components/ui/select/index.js";
  import { IconSettings } from "#lib/icons.js";
  import CawField from "./CawField.svelte";
  import CawPanel from "./CawPanel.svelte";
  import { cawDock } from "./caw-dock.svelte";
  import type { CawLead } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    starters,
    onclose,
    sheet = false,
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /** The project's starters (its stages' `starters`): the first three are offered. */
    starters: Starter[];
    onclose: () => void;
    /** Drawn in the phone's bottom sheet, not the desk's split. */
    sheet?: boolean;
  } = $props();

  const viewId = untrack(() => `caw-dock:${projectId}`);
  const off = $derived(lead.view !== null && !lead.view.on);
  let settingsOpen = $state(false);

  // --- the thread on show -----------------------------------------------------

  const threads = $derived(threadsOf(projectId));
  /** The thread drawn: the newest when the dock opens; null, a new one. */
  let threadId = $state<string | null>(
    untrack(() => threadsOf(projectId)[0]?.id ?? null)
  );
  /** New thread was chosen: the newest arriving later does not take its place. */
  let fresh = $state(false);
  $effect(() => {
    const newest = threads[0]?.id;
    if (newest && threadId === null && !fresh) {
      threadId = newest;
    }
  });
  const thread = $derived(
    threadId ? (threads.find((each) => each.id === threadId) ?? null) : null
  );
  const messages = $derived<ThreadMessage[] | null>(
    threadId ? cawco.threadMessagesOf(threadId) : []
  );
  let readProblem = $state<string | null>(null);
  $effect(() => {
    const id = threadId;
    if (!(id && cawco.status === "connected") || messages !== null) {
      return;
    }
    untrack(() => {
      readThread(projectId, id).then(
        () => {
          readProblem = null;
        },
        (error: unknown) => {
          readProblem = failureWords(error);
        }
      );
    });
  });

  // --- your words, on their way -------------------------------------------------

  /** Your words this dock sent, drawn as your row until the thread's own lands. */
  let echo = $state<{
    id: string;
    text: string;
    at: number;
    refused: string | null;
  } | null>(null);
  /** Try again is out. */
  let retrying = $state(false);
  /** The greeting stays over the thread this dock began. */
  let begunHere = $state(false);
  const echoShown = $derived(
    echo && !(messages ?? []).some((message) => message.id === echo?.id)
      ? echo
      : null
  );

  /** Your newest words in the thread, and what came after them. */
  const newest = $derived.by(() => {
    const list = messages ?? [];
    const at = list.findLastIndex((message) => message.author === "you");
    if (at < 0) {
      return null;
    }
    const after = list.slice(at + 1);
    return {
      you: list[at],
      replied: after.some((message) => message.author === "caw"),
      notWoken: after.findLast(
        (message) =>
          message.author === "event" &&
          message.event?.kind === "caw" &&
          message.event.what === "not-woken"
      ),
    };
  });

  /** The hub's sentence for a wake that did not go out, past its own lead-in. */
  const NOT_WOKEN =
    /^Caw hasn't read your message: (.+?)\. Your message is kept/s;
  const whyOf = (body: string | undefined): string => {
    const why = NOT_WOKEN.exec(body ?? "")?.[1] ?? body ?? "";
    return why ? `${why[0].toUpperCase()}${why.slice(1)}.` : "";
  };

  // --- the transcript ------------------------------------------------------------

  const leadSession = $derived(
    lead.view?.leadInstanceId ? cawco.session(lead.view.leadInstanceId) : null
  );
  const working = $derived(thread?.status === "working");
  /** His answer as it streams: the lead's while this thread's turn runs. */
  const streaming = $derived(working ? (leadSession?.streaming ?? "") : "");

  type Delivery =
    | { kind: "sending" | "waking" | "delivered" }
    | { kind: "failed"; why: string; again: () => Promise<void> };
  const delivery = $derived.by((): Delivery | null => {
    if (echoShown) {
      const { refused, text } = echoShown;
      return refused === null
        ? { kind: "sending" }
        : { kind: "failed", why: refused, again: () => begin(text) };
    }
    if (retrying) {
      return { kind: "sending" };
    }
    if (!newest || newest.replied || streaming) {
      return null;
    }
    if (newest.notWoken) {
      const words = newest.you.author === "you" ? newest.you.body : "";
      return {
        kind: "failed",
        why: whyOf(newest.notWoken.body),
        again: () => wakeAgain(words),
      };
    }
    return { kind: working ? "delivered" : "waking" };
  });

  /** Where your newest words stand, on your row's speaker line (lowercase, as its "sending…"). */
  const NOTE: Record<Delivery["kind"], string> = {
    sending: "sending…",
    waking: "delivered · waking Caw",
    delivered: "delivered",
    failed: "didn't wake",
  };

  /** The greeting: who he is and how things stand, in his voice; no model call. */
  const greeting = $derived.by((): string => {
    const how: Record<string, string> = {
      "needs-you": "Something here is waiting on you.",
      working: "I'm in the middle of a turn right now.",
      sleeping: "I'm off, so I only act when you write to me.",
      idle: "Nothing on the board is due.",
    };
    return `I'm leading ${projectName}. ${how[lead.status] ?? "There's work on the board I can pick up."} What should we do?`;
  });

  const session = $state<SessionState>(
    untrack(() => ({ ...blankSession(viewId), harness: "claude" }))
  );
  $effect.pre(() => {
    const blocks: Message[] = [];
    if (threadId === null || begunHere) {
      blocks.push({
        id: `${viewId}:greeting`,
        instanceId: viewId,
        type: "assistant",
        content: greeting,
      } as Message);
    }
    const failedWake =
      delivery?.kind === "failed" ? newest?.notWoken?.id : null;
    const note = delivery ? NOTE[delivery.kind] : undefined;
    const noted = echoShown?.id ?? newest?.you.id;
    for (const message of messages ?? []) {
      if (message.id === failedWake) {
        continue;
      }
      const block = threadBlockOf(message, viewId);
      blocks.push(
        note && message.id === noted
          ? { ...block, metadata: { ...block.metadata, delivery: note } }
          : block
      );
    }
    // Your words before the hub has them: no clock, as a session's own
    // unsent row has none; its note says where they are.
    if (echoShown) {
      blocks.push({
        id: echoShown.id,
        instanceId: viewId,
        type: "user",
        content: echoShown.text,
        metadata: note ? { delivery: note } : undefined,
      } as Message);
    }
    session.blocks = blocks;
    session.messages = blocks;
    session.initialized = messages !== null;
    session.busy = working;
    session.streaming = streaming;
  });

  setVoice({ face });

  // --- sending ---------------------------------------------------------------------

  const draft = new ComposerDraft();
  let fieldText = $state("");
  let foot = $state<ComposerFoot>({ stack: 0, perch: 0, parked: 0 });
  let fieldStack = $state(0);

  /** Your first words start the thread; the dock binds to the thread the hub made. */
  async function begin(text: string, id = newId()): Promise<void> {
    echo = { id, text, at: Date.now(), refused: null };
    begunHere = true;
    try {
      const said = await startThread(projectId, text, id);
      threadId = said.thread.id;
      fresh = false;
    } catch (error) {
      echo = {
        id,
        text,
        at: echo?.at ?? Date.now(),
        refused: failureWords(error),
      };
    }
  }

  async function say(text: string, id: string): Promise<void> {
    settingsOpen = false;
    if (!threadId) {
      await begin(text, id);
      return;
    }
    echo = { id, text, at: Date.now(), refused: null };
    try {
      await sayInThread(projectId, threadId, text, id);
    } catch (error) {
      echo = {
        id,
        text,
        at: echo?.at ?? Date.now(),
        refused: failureWords(error),
      };
    }
  }

  /** The same words again, in the same thread: he is woken with them. */
  async function wakeAgain(text: string): Promise<void> {
    if (!threadId) {
      return;
    }
    retrying = true;
    try {
      await sayInThread(projectId, threadId, text, newId());
    } finally {
      retrying = false;
    }
  }

  /** Stop interrupts the lead's turn. */
  function stop() {
    const id = lead.view?.leadInstanceId;
    const row = id ? cawco.instanceIndex.byId.get(id) : undefined;
    if (id && row) {
      submitCommand(id, row.machineId, "interrupt", {});
    }
  }

  /** A starter's words into the field, the caret after them; nothing is sent. */
  function put(text: string) {
    if (cawDock.foot === "composer" || threadId) {
      draft.text = text;
      draft.focusWanted = true;
      return;
    }
    fieldText = text;
    queueMicrotask(() => {
      const field = document.querySelector<HTMLTextAreaElement>(
        '[data-caw-dock] textarea[aria-label="Message Caw"]'
      );
      field?.focus({ preventScroll: true });
      field?.setSelectionRange(field.value.length, field.value.length);
    });
  }

  const offerStarters = $derived(
    threadId === null && !echoShown && starters.length > 0
  );
  const usesField = $derived(cawDock.foot === "field" && threadId === null);
  const stack = $derived(usesField ? fieldStack : foot.stack);

  // --- the threads menu --------------------------------------------------------------

  const WHEN = new Intl.DateTimeFormat(undefined, {
    hour: "2-digit",
    minute: "2-digit",
  });
  const DAY = new Intl.DateTimeFormat(undefined, { weekday: "short" });
  function whenOf(at: number): string {
    const day = new Date(at);
    const today = new Date();
    if (day.toDateString() === today.toDateString()) {
      return `Today ${WHEN.format(day)}`;
    }
    today.setDate(today.getDate() - 1);
    return day.toDateString() === today.toDateString()
      ? "Yesterday"
      : DAY.format(day);
  }
  function choose(value: string) {
    echo = null;
    begunHere = false;
    if (value === "new") {
      threadId = null;
      fresh = true;
      return;
    }
    threadId = value;
    fresh = false;
  }
</script>

{#snippet face(
  live: boolean
)}
  <CawFace size={18} status={live ? "working" : "ready"} />
{/snippet}

{#snippet identity()}
  <div class="who">
    <CawFace size={24} status={lead.status} />
    <span class="words">
      <span class="name"
        >Caw
        {#if off}
          <span class="off-word">{" · off"}</span>
        {/if}</span
      >
      <span class="line"
        >{off ? "Answers only when you write to him." : lead.sentence}</span
      >
    </span>
  </div>
{/snippet}

{#snippet gear()}
  <button
    aria-expanded={settingsOpen}
    aria-label="Caw's settings"
    aria-pressed={settingsOpen}
    class="touch-hit"
    onclick={() => {
      settingsOpen = !settingsOpen;
    }}
    title="Settings"
    type="button"
  >
    <IconSettings />
  </button>
{/snippet}

{#snippet under()}
  {#if off}
    <div class="turn-on">
      <button
        class="link"
        disabled={lead.moving}
        onclick={() => lead.configure({ on: true })}
        type="button"
      >
        Turn on
      </button>
    </div>
  {/if}
  {#if threads.length > 1}
    <div class="threads">
      <Select.Root
        onValueChange={(value) => value && choose(value)}
        type="single"
        value={threadId ?? "new"}
      >
        <Select.Trigger aria-label="Thread" class="thread-pick" size="sm">
          {thread ? `${whenOf(thread.lastAt)} · ${thread.title}` : "New thread"}
        </Select.Trigger>
        <Select.Content>
          <Select.Item label="New thread" value="new" />
          {#each threads as each (each.id)}
            <Select.Item
              label="{whenOf(each.lastAt)} · {each.title}"
              value={each.id}
            />
          {/each}
        </Select.Content>
      </Select.Root>
    </div>
  {/if}
  {#if settingsOpen}
    <div class="settings" data-caw-settings transition:unfold>
      <div class="settings-inner">
        <CawPanel {lead} {projectId} {projectName} />
      </div>
    </div>
  {/if}
{/snippet}

<!-- What stands over the field: a wake that failed and the way to try
     again (where a session's composer says its own send error), or what
     to ask. Where your words stand is your row's own note. -->
{#snippet ahead()}
  {#if delivery?.kind === "failed"}
    {@const failed = delivery}
    <div class="delivery" data-caw-delivery="failed" role="alert" in:appear>
      <p>
        Caw didn't wake. {failed.why} Your message is kept; Try again wakes him
        with it.
      </p>
      <Button
        label="Try again"
        onclick={() => failed.again()}
        pending={retrying}
        pendingLabel="Sending…"
        size="sm"
        variant="outline"
      />
    </div>
  {:else if offerStarters}
    <div class="starters" out:crossOut>
      <p class="ask">Things to ask</p>
      <ul>
        {#each starters.slice(0, 3) as starter (starter.text)}
          <li>
            <Button
              class="starter"
              onclick={() => put(starter.text)}
              size="sm"
              variant="ghost"
              >{starter.text}</Button
            >
          </li>
        {/each}
      </ul>
    </div>
  {/if}
{/snippet}

<div class="dock" data-caw-dock class:sheet={sheet}>
  <SideSurface
    actions={gear}
    below={under}
    label="Caw, lead of {projectName}"
    {onclose}
    titleControl={identity}
  >
    <div
      class="body"
      style="--composer-clearance: calc(max(var(--c-composer-panel) + var(--c-tray-row), {stack}px) + var(--space-4) + var(--space-4))"
    >
      {#if readProblem}
        <p class="problem" role="alert">
          The thread could not be read: {readProblem}
        </p>
      {:else}
        <div class="state">
          {#key threadId}
            <Transcript agentName="Caw" bare {session} visible />
          {/key}
        </div>
      {/if}
      {#if lead.view?.problem}
        <div class="foot">
          <Alert role="status">
            <AlertDescription>{lead.view.problem}</AlertDescription>
          </Alert>
        </div>
      {:else if usesField}
        <div class="foot" bind:clientHeight={fieldStack}>
          {@render ahead()}
          <CawField
            autofocus
            flies
            label="Message Caw"
            onsend={(text, id) => {
              // The field clears at once: your row holds the words and its
              // note says where they are, a refusal included.
              // biome-ignore lint/complexity/noVoid: the send's own state is the echo row
              void say(text, id);
              return Promise.resolve();
            }}
            placeholder="Message Caw…"
            bind:text={fieldText}
          />
        </div>
      {:else}
        <Composer
          agentName="Caw"
          busy={working}
          {draft}
          onfoot={(next) => {
            foot = next;
          }}
          onstop={stop}
          onsubmit={(text, _extras, id) => say(text, id)}
          placeholder="Message Caw…"
          prompts={ahead}
          sending={echoShown !== null && echoShown.refused === null}
        />
      {/if}
    </div>
  </SideSurface>
</div>

<style>
  .dock {
    display: flex;
    flex: 1 1 auto;
    min-inline-size: 0;
    block-size: 100%;
  }
  /* In the phone's sheet: the sheet's height, less its grab. */
  .dock.sheet {
    block-size: 85dvh;
  }
  .dock :global(.side-card) {
    flex: 1 1 auto;
  }
  /* His face, his name over what he is doing: the head's identity. */
  .who {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
    padding-inline-start: var(--space-1);
  }
  .words {
    display: flex;
    flex-direction: column;
    min-inline-size: 0;
  }
  .name {
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  .off-word {
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .line {
    overflow: hidden;
    font: var(--type-meta);
    color: var(--ink-muted);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  /* Under the head, on the text's column (face + gap past the card's edge). */
  .turn-on,
  .threads {
    padding: 0 var(--space-2) var(--space-2)
      calc(var(--space-1) + 24px + var(--space-2));
  }
  .link {
    padding: 0;
    border: 0;
    background: none;
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    color: var(--link-ink);
    cursor: pointer;
  }
  @media (hover: hover) {
    .link:hover {
      text-decoration: underline;
      text-underline-offset: 3px;
    }
  }
  .threads :global(.thread-pick) {
    max-inline-size: 100%;
  }
  /* The settings fold: a tone step under the head, not a bordered box. */
  .settings {
    margin: 0 0 var(--space-2);
  }
  .settings-inner {
    padding: var(--space-3);
    border-radius: var(--radius-md);
    background: var(--surface-band);
  }
  /* The well holds the thread; the foot stands over its bottom as a
     session's composer stands over its pane. */
  .body {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  .state {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  /* A thread has no tool rail (ThreadPane). */
  .state :global(.tx-columns) {
    --x-rail: 0px;
  }
  .problem {
    margin: auto;
    max-inline-size: 46ch;
    padding: var(--space-6);
    font: var(--type-body);
    color: var(--ink-muted);
  }
  /* CawField where the Composer's dock stands (Composer .dock): its column,
     its lift off the foot. */
  .foot {
    position: absolute;
    inset-inline: 0;
    inset-block-end: calc(var(--space-4) + var(--safe-bottom));
    z-index: 20;
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    inline-size: var(--c-composer-w);
    margin-inline: auto;
  }
  .delivery {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    gap: var(--space-2);
    padding-inline: var(--space-1);
    font: var(--type-meta);
    color: var(--error-11);
    pointer-events: auto;
  }
  .starters {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    pointer-events: auto;
  }
  .ask {
    padding-inline: var(--space-1);
    font: var(--type-meta);
    color: var(--ink-muted);
  }
  .starters ul {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .starters :global(.starter) {
    justify-content: flex-start;
    block-size: auto;
    min-block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-1);
    white-space: normal;
    text-align: start;
  }
</style>
