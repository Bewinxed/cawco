<script lang="ts">
  import { accessLabel } from "@cawco/core/connect-ask";
  import type { ConnectAccess } from "@cawco/core/frames";
  import type {
    PermissionResult,
    UserAnswers,
    UserQuestion,
  } from "@cawco/core/harness";
  import { askerLine } from "@cawco/core/permission-presentation";
  import { questionsOf } from "@cawco/core/question";
  import { askWords } from "@cawco/core/words/asks";
  /**
   * The one human-in-the-loop surface, held in the composer's grown shape
   * (Composer, grown.ts): a permission gate (a measurably-symmetric Approve /
   * Deny pair, with scope-widening kept apart), a question (selectable
   * answers, and a line for an answer of the reader's own), a browser ask
   * (Take over or Deny) or a connect ask (Connect or Not now). Each
   * settles its parked tool call by handing the answer up, where it goes out
   * as one tracked command whose stages this card's wait line reads; a
   * take-over and a sign-in settle it on the hub.
   *
   * The composer draws the surface: this is what stands in it. Its title,
   * its body and its foot come up out of a slight blur one after the other
   * as the shape grows (`shown`), and sink back as it folds.
   */
  import { tick, untrack } from "svelte";
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import {
    IconAsk,
    IconCheck,
    IconChevronDown,
    IconClose,
    IconGlobe,
    IconInteract,
    IconKey,
    IconShield,
    IconTick,
  } from "#lib/icons.js";
  import {
    cawco,
    commandRecord,
    isStale,
    type PendingPermission,
    permissionAnswer,
    takeOverBrowser,
  } from "../client.svelte";
  import { hubSeam } from "../hub-live";
  import OriginText from "../OriginText.svelte";
  import { suggestedRule } from "../permission-summary";
  import { questionAnswer, questionDismissal } from "../question";
  import RowFault from "../RowFault.svelte";
  import ConnectAddress from "./ConnectAddress.svelte";
  import { connectSignIns, faultWords } from "./connect-sign-ins.svelte";

  let {
    request,
    onanswer,
    asker = "the agent",
    place = null,
    shown = false,
    onminimize,
  }: {
    /**
     * Folds a question or a connect ask down to its bar over the composer,
     * answering nothing (minimized-asks.svelte.ts). Given only for those; a
     * card without it has no minimize control and no swipe.
     */
    onminimize?: () => void;
    request: PendingPermission;
    /** Where this ask stands among the ones waiting ("2 of 3"); none when it is alone. */
    place?: { at: number; of: number } | null;
    /** Whether what stands in the shape is up: the shape has grown to hold it. */
    shown?: boolean;
    /** Who asks, as the conversation names its agent ("Caw" in a thread). */
    asker?: string;
    /**
     * Submits this card's answer and hands back the id of the command it went
     * out as — what the wait line reads its stage from. `null` when nothing
     * could be submitted, which leaves the line saying only what the latch and
     * the socket already say.
     */
    onanswer: (result: PermissionResult) => string | null;
  } = $props();

  /**
   * A browser ask (core `BrowserAskFrame`): Take over is `takeOverBrowser`,
   * the one take-over Needs you's row runs too; Deny answers the call,
   * with the person's own words when its "Other" chip opened the line for
   * them. That chip and its line are the question card's own (`openOther`,
   * `writeOther`, `otherKey`): the ask is one question, its reason, with no
   * options of its own.
   */
  const browserAsk = $derived(request.browserAsk ?? null);
  /** What the hub refused the take-over with. */
  let takeRefused = $state<string | null>(null);

  async function takeOver(): Promise<void> {
    if (!(answerable && browserAsk)) {
      return;
    }
    pressed = "allow";
    takeRefused = null;
    takeRefused = await takeOverBrowser(request.requestId, browserAsk);
    // Refused: the button is free again.
    if (takeRefused !== null) {
      pressed = null;
    }
  }

  /** Deny, with the words the person wrote on the "Other" line, if any. */
  function denyBrowser(): void {
    if (!(answerable && browserAsk)) {
      return;
    }
    pressed = "deny";
    commandId = onanswer({
      behavior: "deny",
      message: (others[browserAsk.reason] ?? "").trim(),
    });
  }

  /**
   * A connect ask (core `ConnectAskFrame`): the agent's reason, the
   * provider's whole sign-in address, the access as a choice when the
   * server offers more than one, then Connect and Not now at the row's two
   * ends. Connect is the hub's sign-in for that server (connect-sign-ins:
   * its tab, its wait, why it did not come back), which outlives this card
   * minimized or folding; the hub's sign-in landing answers the call. Not
   * now declines, with the Other line's words, as a browser ask's Deny
   * does, and stays live while the provider's page is open: nothing holds
   * that answer but the person.
   */
  const connect = $derived(request.connectAsk ?? null);
  const signIn = $derived(connectSignIns.of(request.requestId));
  /** The access picked: a reconnect's held one, else read-only first, as the choice presses it. */
  let connectAccess = $state<ConnectAccess | null>(
    untrack(
      () =>
        request.connectAsk?.held ??
        request.connectAsk?.offers[0]?.access ??
        null
    )
  );
  /** The server as the fleet reads it now: signed in, and as whom. */
  const connectServer = $derived(
    connect
      ? ((cawco.fleetMcp ?? []).find((one) => one.name === connect.server) ??
          null)
      : null
  );
  // The hub's word that it signed in, while this ask waited on it: done,
  // and its card holds a beat as whom before the shape folds.
  $effect(() => {
    if (
      connect &&
      signIn.stage === "waiting" &&
      connectServer?.auth?.state === "signed-in"
    ) {
      untrack(() => connectSignIns.landed(request.requestId));
    }
  });

  function pressConnect(): void {
    if (
      !(answerable && connect) ||
      signIn.stage === "waiting" ||
      signIn.stage === "done"
    ) {
      return;
    }
    connectSignIns.connect(request.requestId, connect.server, connectAccess);
  }

  function declineConnect(): void {
    if (!(answerable && connect)) {
      return;
    }
    connectSignIns.declined(request.requestId);
    pressed = "deny";
    commandId = onanswer({
      behavior: "deny",
      message: (others[connect.reason] ?? "").trim(),
    });
  }

  /** What the card is, as its title and a screen reader name it. */
  const cardLabel = $derived.by(() => {
    if (browserAsk) {
      return askWords.browserAskFrom(asker);
    }
    if (connect) {
      return connect.again
        ? askWords.reconnectAskFrom(asker)
        : askWords.connectAskFrom(asker);
    }
    return questions
      ? askWords.questionFrom(asker)
      : askWords.permissionFrom(who);
  });

  /** Names each question's lede, which labels its option group. */
  const claimId = $props.id();
  const input = $derived(request.input as Record<string, unknown>);
  const questions = $derived(questionsOf(request.toolName, input));
  /**
   * The questions the "Other" line answers: a question card's, or a
   * browser ask's one, its reason, which Deny sends the line's words with.
   */
  const asked = $derived<UserQuestion[] | null>(
    questions ??
      (browserAsk || connect
        ? [
            {
              question: browserAsk?.reason ?? connect?.reason ?? "",
              header: "",
              options: [],
              multiSelect: false,
            },
          ]
        : null)
  );
  const presentation = $derived(request.presentation);
  /** Who asks and where: "Caw · cockpit". */
  const who = $derived(askerLine(presentation));

  /**
   * The command under the reason: one line until opened, so the sentence
   * leads. The disclosure is offered only when there is more than the line
   * shows: a second line, or a first line wider than the card.
   */
  // Open from the start when the session gave no reason: then the command is
  // all there is to read. The card is keyed by its ask, so this is per ask.
  let commandOpen = $state(
    untrack(
      () =>
        !(
          typeof request.input.description === "string" &&
          request.input.description.trim()
        )
    )
  );
  let commandLine = $state<HTMLElement | null>(null);
  let commandClipped = $state(false);
  const command = $derived(presentation.command ?? null);
  $effect(() => {
    const node = commandLine;
    const whole = command;
    if (!(node && whole)) {
      commandClipped = false;
      return;
    }
    const measure = () => {
      commandClipped =
        whole.trim().includes("\n") || node.scrollWidth > node.clientWidth;
    };
    // Read now, and a change in the next frame (frameObserver): the line's
    // disclosure comes and goes on it.
    measure();
    const sizes = frameObserver(measure);
    sizes.observe(node);
    return () => sizes.disconnect();
  });
  const rule = $derived(
    request.suggestions ? suggestedRule(request.suggestions) : null
  );

  // The reader's selections, keyed by question text — the shape the tool reads.
  let answers = $state<UserAnswers>({});

  const isAnswered = (q: UserQuestion): boolean => {
    const value = answers[q.question];
    return Array.isArray(value) ? value.length > 0 : !!value;
  };

  /** Every multi-select branch reads one answer as a list, whatever shape it arrived in. */
  const asList = (value: string | string[] | undefined): string[] => {
    if (Array.isArray(value)) {
      return value;
    }
    return value ? [value] : [];
  };

  const allAnswered = $derived(!!questions && questions.every(isAnswered));

  /**
   * The question being answered: the one keyboard focus is in, and after a
   * pick the first question still unanswered.
   */
  let current = $state(0);

  /**
   * Each question's options are one kit option group (ui/option-group): one
   * tab stop per question, the arrows moving inside it, a click, Space or
   * the option's digit picking, Enter answering once every question has an
   * answer. A digit is heard only while focus is in its question's group.
   *
   * "Other" is one of its group's options, under a value no option label
   * can be, so the arrows and its digit reach it too.
   */
  const OTHER = "\u0000other";

  /**
   * A question whose options say more than their labels, or that has more
   * than a row of chips holds, lists them instead: one full-width row per
   * option, its label over its description. Three or fewer bare labels stay
   * a row of chips.
   */
  const listed = (q: UserQuestion): boolean =>
    q.options.length > 3 || q.options.some((o) => !!o.description?.trim());

  /** Focus to a question's tab stop: the option it last left from, or its first. */
  async function focusQuestion(index: number): Promise<void> {
    await tick();
    const group = card?.querySelectorAll('[data-slot="option-group"]')[index];
    group?.querySelector<HTMLElement>('[tabindex="0"]')?.focus();
  }

  /**
   * The digits move on to the first question still unanswered, and so does
   * focus when it is in the card: 1, 2, 1, Enter answers three questions,
   * as Space, Space, Space does from the chips.
   */
  function advance(): void {
    if (!questions) {
      return;
    }
    const next = questions.findIndex((q) => !isAnswered(q));
    if (next === -1) {
      return;
    }
    current = next;
    if (card?.contains(document.activeElement)) {
      focusQuestion(next);
    }
  }

  /** The options a question's chips show pressed, with Other while it holds the answer or its field is open. */
  function pressedOf(q: UserQuestion, index: number): string[] {
    const chosen = asList(answers[q.question]).filter((l) =>
      q.options.some((o) => o.label === l)
    );
    return otherPicked(q) || otherAt === index ? [...chosen, OTHER] : chosen;
  }

  /**
   * A single answer, picked. Pressing the chosen option keeps it (the
   * group never toggles a pick off); a mis-pick is undone by picking
   * another.
   */
  function setSingle(index: number, label: string): void {
    const q = questions?.[index];
    if (!(q && answerable && label)) {
      return;
    }
    current = index;
    answers = { ...answers, [q.question]: label };
    // A picked option is the answer: the field's own goes back to waiting.
    if (otherAt === index) {
      otherAt = null;
    }
    advance();
  }

  /** A multi-select's options, as its group holds them; the reader's own words stay among them. */
  function setMulti(index: number, labels: string[]): void {
    const q = questions?.[index];
    if (!(q && answerable)) {
      return;
    }
    current = index;
    const own = otherPicked(q) ? [others[q.question].trim()] : [];
    answers = {
      ...answers,
      [q.question]: [...labels.filter((l) => l !== OTHER), ...own],
    };
  }

  /** "Other" opens its field instead of being picked: its answer is what is written there. */
  function pressOther(event: MouseEvent, index: number): void {
    event.preventDefault();
    openOther(index);
  }

  const isSelected = (question: string, label: string): boolean => {
    const value = answers[question];
    return Array.isArray(value) ? value.includes(label) : value === label;
  };

  /**
   * An answer of the reader's own, written in a field under the question's
   * choices. It answers the question it was opened for (`otherAt`); what was written
   * for each question is kept, so going back to it finds it there.
   */
  let otherAt = $state<number | null>(null);
  let others = $state<Record<string, string>>({});
  let otherField = $state<HTMLInputElement | null>(null);

  /** Whether a question's answer is the reader's own words. */
  const otherPicked = (q: UserQuestion): boolean => {
    const own = others[q.question]?.trim();
    return !!own && isSelected(q.question, own);
  };

  /** The field's words become the answer, in place of what they were before. */
  function writeOther(text: string): void {
    const q = otherAt === null ? undefined : asked?.[otherAt];
    if (!q) {
      return;
    }
    const was = others[q.question]?.trim() ?? "";
    const own = text.trim();
    others = { ...others, [q.question]: text };
    if (!q.multiSelect) {
      answers = { ...answers, [q.question]: own };
      return;
    }
    const list = asList(answers[q.question]).filter((l) => l !== was);
    answers = { ...answers, [q.question]: own ? [...list, own] : list };
  }

  /** "Other": the field's line opens for this question's own answer. */
  async function openOther(index: number): Promise<void> {
    const q = asked?.[index];
    if (!(q && answerable)) {
      return;
    }
    current = index;
    otherAt = index;
    // Back to words already written: they are the answer again.
    writeOther(others[q.question] ?? "");
    await tick();
    otherField?.focus();
  }

  /**
   * The keys the field's line answers: Enter sends or moves on to the next
   * question still unanswered, Esc puts it down and hands focus back to its
   * question's chips. Shift+Tab out of it reaches those chips on its own:
   * they are the tab stop before it.
   */
  function otherKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      if (otherAt !== null) {
        focusQuestion(otherAt);
      }
      otherAt = null;
      return;
    }
    if (event.key !== "Enter" || event.shiftKey || event.isComposing) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    // A browser ask's line goes with its Deny, a connect ask's with Not now.
    if (browserAsk) {
      denyBrowser();
      return;
    }
    if (connect) {
      declineConnect();
      return;
    }
    if (allAnswered) {
      submitQuestion();
      return;
    }
    // Focus is still in the field here, so `advance` carries it on.
    advance();
    otherAt = null;
  }

  // A permission blocks the turn that asked it, so its answer must land exactly
  // once and only when it can reach the daemon that asked. `pressed` latches
  // the card the instant it is answered — a double-tap, or an Enter after a
  // click, cannot answer twice — and every path refuses while the hub is
  // unreachable, or the session's machine is (its row reads `unknown`, as
  // NeedsCard holds a stale ask): the answer would resolve into nothing and
  // leave the turn wedged, so the card waits, and is live again the moment
  // the machine is. The pressed button pends (the kit's pending: spinner, its
  // label morphing to what it is doing) while its peers dim, until the gate
  // leaves; refused, it stops and the reason sits under the buttons.
  type Choice = "allow" | "deny" | "always" | "answer";
  let pressed = $state<Choice | null>(null);
  const row = $derived(cawco.instanceIndex.byId.get(request.instanceId));
  /** The hub as this card reads it: the live client's, or a states file's stand-in. */
  const hub = hubSeam();
  /** The session's machine is offline: the ask stands, its answer waits. */
  const offline = $derived(row ? isStale(row) : false);
  /** An answer can reach the daemon that asked: the hub is live, and its machine. */
  const reachable = $derived(hub.state === "connected" && !offline);
  const answerable = $derived(pressed === null && reachable);

  /**
   * The command this card's answer went out as. The card reads its OWN id
   * rather than the newest permission answer on the session: several cards can
   * be parked at once and they all answer in the same kind, so the newest one
   * belongs to whichever card was clicked last, not to this one.
   */
  let commandId = $state<string | null>(null);
  const record = $derived(commandId ? commandRecord(commandId) : null);
  /** What the answer was refused with, once the tracker has called it off. */
  const refused = $derived.by(() => {
    if (record?.stage !== "failed") {
      return null;
    }
    return record.reason
      ? `Couldn't send that answer. ${record.reason}`
      : "Couldn't send that answer.";
  });

  function answer(kind: "allow" | "deny" | "always"): void {
    if (!answerable) {
      return;
    }
    pressed = kind;
    commandId = onanswer(permissionAnswer(request, kind));
  }

  /** A button's part in the answer: pending while its answer is out, and the rest dimmed. */
  const pendingOf = (choice: Choice): boolean =>
    pressed === choice && refused === null;
  const failedOf = (choice: Choice): boolean =>
    pressed === choice && refused !== null;
  const disabledOf = (choice: Choice): boolean =>
    pressed === null ? !reachable : !pendingOf(choice);

  /**
   * Which question is being answered, said where the eye is: a hairline
   * rail on that question's lede, in the selection frame's ink, while
   * focus is in the card's options. Every question's keycaps look alike, so
   * with more than one question this is the one mark of where a digit
   * lands. It moves as focus does (a pick moves it on), gliding as the
   * house highlight's selection pill does; with reduced motion it is simply
   * there.
   */
  const ledes = $state<HTMLElement[]>([]);
  /** Focus is on one of the card's options. */
  let choosing = $state(false);
  let rail = $state<{ top: number; height: number } | null>(null);
  $effect(() => {
    const node = ledes[current];
    if (!(node && choosing && questions && questions.length > 1)) {
      rail = null;
      return;
    }
    const measure = () => {
      rail = { top: node.offsetTop, height: node.offsetHeight };
    };
    // Read now, and a change in the next frame (frameObserver): the rail is
    // placed on it.
    measure();
    const sizes = frameObserver(measure);
    sizes.observe(node);
    return () => sizes.disconnect();
  });

  let card = $state<HTMLElement | null>(null);

  /** Enter on an option: the card's answer, once every question has one. */
  function enter(): void {
    if (allAnswered) {
      submitQuestion();
    }
  }

  function submitQuestion(): void {
    if (!(answerable && allAnswered)) {
      return;
    }
    pressed = "answer";
    commandId = onanswer(questionAnswer(input, answers));
  }

  /** The Dismiss button, and only it: the question is put down, in the words iOS sends. */
  function dismissQuestion(): void {
    if (!answerable) {
      return;
    }
    pressed = "deny";
    commandId = onanswer(questionDismissal);
  }

  /**
   * A swipe down on a question's card minimizes it, as its chevron does. It
   * is read off the touch's start and end, not tracked: the body scrolls
   * under the finger, so a touch that starts in the body counts only when
   * the body is at its top, where a downward pull has nothing to scroll.
   * The title and the foot always count. Mostly downward, and far enough to
   * be meant: a tap on a chip, or a scroll, never minimizes.
   */
  const SWIPE = 56;
  const SWIPE_SLOPE = 0.7;
  let swipe: { x: number; y: number } | null = null;

  function swipeStart(event: TouchEvent): void {
    swipe = null;
    if (!onminimize || event.touches.length !== 1) {
      return;
    }
    const body =
      event.target instanceof Element
        ? event.target.closest('[data-slot="body"]')
        : null;
    if (body && body.scrollTop > 0) {
      return;
    }
    const [touch] = event.touches;
    swipe = { x: touch.clientX, y: touch.clientY };
  }

  function swipeEnd(event: TouchEvent): void {
    const start = swipe;
    swipe = null;
    const [touch] = event.changedTouches;
    if (!(start && touch && onminimize)) {
      return;
    }
    const down = touch.clientY - start.y;
    const across = Math.abs(touch.clientX - start.x);
    if (down >= SWIPE && across <= down * SWIPE_SLOPE) {
      onminimize();
    }
  }
</script>

<!-- Under the buttons, one line when there is something the buttons cannot
     say: the session's machine or the socket cannot carry an answer yet, or
     the hub refused the one sent and said why. A live region, so the
     refusal is heard. -->
{#snippet wait()}
  {#if takeRefused ?? refused}
    <p
      data-wait
      data-slot="refused"
      class="mt-space-2 text-size-meta font-normal text-status-fail-ink"
      role="status"
    >
      {takeRefused ?? refused}
    </p>
  {:else if pressed === null && offline}
    <p
      data-slot="wait"
      class="mt-space-2 text-size-meta font-normal text-ink-muted"
      role="status"
    >
      {connect
        ? askWords.connectOffline
        : "Machine offline — can't answer yet."}
    </p>
  {:else if pressed === null && !reachable}
    <p
      data-slot="wait"
      class="mt-space-2 text-size-meta font-normal text-ink-muted"
      role="status"
    >
      Reconnecting — can't answer yet.
    </p>
  {/if}
{/snippet}

<!-- The title: what asks, and who, with where it stands among the asks
     waiting when there are several ("2 of 3"): they come one at a time.
     The title, the body and the foot come up with the shape one after the
     other, out of a `--part-blur` blur as they fade and rise, and sink back
     together as it folds, each a stagger after the one before (`--part`);
     the delay outranks the shorthand, which resets it. Tested in iOS 27.2
     Safari on 2026-10-23 with a ~1,000-character Bash command's card
     (probe-kit ios-safari-motion, long-ask): the page answered a script
     within 18ms throughout, and each part's filter read 4px, then part way
     (2.01px, 0.39px), then none. -->
{#snippet title(text: string)}
  <h2
    class="mark-line flex items-center gap-space-2 mb-space-2 text-size-label font-medium text-ink-strong opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
    style:--part="0"
    style:--part-delay="calc(var(--part) * var(--dur-stagger))"
  >
    <span
      data-slot="glyph"
      aria-hidden="true"
      class="inline-grid flex-none place-items-center"
      data-box
    >
      {#if browserAsk}
        <IconGlobe class="size-icon-lg" />
      {:else if connect}
        <IconKey class="size-icon-lg" />
      {:else if questions}
        <IconAsk class="size-icon-lg" />
      {:else}
        <IconShield class="size-icon-lg" />
      {/if}
    </span>
    <span
      data-slot="title"
      class="min-w-0 shrink-100 overflow-clip text-ellipsis whitespace-nowrap"
      >{text}</span
    >
    {#if place && place.of > 1}
      <Kbd
        data-num
        class="peer/place flex-none ms-auto"
        data-box
        figures="tabular">{place.at} of {place.of}</Kbd
      >
    {/if}
    {#if (questions || connect) && onminimize}
      <!-- Folds the card to its bar over the composer; answers nothing. It
           ends the title row, in the title's muted ink, and keeps the row's
           own height (its 24px box overhangs the label line). -->
      <Button
        aria-label={connect ? askWords.minimizeConnectAsk : "Minimize question"}
        class="touch-hit flex-none -my-space-1 ms-auto"
        margin="beside-num"
        tone="muted"
        onclick={onminimize}
        size="icon-xs"
        title="Minimize"
        variant="ghost"
      >
        <IconChevronDown />
      </Button>
    {/if}
  </h2>
{/snippet}

<!-- The grown shape is the surface (Composer draws it): the card is what
     stands in it, its title on top, its foot on the pill's top edge, and a
     long ask scrolls between the two. As tall as the room over the pill
     allows (`--ask-max`, the composer's). -->
<section
  data-prompt-shown={shown || undefined}
  data-slot="hitl"
  aria-label={cardLabel}
  class="group/hitl flex flex-col max-h-(--ask-max) pt-space-3 pb-space-2 px-space-3"
  ontouchcancel={() => {
    swipe = null;
  }}
  ontouchend={swipeEnd}
  ontouchstart={swipeStart}
  bind:this={card}
>
  {#if browserAsk}
    {@render title(cardLabel)}
    <!-- What the agent needs the person for, as a question's text, and the
         page's origin in code type: the person checks where they will be
         typing before they take over. -->
    <div
      data-slot="body"
      class="relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      style:--part="1"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      <p
        data-slot="lede"
        class="text-size-body font-normal leading-body text-ink-strong mb-space-2 max-w-c-measure wrap-anywhere text-pretty"
      >
        {browserAsk.reason}
      </p>
      <p
        data-slot="browser-meta"
        class="mb-space-2 min-w-0 text-size-meta text-ink-muted"
      >
        <!-- Broken only after its dots, never inside a label. -->
        <code
          data-slot="browser-origin"
          class="min-w-0 type-code text-ink-strong break-words"
          ><OriginText origin={browserAsk.origin} /></code
        >
      </p>
      <!-- The question card's "Other": its chip and its line, side by side
           in one row of a fixed height, so nothing under the thumb moves as
           the line opens. -->
      <div
        data-slot="browser-other"
        class="mb-space-2 flex h-c-input-h min-w-0 items-center gap-space-2"
      >
        <OptionGroup
          aria-label={`Other answer to: ${browserAsk.reason}`}
          class="flex-none"
          value={otherAt === 0 ? [OTHER] : []}
        >
          <OptionGroupItem
            onclick={(event) => pressOther(event, 0)}
            value={OTHER}
          >
            <span
              data-slot="opt-label"
              class="min-w-0 wrap-anywhere text-pretty">Other</span
            >
          </OptionGroupItem>
        </OptionGroup>
        {#if otherAt === 0}
          <Input
            data-other
            aria-label={askWords.yourAnswerTo(browserAsk.reason)}
            class="flex-1"
            disabled={!answerable}
            oninput={(event) => writeOther(event.currentTarget.value)}
            onkeydown={otherKey}
            placeholder={askWords.yourAnswer}
            value={others[browserAsk.reason] ?? ""}
            bind:ref={otherField}
          />
        {/if}
      </div>
      <!-- What the answer reaches, before the person commits to it: the
           permission card's own line for that. -->
      <p
        data-slot="detail"
        class="text-size-label font-normal text-ink-muted mb-space-2"
      >
        No agent can see or use this browser until you hand it back.
      </p>
    </div>
    <div
      data-slot="foot"
      class="flex-none pt-space-1 opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      style:--part="2"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      <!-- A refusal stands over the pair: the card grows upward from the
           composer's pill, so nothing under the thumb moves as it appears. -->
      {@render wait()}
      <!-- The Peer Rule's transcript form: Take over and Deny at the row's
           two ends, the one recessed fill, each outlined in its tint; no
           third control between them. -->
      <div
        data-slot="choice"
        class="flex justify-between gap-space-8 mt-space-2"
      >
        <Button
          answer="approve-strong"
          class="flex-none"
          fit="prompt"
          width="shrink"
          data-browser-take
          disabled={disabledOf("allow")}
          failed={takeRefused !== null}
          icon={IconInteract}
          label={askWords.takeOver}
          onclick={takeOver}
          pending={pendingOf("allow")}
          pendingLabel="Taking over…"
          size="sm"
          variant="secondary"
        />
        <Button
          answer="deny-strong"
          class="flex-none"
          fit="prompt"
          width="shrink"
          data-browser-deny
          disabled={disabledOf("deny")}
          failed={failedOf("deny")}
          icon={IconClose}
          label="Deny"
          onclick={denyBrowser}
          pending={pendingOf("deny")}
          pendingLabel="Denying…"
          size="sm"
          variant="secondary"
        />
      </div>
    </div>
  {:else if connect}
    {@render title(cardLabel)}
    <!-- A connect ask: the browser ask's slots, one for one with what an MCP
         client owes a URL-mode elicitation. Which agent asks is the title;
         the agent's why is the lede; the whole address, its host in strong
         ink, stands before Connect opens anything. Then what it gets: the
         access as a choice (the question card's chips, read-only first), or
         the one set's scopes in code type, or on a reconnect the access
         held from before. The Other line's words go with Not now; the
         detail line says who keeps the sign-in and for how long. The
         accounts the hub keeps for a server would stand where the access
         does, as the question card's list. -->
    <div
      data-slot="body"
      class="relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      style:--part="1"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      <p
        data-slot="lede"
        class="text-size-body font-normal leading-body text-ink-strong mb-space-2 max-w-c-measure wrap-anywhere text-pretty"
        id="{claimId}-connect"
      >
        {connect.reason}
      </p>
      <p data-slot="connect-meta" class="mb-space-2 min-w-0 text-size-meta">
        <ConnectAddress url={connect.url} />
      </p>
      {#if connect.again && connect.held}
        <!-- Asked again: the access picked before is held, not asked. -->
        <p
          data-slot="connect-scope"
          class="mb-space-2 text-size-label font-normal text-ink-strong"
        >
          {askWords.asBefore(accessLabel(connect.held))}
        </p>
      {:else if connect.offers.length > 1}
        <!-- The access as a choice, the question card's chips, read-only
             pressed; 1 and 2 pick, Enter connects. -->
        <OptionGroup
          aria-labelledby="{claimId}-connect"
          class="mt-space-row mb-space-2"
          disabled={!answerable || signIn.stage === "waiting"}
          onenter={pressConnect}
          bind:value={
            () => (connectAccess ? [connectAccess] : []),
            (picks) => {
              connectAccess =
                (picks.at(-1) as ConnectAccess | undefined) ?? connectAccess;
            }
          }
        >
          {#each connect.offers as offer, i (offer.access)}
            <OptionGroupItem digit={i + 1} value={offer.access}>
              <Kbd data-box look="keycap">{i + 1}</Kbd><span
                data-slot="opt-label"
                class="min-w-0 wrap-anywhere text-pretty"
                >{accessLabel(offer.access)}</span
              >
            </OptionGroupItem>
          {/each}
        </OptionGroup>
      {:else if connect.offers[0]?.scopes.length}
        <p data-slot="connect-scope" class="mb-space-2 min-w-0">
          <code class="type-code text-ink-strong wrap-anywhere"
            >{connect.offers[0].scopes.join(" ")}</code
          >
        </p>
      {/if}
      <div
        data-slot="connect-other"
        class="mb-space-2 flex h-c-input-h min-w-0 items-center gap-space-2"
      >
        <OptionGroup
          aria-label={`Other answer to: ${connect.reason}`}
          class="flex-none"
          value={otherAt === 0 ? [OTHER] : []}
        >
          <OptionGroupItem
            onclick={(event) => pressOther(event, 0)}
            value={OTHER}
          >
            <span
              data-slot="opt-label"
              class="min-w-0 wrap-anywhere text-pretty">Other</span
            >
          </OptionGroupItem>
        </OptionGroup>
        {#if otherAt === 0}
          <Input
            data-other
            aria-label={askWords.yourAnswerTo(connect.reason)}
            class="flex-1"
            disabled={!answerable}
            oninput={(event) => writeOther(event.currentTarget.value)}
            onkeydown={otherKey}
            placeholder={askWords.yourAnswer}
            value={others[connect.reason] ?? ""}
            bind:ref={otherField}
          />
        {/if}
      </div>
      {#if !connect.again}
        <p
          data-slot="detail"
          class="text-size-label font-normal text-ink-muted mb-space-2"
        >
          {askWords.connectReach(connect.server)}
        </p>
      {/if}
    </div>
    <div
      data-slot="foot"
      class="flex-none pt-space-1 opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      style:--part="2"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      {#if signIn.stage === "done"}
        <!-- The hub signed in: a beat in the card, as whom, before the
             shape folds and the record stands in the transcript. -->
        <div data-slot="choice" class="flex mt-space-2">
          <Button
            answer="approve-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            data-connect-done
            icon={IconTick}
            label={connectServer?.auth?.as
              ? askWords.connectedAs(connectServer.auth.as)
              : askWords.connected}
            size="sm"
            variant="secondary"
          />
        </div>
      {:else}
        <!-- Over the pair, as the browser ask's refusal stands: the wait
             (McpSignIn's), or why the sign-in did not come back with the way
             to try again (RowFault, as McpSignIn says it), or why it cannot
             be answered yet. -->
        {#if signIn.stage === "waiting"}
          <p
            data-slot="wait"
            class="mt-space-2 text-size-meta font-normal text-ink-muted"
            role="status"
          >
            {askWords.connectWaiting(connect.server)}
          </p>
        {:else if signIn.stage === "failed" && signIn.fault && reachable && pressed === null}
          {@const fault = faultWords(signIn.fault, connect.server)}
          <RowFault
            class="mt-space-2 text-size-meta"
            again={pressConnect}
            data-connect-fault={signIn.fault.kind}
            details={fault.details}
            reason={fault.reason}
          />
        {:else}
          {@render wait()}
        {/if}
        <!-- The Peer Rule's transcript form, as the browser ask's: the yes
             and the refusal at the row's two ends, the one recessed fill,
             each outlined in its tint; no third control between them. Not
             now stays live while the provider's page is open. -->
        <div
          data-slot="choice"
          class="flex justify-between gap-space-8 mt-space-2"
        >
          <Button
            answer="approve-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            data-connect
            disabled={!answerable}
            failed={signIn.stage === "failed"}
            icon={IconKey}
            label={connect.again ? askWords.reconnect : askWords.connect}
            onclick={pressConnect}
            pending={signIn.stage === "waiting"}
            pendingLabel={askWords.signingIn(connect.server)}
            size="sm"
            variant="secondary"
          />
          <Button
            answer="deny-strong"
            class="flex-none"
            fit="prompt"
            width="shrink"
            data-connect-decline
            disabled={disabledOf("deny")}
            failed={failedOf("deny")}
            icon={IconClose}
            label={askWords.notNow}
            onclick={declineConnect}
            pending={pendingOf("deny")}
            pendingLabel={askWords.declining}
            size="sm"
            variant="secondary"
          />
        </div>
      {/if}
    </div>
  {:else if questions}
    {@render title(`Question from ${asker}`)}
    <!-- Every box sizes to the card: the body, and what stands in it, may
         shrink below its words' longest run, which then wraps
         (`overflow-wrap` on the lede and the labels) rather than pushing
         past the card. -->
    <div
      data-slot="body"
      class="group/body kit-edge-fade-block relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      data-railed={questions.length > 1 || undefined}
      style:--part="1"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      <!-- The live question's rail, on its lede's inline edge. -->
      {#if rail}
        <span
          data-slot="rail"
          aria-hidden="true"
          class="absolute top-0 start-0 w-px bg-brand-solid pointer-events-none motion-safe:transition-[translate,block-size] motion-safe:duration-(--dur-control) motion-safe:ease-drawer"
          style:block-size="{rail.height}px"
          style:translate="0 {rail.top}px"
        ></span>
      {/if}
      {#each questions as q, qi (q.question)}
        {@const own = q.options.length}
        {@const list = listed(q)}
        <!-- Every lede of a several-question ask stands off the rail's edge
             by the same step, railed or not, so nothing moves as the rail
             does. -->
        <p
          data-slot="lede"
          class="text-size-body font-normal leading-body text-ink-strong mb-space-2 max-w-c-measure wrap-anywhere text-pretty group-data-railed/body:ps-space-2"
          id="{claimId}-q{qi}"
          bind:this={ledes[qi]}
        >
          {q.question}
        </p>
        <!-- An option's keycap and words: in a list, the keycap stands on
             the label's first line and the description runs under the
             label; in a chip row, the label beside it. An option's label
             shrinks with its chip and wraps inside it. -->
        {#snippet face(digit: number, label: string, description?: string)}
          {#if list}
            <span class="mark-cell"
              ><Kbd data-box look="keycap">{digit}</Kbd></span
            ><span class="block min-w-0"
              ><span
                data-slot="opt-label"
                class="block min-w-0 wrap-anywhere text-pretty">{label}</span
              >{#if description}<span
                  data-slot="opt-desc"
                  class="block type-meta text-ink-muted wrap-anywhere text-pretty"
                  >{description}</span
                >{/if}</span
            >
          {:else}
            <Kbd data-box look="keycap">{digit}</Kbd><span
              data-slot="opt-label"
              class="min-w-0 wrap-anywhere text-pretty">{label}</span
            >
          {/if}
        {/snippet}
        <!-- One tab stop per question; focus in it makes it the one the
             digits answer, and the rail moves to it. The options are the
             kit's option group (ui/option-group: a row of option chips, or
             in the list form one full-width row per option, each sizing its
             two columns: the keycap's cell at its own width, standing on
             the label's first line (`.mark-cell`), and the words in the
             rest, which may shrink to nothing and wrap). The chips stand
             flush in a scroller that clips (the body), so each option's
             ring sits on its own border box (The One Ring Rule), as the
             kit's option draws it. The card only sets where it sits. -->
        <OptionGroup
          aria-labelledby="{claimId}-q{qi}"
          class="mt-space-row mb-space-2"
          layout={list ? "list" : "chips"}
          multiple={q.multiSelect}
          onenter={enter}
          onfocusin={() => {
            current = qi;
            choosing = true;
          }}
          onfocusout={(event: FocusEvent) => {
            choosing =
              event.relatedTarget instanceof Element &&
              !!card?.contains(event.relatedTarget) &&
              !!event.relatedTarget.closest('[data-slot="option-group"]');
          }}
          bind:value={
            () => pressedOf(q, qi),
            (labels) =>
              q.multiSelect
                ? setMulti(qi, labels)
                : setSingle(qi, labels.find((l) => l !== OTHER) ?? "")
          }
        >
          {#each q.options as opt, i (opt.label)}
            <OptionGroupItem
              digit={i < 9 ? i + 1 : undefined}
              value={opt.label}
            >
              {@render face(i + 1, opt.label, opt.description?.trim())}
            </OptionGroupItem>
          {/each}
          <!-- The reader's own answer, written in the field it opens. -->
          {#if own < 9}
            <OptionGroupItem
              digit={own + 1}
              onclick={(event) => pressOther(event, qi)}
              value={OTHER}
            >
              {@render face(own + 1, "Other")}
            </OptionGroupItem>
          {/if}
        </OptionGroup>
        {#if otherAt === qi}
          <!-- The reader's own answer, a field under the choices it stands
               in for, before the card's actions: the kit's field, on the
               step under the choices. -->
          <Input
            data-other
            aria-label={askWords.yourAnswerTo(q.question)}
            class="mb-space-2"
            disabled={!answerable}
            oninput={(event) => writeOther(event.currentTarget.value)}
            onkeydown={otherKey}
            placeholder={askWords.yourAnswer}
            value={others[q.question] ?? ""}
            bind:ref={otherField}
          />
        {/if}
      {/each}
    </div>
    <!-- Under a finger the answer row stands as far under the last options
         as the option rows stand apart (ui/chip `chipsVariants`, 14px: the
         group's 7px foot and this 7px), so the last option's 44px area and
         Answer's meet at the midpoint instead of Answer's taking the
         option's lower edge (DESIGN.md, The 44 Touch Rule). -->
    <div
      data-slot="foot"
      class="flex-none pt-space-1 coarse:pt-space-2 opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      style:--part="2"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      <div class="flex gap-space-2">
        <Button
          fit="prompt-wide"
          disabled={disabledOf("answer") || (pressed === null && !allAnswered)}
          failed={failedOf("answer")}
          icon={IconCheck}
          label="Answer"
          onclick={submitQuestion}
          pending={pendingOf("answer")}
          pendingLabel="Answering…"
          size="sm"
        />
        <Button
          disabled={disabledOf("deny")}
          fit="prompt"
          failed={failedOf("deny")}
          label="Dismiss"
          onclick={dismissQuestion}
          pending={pendingOf("deny")}
          pendingLabel="Dismissing…"
          size="sm"
          variant="outline"
        />
      </div>
      {@render wait()}
    </div>
  {:else}
    {@render title(who)}
    <!-- What will happen and why, then the command or the change itself: a
         grant is made on what runs, never on a sentence about it alone. The
         words are the hub's (core permission-presentation.ts), the same on
         iOS; secrets in the fields are already hidden. -->
    <div
      data-slot="body"
      class="relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      style:--part="1"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      <!-- What will happen, in the title's weight: the line the grant is
           made on. -->
      <p
        data-slot="lede"
        class="text-size-body font-medium leading-body text-ink-strong mb-space-1 max-w-c-measure wrap-anywhere text-pretty"
      >
        {presentation.summary}
      </p>
      <!-- How much it changes and where, under it. -->
      {#if presentation.detail}
        <p
          data-slot="detail"
          class="text-size-label font-normal text-ink-muted mb-space-2"
        >
          {presentation.detail}
        </p>
      {/if}
      <!-- The command under the reason, in the transcript's command rule:
           one line, cut with an ellipsis, until its chevron opens it whole. -->
      {#if command}
        <div
          class="group/cmd flex items-start gap-space-2 border-s-2 border-s-border-hairline py-space-1 ps-space-3 mb-space-2"
          data-open={commandOpen || undefined}
        >
          <code
            data-slot="cmd-text"
            class="flex-auto min-w-0 font-mono text-size-label text-ink-muted overflow-hidden text-ellipsis whitespace-pre group-data-open/cmd:text-ink-strong group-data-open/cmd:whitespace-pre-wrap group-data-open/cmd:wrap-anywhere"
            bind:this={commandLine}
            >{commandOpen ? command : command.trim().split("\n")[0]}</code
          >
          {#if commandOpen || commandClipped}
            <Button
              data-cmd-toggle
              aria-expanded={commandOpen}
              aria-label={commandOpen
                ? askWords.commandOnOneLine
                : askWords.wholeCommand}
              class="touch-hit flex-none -my-space-1"
              tone="muted"
              onclick={() => {
                commandOpen = !commandOpen;
              }}
              size="icon-xs"
              title={commandOpen ? "Show less" : askWords.wholeCommand}
              variant="ghost"
            >
              <IconChevronDown
                class="motion-safe:transition-[rotate] motion-safe:duration-(--dur-control) motion-safe:ease-drawer group-data-open/cmd:rotate-180"
              />
            </Button>
          {/if}
        </div>
      {/if}
      <!-- The change itself, open: each diff stands to the token's share of
           the screen and scrolls inside it, so the answer row stays in
           reach. -->
      {#if presentation.changes.length > 0}
        <div class="flex flex-col gap-space-2 mb-space-2">
          {#each presentation.changes as change, i (i)}
            <DiffView
              cap="calc(var(--c-ask-diff-share) * 100dvh)"
              filePath={change.path}
              newContent={change.after}
              oldContent={change.before}
            />
          {/each}
        </div>
      {/if}
      <!-- The rest of the input, shown rather than disclosed: each field's
           name over its value, values that run long scrolling in place. -->
      {#if presentation.fields.length > 0}
        <dl
          class="flex flex-col gap-space-2 mb-space-3 p-space-3 rounded-sm bg-surface-recess"
        >
          {#each presentation.fields as field, i (`${i}:${field.key}`)}
            <div
              data-slot="prompt-field"
              class="flex flex-col gap-space-1 min-w-0"
            >
              <dt class="text-size-label font-medium text-ink-muted">
                {field.key}
              </dt>
              <dd
                class="max-h-c-ask-value-max-h overflow-auto font-(family-name:--font-mono) text-size-meta text-ink-strong whitespace-pre-wrap break-words"
              >
                {field.value}
              </dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>
    <div
      data-slot="foot"
      class="flex-none pt-space-1 opacity-0 blur-(--part-blur) transition-fade-blur motion-safe:translate-y-(--pop-rise) group-data-prompt-shown/hitl:opacity-100 group-data-prompt-shown/hitl:translate-none group-data-prompt-shown/hitl:filter-none motion-safe:transition-fade-slide-blur group-data-prompt-shown/hitl:delay-(--part-delay)"
      style:--part="2"
      style:--part-delay="calc(var(--part) * var(--dur-stagger))"
    >
      <!-- JOURNEY §Triage: the full row width sits between grant and
           refusal. At --space-2 the two sat 7px apart, close enough that a
           hand aiming at Approve lands on Deny. The gap is unfillable on
           purpose — no third control belongs between a grant and a refusal
           — and --space-8 is the floor it never falls below when the row is
           narrow. -->
      <div
        data-slot="choice"
        class="flex justify-between gap-space-8 mt-space-2"
      >
        <!-- The permission gate is symmetric: Approve and Deny are recessed
             peers at one fill, apart at the row's two ends, each outlined in
             its tint (DESIGN.md, The Peer Rule, the transcript's form):
             Approve in the done ink, Deny in the fail ink, 1px each, both
             inks at one strength, over the one untinted recessed fill; a
             tick grants, a cross refuses, both labels in the one ink
             (`ink-strong`), so neither leans. Neither changes under the
             pointer: the fill and the edge hold still, so the hand's last
             move never makes one the more inviting. -->
        <Button
          answer="approve-strong"
          class="flex-none"
          fit="prompt"
          width="shrink"
          data-prompt-grant
          disabled={disabledOf("allow")}
          failed={failedOf("allow")}
          icon={IconTick}
          label="Approve"
          onclick={() => answer("allow")}
          pending={pendingOf("allow")}
          pendingLabel="Approving…"
          size="sm"
          variant="secondary"
        />
        <Button
          answer="deny-strong"
          class="flex-none"
          fit="prompt"
          width="shrink"
          data-prompt-refuse
          disabled={disabledOf("deny")}
          failed={failedOf("deny")}
          icon={IconClose}
          label="Deny"
          onclick={() => answer("deny")}
          pending={pendingOf("deny")}
          pendingLabel="Denying…"
          size="sm"
          variant="secondary"
        />
      </div>
      {@render wait()}
      {#if rule}
        <!-- A clear break from the gate above, on the scale (--space-8 /
             --space-5). The permission scope actually being granted is
             consequential text — it reads at --text-label, never the
             10.25px micro-label step. -->
        <div class="mt-space-8 pt-space-5 border-t border-t-border-hairline">
          <p
            class="text-size-body font-normal text-ink-muted mb-space-2 max-w-c-measure"
          >
            This would allow <span
              class="font-(family-name:--font-mono) text-size-label"
              >{rule.full}</span
            >
            for
            {rule.scope}
            — a wider grant than the request above.
          </p>
          <!-- A standing grant must read as consequential: the kit's grant
             (warning tint, warning ink, a real edge). -->
          <Button
            disabled={disabledOf("always")}
            fit="prompt"
            failed={failedOf("always")}
            icon={IconShield}
            label="Always allow {rule.short}"
            onclick={() => answer("always")}
            pending={pendingOf("always")}
            pendingLabel="Allowing…"
            size="sm"
            variant="grant"
          />
        </div>
      {/if}
    </div>
  {/if}
</section>
