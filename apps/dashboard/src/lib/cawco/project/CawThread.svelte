<script lang="ts">
  /**
   * Caw's floating panel (CawSeat's popover, a bottom sheet on touch): a
   * conversation with the project's Caw made of the parts every
   * conversation has, the session Composer at its foot from the very first
   * message and the Transcript a thread tab draws above it.
   *
   * - Before a thread: Caw as the hero, as the project's empty board and
   *   New project stand him (80px, his name, his one line), and under him
   *   the project's starters as chips. A chip puts its words in the
   *   composer; nothing is sent. With earlier threads, they list under the
   *   chips as every list draws a conversation (SessionRow).
   * - Your first send starts the thread (`startThread`); your row lands in
   *   the transcript at once and the panel binds to the thread the hub
   *   makes, the composer staying where it is. Later sends say in it
   *   (`sayInThread`). Sends go as a thread tab's do (ThreadPane), with
   *   what rode with the words; one the hub refuses goes back to the
   *   composer, the reason over it.
   * - With a thread: its transcript, Caw's face on his speaker lines, and a
   *   head with his face and line, New thread, and the way to open it as a
   *   tab. Your newest row's note says where your words stand (sending…,
   *   delivered · waking Caw, delivered, didn't wake); a wake that failed
   *   stands over the composer with its reason and Try again.
   * - His name (in the hero and in the head) opens his lead session's card,
   *   the card a session tab's hover opens (SessionDetails), where his
   *   harness and model are chosen as any session's are.
   */
  import {
    CAW_DENIED_TOOLS,
    type CawHarness,
    type CawInitiated,
    type CawRunning,
    type HarnessKind,
    type ThreadMessage,
  } from "@cawco/core";
  import { untrack } from "svelte";
  import { MediaQuery } from "svelte/reactivity";
  import CawOffTray, { type CawOffAsk } from "#lib/cawco/CawOffTray.svelte";
  import {
    blankSession,
    cawco,
    onProjectStop,
    readThread,
    type SendExtras,
    type SessionState,
    sayInThread,
    startThread,
    submitCommand,
    threadsOf,
  } from "#lib/cawco/client.svelte.js";
  import Caw, { type CawFile } from "#lib/cawco/home/Caw.svelte";
  import CawFace from "#lib/cawco/home/CawFace.svelte";
  import { clock } from "#lib/cawco/home/home-state.svelte.js";
  import {
    failureWords,
    THREAD_SEND_UNREACHED,
    unreachable,
  } from "#lib/cawco/hub-read.js";
  import { newId } from "#lib/cawco/id.js";
  import { appear } from "#lib/cawco/motion/curves.svelte.js";
  import { unfold } from "#lib/cawco/motion/fold.svelte.js";
  import type { Starter } from "#lib/cawco/project-tasks.js";
  import SessionRow from "#lib/cawco/SessionRow.svelte";
  import { threadBlockOf } from "#lib/cawco/thread-blocks.js";
  import { threadHref, threadTabId } from "#lib/cawco/thread-tabs.js";
  import Composer, {
    type ComposerFoot,
  } from "#lib/cawco/transcript/Composer.svelte";
  import { localUserMessage } from "#lib/cawco/transcript/local.js";
  import Transcript from "#lib/cawco/transcript/Transcript.svelte";
  import { setVoice } from "#lib/cawco/transcript/voice.js";
  import type { Message } from "#lib/cawco/types.js";
  import SessionDetails from "#lib/cawco/workspace/SessionDetails.svelte";
  import { Alert, AlertDescription } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as Popover from "#lib/components/ui/popover/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import Tip from "#lib/components/ui/tooltip/tip.svelte";
  import { IconMaximize, IconPlus } from "#lib/icons.js";
  import { formatAgeShort } from "#lib/utils/time.js";
  import CawStarters from "./CawStarters.svelte";
  import { type CawLead, HEAD_NEXT } from "./caw-lead.svelte";

  let {
    lead,
    projectId,
    projectName,
    starters,
  }: {
    lead: CawLead;
    projectId: string;
    projectName: string;
    /** The project's starters (its stages' `starters`). */
    starters: Starter[];
  } = $props();

  const viewId = untrack(() => `caw-panel:${projectId}`);
  const off = $derived(lead.view !== null && !lead.view.on);

  // --- the thread on show -----------------------------------------------------

  const threads = $derived(threadsOf(projectId));
  /** The thread drawn: the newest when the panel opens; null, a new one. */
  let threadId = $state<string | null>(
    untrack(() => threadsOf(projectId)[0]?.id ?? null)
  );
  /** New thread was chosen: the newest arriving later does not take its place. */
  let fresh = $state(false);
  $effect(() => {
    const newest = threads[0]?.id;
    if (newest && threadId === null && !fresh && !echo) {
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

  /**
   * Your words this panel is sending, with what rode with them, drawn as
   * your row until the hub's answer brings the thread's own (the store
   * adopts it then); a refusal takes them back to the composer.
   */
  let echo = $state<{ id: string; text: string; extras: SendExtras } | null>(
    null
  );
  /** The send is out and the hub has not answered it. */
  let sending = $state(false);
  /** Why the last send did not go, over the composer until the next one (ThreadPane's). */
  let sendError = $state("");
  /** The failed send never reached the hub: its line offers Send again. */
  let sendAgain = $state(false);
  /** Try again is out. */
  let retrying = $state(false);
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
    if (echoShown || retrying) {
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

  /**
   * What his line says he is doing, and the face it shows: your send's
   * standing until he is in a turn (waking, or that he did not wake), then
   * his own (`lead`). Past the project's cap with nothing more pressing,
   * the cap's line, as his head's line says it. Off and at rest, that only
   * your words wake him.
   */
  const said = $derived.by((): { line: string; face: CawFile } => {
    if (delivery?.kind === "failed") {
      return { line: "Didn't wake", face: "sleeping" };
    }
    if (delivery?.kind === "sending" || delivery?.kind === "waking") {
      return { line: "Waking…", face: "loading" };
    }
    if (lead.capSays) {
      return { line: lead.capSays, face: lead.status };
    }
    if (off && lead.status === "sleeping") {
      return { line: "Answers when you write", face: lead.status };
    }
    return { line: lead.sentence, face: lead.status };
  });
  const waking = $derived(
    delivery?.kind === "sending" || delivery?.kind === "waking"
  );

  /** Caw stands as the hero until a thread is on show or your first words are. */
  const hero = $derived(threadId === null && !echoShown);

  const session = $state<SessionState>(
    untrack(() => ({ ...blankSession(viewId), harness: "claude" }))
  );
  $effect.pre(() => {
    const blocks: Message[] = [];
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
    // Your words before the hub has them, drawn as a session's own unsent
    // row (transcript/local), its note saying where they stand.
    if (echoShown) {
      const block = localUserMessage(
        viewId,
        echoShown.id,
        echoShown.text,
        echoShown.extras
      );
      blocks.push({
        ...block,
        metadata: { ...block.metadata, ...(note ? { delivery: note } : {}) },
      });
    }
    // Until his turn starts, his row under your words says he is waking;
    // the turn's own live row takes its place.
    if (waking) {
      blocks.push({
        id: `${viewId}:waking`,
        instanceId: viewId,
        type: "assistant",
        content: "Waking…",
      } as Message);
    }
    session.blocks = blocks;
    session.messages = blocks;
    session.initialized = threadId === null || messages !== null;
    session.busy = working;
    session.streaming = streaming;
  });

  setVoice({ face });

  // --- sending ---------------------------------------------------------------------

  let foot = $state<ComposerFoot>({ stack: 0, perch: 0, parked: 0 });

  /**
   * Your words to him, as a thread tab sends them (ThreadPane): with no
   * thread on show they start one, and the panel binds to the thread the
   * hub made; else they go into it. A refusal puts the words, and what rode
   * with them, back in the composer with the reason over it.
   */
  async function say(
    text: string,
    extras: SendExtras,
    id: string
  ): Promise<void> {
    echo = { id, text, extras };
    sending = true;
    sendError = "";
    sendAgain = false;
    try {
      if (threadId) {
        await sayInThread(projectId, threadId, text, id, extras);
      } else {
        const started = await startThread(projectId, text, id, extras);
        threadId = started.thread.id;
        fresh = false;
      }
    } catch (error) {
      echo = null;
      lead.draft.restore(text, extras);
      sendAgain = unreachable(error);
      sendError = sendAgain ? THREAD_SEND_UNREACHED : failureWords(error);
    } finally {
      sending = false;
    }
  }

  /**
   * The same words again, in the same thread: he is woken with them. The
   * words stay kept in the thread, so a refusal only says why over the
   * composer.
   */
  async function wakeAgain(text: string): Promise<void> {
    if (!threadId) {
      return;
    }
    retrying = true;
    sendError = "";
    sendAgain = false;
    try {
      await sayInThread(projectId, threadId, text, newId());
    } catch (error) {
      sendError = failureWords(error);
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

  /** A starter's words into the composer, the caret after them; nothing is sent. */
  function put(text: string) {
    lead.draft.text = text;
    lead.draft.focusWanted = true;
  }

  /** A thread to show, or a new one (`null`). */
  function choose(id: string | null) {
    echo = null;
    threadId = id;
    fresh = id === null;
  }

  /** The project's threads past the one on show, newest first. */
  const earlier = $derived(
    threads.filter((each) => each.id !== threadId).slice(0, 5)
  );

  // --- his lead session's card ---------------------------------------------------

  const leadId = $derived(lead.view?.leadInstanceId ?? null);
  const fine = new MediaQuery("(hover: hover) and (pointer: fine)");
  let cardOpen = $state(false);
  let cardPinned = $state(false);
  let cardAnchor = $state<HTMLElement | null>(null);
  let cardTimer: ReturnType<typeof setTimeout> | undefined;
  /** As a session tab's card: a pointer resting 350ms opens it, leaving for 250ms closes it, a press keeps it. */
  function cardRest(event: PointerEvent) {
    if (!fine.current || event.pointerType !== "mouse" || cardPinned) {
      return;
    }
    clearTimeout(cardTimer);
    cardTimer = setTimeout(() => {
      cardOpen = true;
    }, 350);
  }
  function cardLeave() {
    clearTimeout(cardTimer);
    if (!cardPinned) {
      cardTimer = setTimeout(() => {
        cardOpen = false;
      }, 250);
    }
  }
  function cardPress(event: MouseEvent) {
    cardAnchor = event.currentTarget as HTMLElement;
    clearTimeout(cardTimer);
    if (cardOpen && cardPinned) {
      cardOpen = false;
      cardPinned = false;
      return;
    }
    cardOpen = true;
    cardPinned = true;
  }
  $effect(() => () => clearTimeout(cardTimer));
  /** The harnesses Caw runs on, as the hub lists them (its `CAW_HARNESSES`). */
  const CAW_HARNESSES = Object.keys(CAW_DENIED_TOOLS) as CawHarness[];
  const runsCaw = (harness: HarnessKind): harness is CawHarness =>
    (CAW_HARNESSES as HarnessKind[]).includes(harness);
  /**
   * Which of his settings the last change was: the card says a model
   * change's pending, done and refusal on the model's line, and the
   * switch's refusal under the switch.
   */
  let changing = $state<"model" | "on" | null>(null);

  // --- on and off ------------------------------------------------------------------

  const on = $derived(lead.view?.on ?? false);
  /**
   * Turning him off (The Stay In Context Rule): nothing he started runs,
   * and it just flips. Only his own turn an event started is in flight: one
   * line under the switch asks whether it finishes or stops, a light choice
   * about one thing. Sessions he started still run: the tray (CawOffTray)
   * unfolds under the switch and names each one first, as a forget does.
   * What runs is read again as you flip, so the choice is about what is
   * true now.
   */
  let turnLine = $state<CawRunning | null>(null);
  /** The turn's stop was asked: the line waits for the hub's word that it stopped. */
  let cutting = $state(false);
  /** What he started still runs: the tray asks about it, under the switch. */
  let offAsk = $state<CawOffAsk | null>(null);

  async function flip(next: boolean): Promise<void> {
    if (turnLine) {
      // The switch again while the line asks: nothing changes.
      turnLine = null;
      return;
    }
    if (offAsk) {
      // The switch again while the tray asks: nothing changes.
      offAsk = null;
      return;
    }
    changing = "on";
    if (next) {
      await lead.configure({ on: true });
      return;
    }
    await lead.read();
    const running = lead.view?.running ?? [];
    if (running.length === 0) {
      await lead.configure({ on: false });
    } else if (running.every((one) => one.kind === "turn")) {
      turnLine = running[0] ?? null;
    } else {
      offAsk = {
        projectId,
        projectName,
        running,
        settled: (view) => {
          lead.view = view;
        },
      };
    }
  }

  /** His own turn finishes or stops as he turns off; a stop's line stays until it has. */
  async function offWithTurn(initiated: CawInitiated): Promise<void> {
    const turn = turnLine;
    if (!turn) {
      return;
    }
    changing = "on";
    if (initiated === "finish") {
      await lead.configure({ on: false, initiated });
      turnLine = null;
      return;
    }
    cutting = true;
    const unhear = onProjectStop((frame) => {
      if (frame.instanceId === turn.id) {
        unhear();
        cutting = false;
        turnLine = null;
      }
    });
    await lead.configure({ on: false, initiated });
    if (lead.refused) {
      unhear();
      cutting = false;
    }
  }

  // A turn begins: his view is read again, so his line says what it answers
  // (a turn no thread woke works here, not on a thread).
  let wasWorking = false;
  $effect(() => {
    const inTurn = lead.status === "working";
    if (inTurn && !wasWorking) {
      untrack(() => lead.read());
    }
    wasWorking = inTurn;
  });

  /**
   * His settings, as his lead session's card keeps them: his view
   * (CawView) is the setting. A model picked on a harness's rail moves him
   * to the two together; his on/off stands first in the row, and what
   * turning him off asks stands under it.
   */
  const kept = $derived(
    lead.view
      ? {
          harness: lead.view.harness,
          model: lead.view.model,
          harnesses: CAW_HARNESSES,
          onchoose: ({
            harness,
            model,
          }: {
            harness: HarnessKind;
            model: string;
          }) => {
            if (!runsCaw(harness)) {
              return;
            }
            changing = "model";
            lead.configure(
              harness === lead.view?.harness
                ? { model: model || null }
                : { harness, model: model || null }
            );
          },
          pending: lead.moving && changing === "model",
          refused: changing === "model" ? lead.refused : null,
          setting: onSwitch,
          asks: offAsks,
        }
      : null
  );
</script>

<!-- His on/off, a chip of the card's settings row: the kit switch, read
     out as the fleet's rows read theirs ("Turn off Caw"). The hub's answer
     is its state: a flip asks it, and a refusal leaves it where the hub
     says he is. -->
{#snippet onSwitch()}
  <!-- biome-ignore lint/a11y/noLabelWithoutControl: the Switch is a bits-ui button[role=switch] the label names; Biome can't see through the component boundary -->
  <label class="ns-chip-btn tool lead-switch">
    <Switch
      aria-label={on ? "Turn off Caw" : "Turn on Caw"}
      disabled={lead.moving || cutting}
      size="sm"
      bind:checked={() => on, (next) => flip(next)}
    />
    <span class="chip-label">{on ? "On" : "Off"}</span>
  </label>
{/snippet}

<!-- What turning him off asks first, under the row: his own turn's line,
     or the tray naming what he started. A refusal of the switch says why. -->
{#snippet offAsks()}
  {#if turnLine}
    <div class="turn-off" data-caw-turn-line transition:unfold>
      <p class="turn-words">
        {turnLine.title ?? "Answering an event"}. Off, it can finish or stop
        now.
      </p>
      <div class="turn-ways">
        <Button
          disabled={cutting || lead.moving}
          label="Let him finish"
          onclick={() => offWithTurn("finish")}
          size="sm"
          variant="outline"
        />
        <Button
          disabled={lead.moving}
          label="Stop now"
          onclick={() => offWithTurn("stop")}
          pending={cutting}
          pendingLabel="Stopping…"
          size="sm"
          variant="outline"
        />
      </div>
    </div>
  {/if}
  {#if offAsk}
    {@const asked = offAsk}
    <div class="off-tray">
      <CawOffTray
        ask={asked}
        onclose={() => {
          if (offAsk === asked) {
            offAsk = null;
          }
        }}
      />
    </div>
  {/if}
  {#if changing === "on" && lead.refused}
    <p class="switch-refused" role="alert">{lead.refused}</p>
  {/if}
{/snippet}

{#snippet face(live: boolean)}
  <CawFace size={18} status={live ? "working" : "ready"} />
{/snippet}

<!-- His name over his line: opens his lead session's card. Off, Turn on
     stands on the line, so nothing under it moves. -->
{#snippet identity(big: boolean)}
  <div class={["identity", big && "big"]}>
    {#if leadId}
      <button
        aria-expanded={cardOpen}
        aria-haspopup="dialog"
        class="name press-tint"
        onclick={cardPress}
        onpointerenter={(event) => {
          cardAnchor = event.currentTarget;
          cardRest(event);
        }}
        onpointerleave={cardLeave}
        type="button"
      >
        Caw{#if off}<span class="off-word">{" · off"}</span>{/if}
      </button>
    {:else}
      <span class="name"
        >Caw{#if off}<span class="off-word">{" · off"}</span>{/if}</span
      >
    {/if}
    <span class="line" data-caw-line>
      <span class="said">{said.line}</span>
      {#if off}
        <span aria-hidden="true">·</span>
        <button
          class="link"
          disabled={lead.moving}
          onclick={() => lead.configure({ on: true })}
          type="button"
        >
          Turn on
        </button>
      {/if}
    </span>
  </div>
{/snippet}

<!-- What stands over the composer: a wake that failed and the way to try
     again, where a session's composer says its own send error. -->
{#snippet ahead()}
  {#if delivery?.kind === "failed"}
    {@const failed = delivery}
    <div class="delivery" data-caw-delivery="failed" role="alert" in:appear>
      <p>
        Caw didn't wake. {failed.why} Your message is kept. Try again to wake him
        with it.
      </p>
      <Button
        label="Try again"
        onclick={() => failed.again()}
        pending={retrying}
        pendingLabel="Sending…"
        size="sm"
      />
    </div>
  {/if}
{/snippet}

<div class="caw-thread" data-caw-panel>
  {#if !hero}
    <div class="head" data-caw-head>
      <CawFace size={28} status={said.face} />
      {@render identity(false)}
      <div class="head-actions">
        <Tip label="New thread">
          {#snippet children(tip)}
            <Button
              {...tip}
              aria-label="New thread"
              icon={IconPlus}
              onclick={() => choose(null)}
              size="icon-sm"
              variant="ghost"
            />
          {/snippet}
        </Tip>
        {#if threadId}
          <Tip label="Open as a tab">
            {#snippet children(tip)}
              <Button
                {...tip}
                aria-label="Open as a tab"
                href={threadHref(threadId ?? "")}
                icon={IconMaximize}
                size="icon-sm"
                variant="ghost"
              />
            {/snippet}
          </Tip>
        {/if}
      </div>
    </div>
  {/if}
  <div
    class="body"
    style="--composer-clearance: calc(max(var(--c-composer-panel) + var(--c-tray-row), {foot.stack}px) + var(--space-4) + var(--space-4))"
  >
    {#if hero}
      <div class="hero kit-edge-fade-block" data-caw-hero>
        <div class="hero-mark">
          <Caw next={HEAD_NEXT} size={80} status={lead.status} still />
        </div>
        {@render identity(true)}
        <CawStarters onpick={put} {starters} />
        {#if earlier.length > 0}
          <section aria-label="Earlier threads" class="earlier">
            <h3>Earlier</h3>
            <ul>
              {#each earlier as each (each.id)}
                {@const row = cawco.instanceIndex.byId.get(
                  threadTabId(each.id)
                )}
                <!-- A press shows the thread here; a press that opens a
                     tab (a modifier, the middle button) still does. -->
                <li
                  onclickcapture={(event) => {
                    if (
                      event.button === 0 &&
                      !(event.metaKey || event.ctrlKey || event.shiftKey)
                    ) {
                      event.preventDefault();
                      event.stopPropagation();
                      choose(each.id);
                    }
                  }}
                >
                  <SessionRow
                    href={threadHref(each.id)}
                    instance={row ?? null}
                    machineId={row?.machineId ?? "hub"}
                    peek={false}
                    title={each.title}
                    trail={formatAgeShort(each.lastAt, clock.now)}
                  />
                </li>
              {/each}
            </ul>
          </section>
        {/if}
      </div>
    {:else if readProblem}
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
    {:else}
      <Composer
        agentName="Caw"
        busy={working}
        draft={lead.draft}
        onfoot={(next) => {
          foot = next;
        }}
        oninterruptsend={(text, extras, id) => {
          stop();
          // biome-ignore lint/complexity/noVoid: the send's own state is its row's note and the composer's error line
          void say(text, extras, id);
        }}
        onstop={stop}
        onsubmit={(text, extras, id) => {
          // biome-ignore lint/complexity/noVoid: the send's own state is its row's note and the composer's error line
          void say(text, extras, id);
        }}
        placeholder="Message Caw…"
        prompts={ahead}
        {sendAgain}
        {sendError}
        {sending}
      />
    {/if}
  </div>
</div>

{#if leadId}
  <Popover.Root
    onOpenChange={(next) => {
      if (!next) {
        cardOpen = false;
        cardPinned = false;
      }
    }}
    open={cardOpen}
  >
    <Popover.Content
      align="start"
      aria-label="Caw's session"
      class="caw-lead-card"
      collisionPadding={12}
      customAnchor={cardAnchor}
      onfocusin={() => {
        clearTimeout(cardTimer);
        cardPinned = true;
      }}
      onOpenAutoFocus={(event) => {
        if (!cardPinned) {
          event.preventDefault();
        }
      }}
      onpointerdowncapture={() => {
        clearTimeout(cardTimer);
        cardPinned = true;
      }}
      onpointerenter={() => clearTimeout(cardTimer)}
      onpointerleave={cardLeave}
      side="bottom"
      sideOffset={4}
      trapFocus={cardPinned}
    >
      <SessionDetails
        dir={1}
        href={threadId
          ? threadHref(threadId)
          : `/project/${encodeURIComponent(projectId)}`}
        {kept}
        onclose={() => {
          cardOpen = false;
          cardPinned = false;
        }}
        sessionId={leadId}
        title="Caw · lead of {projectName}"
      />
    </Popover.Content>
  </Popover.Root>
{/if}

<style>
  .caw-thread {
    display: flex;
    flex-direction: column;
    flex: 1 1 auto;
    min-block-size: 0;
    block-size: 100%;
  }
  /* His face, his name over his line, and the thread's two actions: the
     head a session pane's tab row stands in for, on the panel's surface. */
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    padding: var(--space-2) var(--space-2) var(--space-2) var(--space-3);
    border-block-end: 1px solid var(--border-hairline);
  }
  .head-actions {
    display: flex;
    gap: var(--space-1);
    margin-inline-start: auto;
  }
  .identity {
    display: flex;
    flex-direction: column;
    align-items: flex-start;
    min-inline-size: 0;
  }
  .identity.big {
    align-items: center;
    gap: var(--space-1);
    text-align: center;
  }
  .name {
    margin-inline: calc(var(--space-1) * -1);
    padding-inline: var(--space-1);
    border: 0;
    border-radius: var(--radius-xs);
    background: none;
    font: var(--type-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  button.name {
    cursor: pointer;
    transition: background-color var(--dur-control) var(--ease-out);
  }
  @media (hover: hover) {
    button.name:hover {
      background: var(--surface-hover);
    }
  }
  button.name:focus-visible {
    outline: var(--focus-ring-width) solid var(--focus-ring);
    outline-offset: var(--focus-ring-offset);
  }
  .big .name {
    font: var(--type-title);
  }
  .off-word {
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  .line {
    display: flex;
    align-items: baseline;
    gap: var(--space-1);
    max-inline-size: 100%;
    min-inline-size: 0;
    font: var(--type-meta);
    color: var(--ink-muted);
    white-space: nowrap;
  }
  .big .line {
    font: var(--type-body);
  }
  .said {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
  }
  .link {
    flex: none;
    padding: 0;
    border: 0;
    background: none;
    font: inherit;
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
  /* The well holds the hero or the thread; the composer stands over its
     bottom as a session's composer stands over its pane. */
  .body {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    min-block-size: 0;
  }
  /* He stands centred in the room over the composer, as New project and the
     empty board stand him; a hero taller than the room (earlier threads
     under the chips) starts at its top and scrolls. */
  .hero {
    display: flex;
    flex: 1 1 auto;
    flex-direction: column;
    justify-content: safe center;
    align-items: center;
    gap: var(--space-4);
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
    padding: var(--space-8) var(--space-4) var(--composer-clearance);
  }
  .hero-mark {
    display: grid;
    place-items: center;
    min-block-size: 80px;
  }
  .hero > :global(.caw-starters) {
    max-inline-size: 100%;
  }
  .earlier {
    align-self: stretch;
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    margin-block-start: var(--space-2);
  }
  .earlier h3 {
    padding-inline: var(--space-2);
    font: var(--type-meta);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .earlier ul {
    margin: 0;
    padding: 0;
    list-style: none;
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
  /* The lead's problem where the composer stands (Composer .dock). */
  .foot {
    position: absolute;
    inset-inline: 0;
    inset-block-end: calc(var(--space-4) + var(--safe-bottom));
    z-index: 20;
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
  /* His on/off in the card's settings row: a chip of the row (ns-theme
     `.ns-chip-btn`), the kit switch leading its word. */
  .lead-switch {
    cursor: pointer;
  }
  /* What turning him off asks, under the row, in the card's meta type. */
  .turn-off {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-start: var(--space-3);
  }
  .turn-words {
    font-size: var(--text-body);
    line-height: var(--leading-body);
    color: var(--ink-muted);
  }
  .turn-ways {
    display: flex;
    gap: var(--space-2);
  }
  .off-tray {
    margin-block-start: var(--space-3);
  }
  /* The card's failure line (SessionDetails `.failure`). */
  .switch-refused {
    margin-block-start: var(--space-2);
    font-size: var(--text-body);
    line-height: var(--leading-body);
    color: var(--status-fail-ink);
  }
  /* His lead session's card: a session tab's card's width (PaneTabs
     `.session-details-popover`), its content edge to edge. */
  :global(.kit-pop.caw-lead-card) {
    display: flex;
    width: min(416px, calc(100vw - 24px));
    max-height: min(760px, var(--bits-popover-content-available-height, 85dvh));
    overflow: hidden;
    padding: 0;
  }
</style>
