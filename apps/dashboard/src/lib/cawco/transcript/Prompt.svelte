<script lang="ts" module>
  /**
   * The digits belong to exactly one card. The composer can park several
   * requests at once, and two question cards both answering "2" is worse than
   * neither answering it — so question cards register here in mount order and
   * the first one standing owns the keyboard. This is the `shortcuts` prop the
   * old card took from its parent, kept inside the component instead: the
   * composer that renders the stack should not have to know the rule.
   */
  const claimants = $state<symbol[]>([]);
</script>

<script lang="ts">
  import type {
    PermissionResult,
    UserAnswers,
    UserQuestion,
  } from "@cawco/core";
  import { askerLine, questionsOf } from "@cawco/core";
  /**
   * The one human-in-the-loop surface, held in the composer's grown shape
   * (Composer, grown.ts): a permission gate (a measurably-symmetric Approve /
   * Deny pair, with scope-widening kept apart) or a question (selectable
   * answers, and a line for an answer of the reader's own). Both
   * settle their parked tool call by handing the answer up, where it goes out
   * as one tracked command whose stages this card's wait line reads.
   *
   * The composer draws the surface: this is what stands in it. Its title,
   * its body and its foot come up, fading and rising, one after the other
   * as the shape grows (`shown`), and sink back as it folds.
   */
  import { ToggleGroup } from "bits-ui";
  import { onMount, tick, untrack } from "svelte";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import {
    IconAsk,
    IconCheck,
    IconChevronDown,
    IconClose,
    IconShield,
    IconTick,
  } from "#lib/icons.js";
  import { isTyping } from "#lib/utils/typing.js";
  import {
    cawco,
    commandRecord,
    isStale,
    type PendingPermission,
    permissionAnswer,
  } from "../client.svelte";
  import { suggestedRule } from "../permission-summary";
  import { questionAnswer, questionDismissal } from "../question";

  let {
    request,
    onanswer,
    asker = "the agent",
    place = null,
    shown = false,
    onminimize,
  }: {
    /**
     * Folds a question down to its bar over the composer, answering nothing
     * (minimized-asks.svelte.ts). Given only for a question; a card without
     * it has no minimize control and no swipe.
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

  /** Names each question's lede, which labels its option group. */
  const claimId = $props.id();
  const input = $derived(request.input as Record<string, unknown>);
  const questions = $derived(questionsOf(request.toolName, input));
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
    measure();
    const sizes = new ResizeObserver(measure);
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
   * Which question the digits answer. A card usually asks one thing and this
   * never moves; when it asks several, it is the question keyboard focus is
   * in, and without focus in the card the first question still unanswered.
   * Only that question's keycaps are lit — a keycap that cannot be pressed is
   * the defect this whole handler exists to fix.
   */
  let current = $state(0);

  /**
   * Each question's options are one bits-ui toggle group (WAI-ARIA's
   * composite widget): one tab stop per question, the arrows moving inside
   * it, Space or Enter pressing the option under focus — `single` for a
   * question with one answer, `multiple` for a multi-select. Not RadioGroup:
   * its arrows pick the option they land on once the question has an answer
   * (bits-ui 2.19 `RadioGroupItemState.onfocus`), so an arrow would change
   * the answer and move the card on; here an arrow only moves.
   *
   * "Other" is one of its group's chips, under a value no option label can
   * be, so the arrows reach it too.
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
    const group = card?.querySelectorAll("[data-toggle-group-root]")[index];
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
   * A single answer, picked: re-picking the chosen option clears it (the
   * group's own toggle), so a mis-keyed digit is undoable with the same digit
   * rather than only by picking something else.
   */
  function setSingle(index: number, label: string): void {
    const q = questions?.[index];
    if (!(q && answerable)) {
      return;
    }
    current = index;
    answers = { ...answers, [q.question]: label };
    // A picked option is the answer: the field's own goes back to waiting.
    if (otherAt === index) {
      otherAt = null;
    }
    if (label) {
      advance();
    }
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

  /** A digit's press: the option wearing that keycap, toggled as its chip would be. */
  function toggle(index: number, label: string): void {
    const q = questions?.[index];
    if (!q) {
      return;
    }
    if (!q.multiSelect) {
      setSingle(index, answers[q.question] === label ? "" : label);
      return;
    }
    const list = pressedOf(q, index);
    setMulti(
      index,
      list.includes(label) ? list.filter((l) => l !== label) : [...list, label]
    );
  }

  /**
   * The keys an option takes before its group does. Once every question has
   * an answer, Enter sends — the window's handler does it, so the group must
   * not press the option under focus first. ↑/↓ step through the options as
   * ←/→ do: the chips wrap, so either axis means "the next one", and a
   * horizontal group reads only ←/→, so the step goes to it as its own key.
   */
  const CROSS_STEPS: Record<string, number | undefined> = {
    ArrowDown: 1,
    ArrowUp: -1,
  };

  function optionKey(event: KeyboardEvent): void {
    if (event.key === "Enter" && allAnswered) {
      event.preventDefault();
      return;
    }
    const step = CROSS_STEPS[event.key];
    const chip = event.target;
    if (!(step && chip instanceof HTMLElement)) {
      return;
    }
    event.preventDefault();
    const forward = step > 0 !== (getComputedStyle(chip).direction === "rtl");
    chip.dispatchEvent(
      new KeyboardEvent("keydown", {
        key: forward ? "ArrowRight" : "ArrowLeft",
        bubbles: true,
      })
    );
  }

  /** "Other" opens its field instead of pressing: its answer is what is written there. */
  function otherChipKey(event: KeyboardEvent, index: number): void {
    if (event.key === " " || (event.key === "Enter" && !allAnswered)) {
      event.preventDefault();
      openOther(index);
      return;
    }
    optionKey(event);
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
    const q = otherAt === null ? undefined : questions?.[otherAt];
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
    const q = questions?.[index];
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
  /** The session's machine is offline: the ask stands, its answer waits. */
  const offline = $derived(row ? isStale(row) : false);
  /** An answer can reach the daemon that asked: the hub is live, and its machine. */
  const reachable = $derived(cawco.hub === "connected" && !offline);
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

  /* Only a question card claims the digits, and only one of them at a time. */
  const claim = Symbol("prompt");
  onMount(() => {
    if (!questions) {
      return;
    }
    claimants.push(claim);
    return () => {
      const at = claimants.indexOf(claim);
      if (at !== -1) {
        claimants.splice(at, 1);
      }
    };
  });
  const ownsKeys = $derived(!!questions && claimants[0] === claim);

  /**
   * Which question the digits answer, said where the eye is: a hairline
   * rail on that question's lede, in the selection frame's ink. Every
   * question's keycaps look alike, so with more than one question this is
   * the one mark of where a digit lands. It moves as the digits do (an
   * answer moves them on), gliding as the house highlight's selection pill
   * does; with reduced motion it is simply there.
   */
  const ledes = $state<HTMLElement[]>([]);
  let rail = $state<{ top: number; height: number } | null>(null);
  $effect(() => {
    const node = ledes[current];
    if (!(node && ownsKeys && questions && questions.length > 1)) {
      rail = null;
      return;
    }
    const measure = () => {
      rail = { top: node.offsetTop, height: node.offsetHeight };
    };
    measure();
    const sizes = new ResizeObserver(measure);
    sizes.observe(node);
    return () => sizes.disconnect();
  });

  /**
   * The keys the card already advertises: a digit picks the option wearing that
   * keycap on the `current` question, Enter sends once every question has an
   * answer. Tab, Shift+Tab, the arrows and Space are the option groups' own
   * (bits-ui's roving focus); these are the rest. While the card is on screen
   * they reach it from its own pane (its workspace group, `[data-leaf]`, or
   * Caw's panel floating over a project's page, `[data-caw-panel]`, which no
   * workspace group holds), from nothing at all (focus fallen to the body,
   * as it does when an answered card's button leaves), and from any part of
   * the shell that is no one else's. Another pane, another card, a dialog or
   * a menu keeps its own keys, and while a modal stands nothing focused is
   * its, not the card's.
   * Escape is never one of them: it closes menus, dialogs and peeks all over
   * the page, and a question is put down only by its own Dismiss button. A
   * test script's Escape on a page with nothing focused once dismissed the
   * owner's parked question through here.
   *
   * They are inert while the reader is writing (`isTyping`) — which is what
   * lets "2" mean an option here and a character in the composer — inert under
   * a modifier, so browser and OS chords still reach their owners, and inert
   * whenever the buttons are, so the `answerable` latch is the single gate on
   * answering: an answer cannot be keyed in twice, or into a dead socket.
   */
  let card = $state<HTMLElement | null>(null);
  /** Surfaces that hold keys of their own: another pane, card, dialog or menu. */
  const OWNERS =
    "[data-leaf], [data-caw-panel], [data-slot='hitl'], dialog, [role='dialog'], [role='alertdialog'], [role='menu'], [role='listbox']";
  /** A modal standing over the page: what nothing focused belongs to while it does. */
  const MODAL = "[aria-modal='true'], dialog[open]";
  const heard = (target: EventTarget | null): boolean => {
    if (!card || card.closest("[inert]") || !card.checkVisibility()) {
      return false;
    }
    const pane = card.closest("[data-leaf], [data-caw-panel]") ?? card;
    if (target instanceof Node && pane.contains(target)) {
      return true;
    }
    if (
      !(target instanceof Element) ||
      target === document.body ||
      target === document.documentElement
    ) {
      const modal = document.querySelector(MODAL);
      return !modal || modal.contains(card);
    }
    return !target.closest(OWNERS);
  };

  function handleKeydown(event: KeyboardEvent): void {
    if (!(ownsKeys && answerable && heard(event.target))) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey || isTyping()) {
      return;
    }
    if (event.key >= "1" && event.key <= "9") {
      const options = questions?.[current]?.options ?? [];
      const at = Number(event.key) - 1;
      // The keycap after the last option is the reader's own answer.
      if (at === options.length) {
        event.preventDefault();
        openOther(current);
        return;
      }
      const option = options[at];
      if (!option) {
        return;
      }
      event.preventDefault();
      toggle(current, option.label);
      return;
    }
    if (event.key === "Enter" && allAnswered && !onButton(event.target)) {
      event.preventDefault();
      submitQuestion();
    }
  }

  /**
   * A button of its own under focus — Dismiss, the minimize chevron, a row in
   * the transcript — keeps its Enter: focused on Dismiss, Enter dismisses
   * rather than sends. The option chips are the card's own answer and send.
   */
  const onButton = (target: EventTarget | null): boolean =>
    target instanceof Element &&
    !!target.closest("button, a[href]") &&
    !target.closest("[data-toggle-group-root]");

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

  /* shadcn <Button>, dressed in DESIGN.md tokens so nothing reads as stock
     shadcn (no 4/8/12 padding ladder, no pill radius, no shadcn primary fill).
     Control height sits on the scale — --space-8 (32) fine, 44 coarse. */
  const btnBase =
    "h-[var(--space-8)] pointer-coarse:h-11 gap-(--btn-gap) " +
    "[--btn-gap:var(--space-2)] [--btn-icon:12px] " +
    "rounded-[var(--radius-sm)] px-[var(--space-3)] " +
    "text-label font-medium";

  /* The permission gate is symmetric: Approve and Deny are recessed peers at
     one fill, apart at the row's two ends, each outlined in its tint (The
     Peer Rule's transcript form): a tick grants, a cross refuses, both
     labels in the one ink (`ink-strong`), so neither leans. */
  const peer = `${btnBase} flex-1 min-w-0 !text-[var(--ink-strong)]`;
  const grant = `${peer} approve`;
  const refuse = `${peer} deny`;

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

<svelte:window onkeydown={handleKeydown} />

<!-- Under the buttons, one line when there is something the buttons cannot
     say: the session's machine or the socket cannot carry an answer yet, or
     the hub refused the one sent and said why. A live region, so the
     refusal is heard. -->
{#snippet wait()}
  {#if refused}
    <p
      data-wait
      data-slot="refused"
      class="mt-space-2 text-size-meta font-normal text-status-fail-ink"
      role="status"
    >
      {refused}
    </p>
  {:else if pressed === null && offline}
    <p
      data-slot="wait"
      class="mt-space-2 text-size-meta font-normal text-ink-muted"
      role="status"
    >
      Machine offline — can't answer yet.
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
     other, by opacity and translate alone, and sink back together as it
     folds (`.part`; its transition stays in the style block). -->
{#snippet title(text: string)}
  <h2
    class="part mark-line text-size-label font-medium text-ink-strong flex items-center gap-space-2 mb-space-2 opacity-0 transition-[opacity] dur-fade ease-out motion-safe:translate-y-(--pop-rise) group-data-shown/hitl:opacity-100 group-data-shown/hitl:translate-none"
    style:--part="0"
  >
    <!-- What asks, in the title's ink. Solar draws the question-circle's
         disc at 20/24 of its box, so the box is --icon-lg for the disc
         itself to stand at the title row's 16px icon size, its "?" large
         enough to read over the duotone's half-ink layer. -->
    <span
      data-slot="glyph"
      aria-hidden="true"
      class="inline-grid place-items-center flex-none text-inherit"
      data-box
    >
      {#if questions}
        <IconAsk class="size-icon-lg" />
      {:else}
        <IconShield class="size-icon-lg" />
      {/if}
    </span>
    <span
      data-slot="title"
      class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap">{text}</span
    >
    {#if place && place.of > 1}
      <Kbd data-num class="peer/place num ms-auto" data-box
        >{place.at} of {place.of}</Kbd
      >
    {/if}
    {#if questions && onminimize}
      <!-- Folds the card to its bar over the composer; answers nothing. It
           ends the title row, in the title's muted ink, and keeps the row's
           own height (its 24px box overhangs the label line). -->
      <Button
        aria-label="Minimize question"
        class="touch-hit flex-none -my-space-1 ms-auto peer-data-num/place:ms-0 text-ink-muted"
        data-box
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
  aria-label={questions
    ? `Question from ${asker}`
    : `Permission request from ${who}`}
  class="group/hitl flex flex-col max-h-(--hitl-max) pt-space-3 px-space-3 pb-space-2"
  data-shown={shown || undefined}
  ontouchcancel={() => {
    swipe = null;
  }}
  ontouchend={swipeEnd}
  ontouchstart={swipeStart}
  style:--hitl-max="var(--ask-max, none)"
  bind:this={card}
>
  {#if questions}
    {@render title(`Question from ${asker}`)}
    <!-- Every box sizes to the card: the body, and what stands in it, may
         shrink below its words' longest run, which then wraps
         (`overflow-wrap` on the lede and the labels) rather than pushing
         past the card. -->
    <div
      data-slot="body"
      class="group/body part kit-edge-fade-block relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 transition-[opacity] dur-fade ease-out motion-safe:translate-y-(--pop-rise) group-data-shown/hitl:opacity-100 group-data-shown/hitl:translate-none"
      data-railed={questions.length > 1 || undefined}
      style:--part="1"
    >
      <!-- The live question's rail, on its lede's inline edge. -->
      {#if rail}
        <span
          data-slot="rail"
          aria-hidden="true"
          class="absolute top-0 start-0 w-px block-(--rail-h) translate-y-(--rail-y) bg-brand-solid pointer-events-none motion-safe:transition-[translate,block-size] motion-safe:dur-control motion-safe:ease-drawer"
          style:--rail-h="{rail.height}px"
          style:--rail-y="{rail.top}px"
        ></span>
      {/if}
      {#each questions as q, qi (q.question)}
        {@const own = q.options.length}
        {@const list = listed(q)}
        <!-- Every lede of a several-question ask stands off the rail's edge
             by the same step, railed or not, so nothing moves as the rail
             does. -->
        <!-- literal: 72ch -->
        <p
          data-slot="lede"
          class="text-size-body font-normal leading-body text-ink-strong mb-space-2 max-w-(--measure) wrap-anywhere text-pretty group-data-railed/body:ps-space-2"
          id="{claimId}-q{qi}"
          style:--measure="72ch"
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
              ><span class="kit-keycap">{digit}</span></span
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
            <span class="kit-keycap">{digit}</span><span
              data-slot="opt-label"
              class="min-w-0 wrap-anywhere text-pretty">{label}</span
            >
          {/if}
        {/snippet}
        <!-- The chips stand flush in a scroller that clips (the body), so the
             kit's ring sits on each chip's own border box (The One Ring
             Rule) rather than outside it, where the scroller's edge would
             cut it. In the list form each row sizes its own two columns:
             the keycap's cell at its own width, standing on the label's
             first line (`.mark-cell`), and the words in the rest, which may
             shrink to nothing and wrap. -->
        {#snippet chips()}
          {#each q.options as opt, i (opt.label)}
            {@const live = ownsKeys && qi === current && i < 9}
            {@const sel = isSelected(q.question, opt.label)}
            <ToggleGroup.Item
              data-sel={sel || undefined}
              aria-keyshortcuts={live ? String(i + 1) : undefined}
              class="kit-chip touch-hit focus-inset group-data-list/qopts:grid group-data-list/qopts:grid-cols-(--opt-cols) group-data-list/qopts:min-w-0{sel
                ? ' sel'
                : ''}"
              onkeydown={optionKey}
              type="button"
              value={opt.label}
            >
              {@render face(i + 1, opt.label, opt.description?.trim())}
            </ToggleGroup.Item>
          {/each}
          <!-- The reader's own answer, written in the field it opens. -->
          {#if own < 9}
            {@const live = ownsKeys && qi === current}
            <ToggleGroup.Item
              data-sel={otherPicked(q) || otherAt === qi || undefined}
              aria-keyshortcuts={live ? String(own + 1) : undefined}
              class="kit-chip touch-hit focus-inset group-data-list/qopts:grid group-data-list/qopts:grid-cols-(--opt-cols) group-data-list/qopts:min-w-0{otherPicked(
                q
              ) || otherAt === qi
                ? ' sel'
                : ''}"
              onclick={(event: MouseEvent) => {
                event.preventDefault();
                openOther(qi);
              }}
              onkeydown={(event: KeyboardEvent) => otherChipKey(event, qi)}
              type="button"
              value={OTHER}
            >
              {@render face(own + 1, "Other")}
            </ToggleGroup.Item>
          {/if}
        {/snippet}
        <!-- One tab stop per question; focus in it makes it the one the
             digits answer, and the rail moves to it. -->
        <!-- The chip row is the kit's option-chip recipe (.kit-chips /
             .kit-chip in app.css); the card only sets where it sits. The list
             form is the chip recipe grown to one full-width row per option:
             one column the card's width (`minmax(0, 1fr)`). -->
        {#if q.multiSelect}
          <!-- literal: minmax(0, 1fr) -->
          <!-- literal: auto minmax(0, 1fr) -->
          <ToggleGroup.Root
            data-list={list || undefined}
            aria-labelledby="{claimId}-q{qi}"
            class="group/qopts kit-chips mt-space-row mb-space-2 data-list:grid data-list:grid-cols-(--qopts-cols)"
            onfocusin={() => {
              current = qi;
            }}
            style="--qopts-cols: minmax(0, 1fr); --opt-cols: auto minmax(0, 1fr)"
            type="multiple"
            bind:value={
              () => pressedOf(q, qi), (labels) => setMulti(qi, labels)
            }
          >
            {@render chips()}
          </ToggleGroup.Root>
        {:else}
          <!-- literal: minmax(0, 1fr) -->
          <!-- literal: auto minmax(0, 1fr) -->
          <ToggleGroup.Root
            data-list={list || undefined}
            aria-labelledby="{claimId}-q{qi}"
            class="group/qopts kit-chips mt-space-row mb-space-2 data-list:grid data-list:grid-cols-(--qopts-cols)"
            onfocusin={() => {
              current = qi;
            }}
            style="--qopts-cols: minmax(0, 1fr); --opt-cols: auto minmax(0, 1fr)"
            type="single"
            bind:value={
              () => pressedOf(q, qi)[0] ?? "", (label) => setSingle(qi, label)
            }
          >
            {@render chips()}
          </ToggleGroup.Root>
        {/if}
        {#if otherAt === qi}
          <!-- The reader's own answer, a field under the choices it stands
               in for, before the card's actions: the kit's field, on the
               step under the choices. -->
          <Input
            data-other
            aria-label={`Your answer to: ${q.question}`}
            class="mb-space-2"
            disabled={!answerable}
            oninput={(event) => writeOther(event.currentTarget.value)}
            onkeydown={otherKey}
            placeholder="Your answer…"
            value={others[q.question] ?? ""}
            bind:ref={otherField}
          />
        {/if}
      {/each}
    </div>
    <!-- shadcn <Button>, dressed in DESIGN.md tokens so nothing reads as
         stock shadcn (no 4/8/12 padding ladder, no pill radius, no shadcn
         primary fill). Control height sits on the scale — --space-8 (32)
         fine, 44 coarse. -->
    <div
      data-slot="foot"
      class="part flex-none pt-space-1 opacity-0 transition-[opacity] dur-fade ease-out motion-safe:translate-y-(--pop-rise) group-data-shown/hitl:opacity-100 group-data-shown/hitl:translate-none"
      style:--part="2"
    >
      <div class="flex gap-space-2">
        <!-- literal: 12px, 2.75rem -->
        <Button
          class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-4 text-label font-medium"
          disabled={disabledOf("answer") || (pressed === null && !allAnswered)}
          failed={failedOf("answer")}
          icon={IconCheck}
          label="Answer"
          onclick={submitQuestion}
          pending={pendingOf("answer")}
          pendingLabel="Answering…"
          style="--btn-gap: var(--space-2); --btn-icon: 12px; --btn-h-coarse: 2.75rem"
        />
        <!-- literal: 12px, 2.75rem -->
        <Button
          class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium"
          disabled={disabledOf("deny")}
          failed={failedOf("deny")}
          label="Dismiss"
          onclick={dismissQuestion}
          pending={pendingOf("deny")}
          pendingLabel="Dismissing…"
          style="--btn-gap: var(--space-2); --btn-icon: 12px; --btn-h-coarse: 2.75rem"
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
         iOS and Telegram; secrets in the fields are already hidden. -->
    <div
      data-slot="body"
      class="part relative flex-auto min-h-0 min-w-0 overflow-y-auto overscroll-contain opacity-0 transition-[opacity] dur-fade ease-out motion-safe:translate-y-(--pop-rise) group-data-shown/hitl:opacity-100 group-data-shown/hitl:translate-none"
      style:--part="1"
    >
      <!-- What will happen, in the title's weight: the line the grant is
           made on. -->
      <!-- literal: 72ch -->
      <p
        data-slot="lede"
        class="text-size-body font-medium leading-body text-ink-strong mb-space-1 max-w-(--measure) wrap-anywhere text-pretty"
        style:--measure="72ch"
      >{presentation.summary}</p>
      <!-- How much it changes and where, under it. -->
      {#if presentation.detail}
        <p
          data-slot="detail"
          class="text-size-label font-normal text-ink-muted mb-space-2"
        >{presentation.detail}</p>
      {/if}
      <!-- The command under the reason, in the transcript's command rule:
           one line, cut with an ellipsis, until its chevron opens it whole. -->
      {#if command}
        <!-- literal: 3px -->
        <div
          class="group/cmd flex items-start gap-space-2 border-s-2 border-s-border-hairline py-(--cmd-py) ps-space-3 pe-0 mb-space-2"
          data-open={commandOpen || undefined}
          style:--cmd-py="3px"
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
                ? "Show the command on one line"
                : "Show the whole command"}
              class="touch-hit flex-none -my-space-1 text-ink-muted"
              onclick={() => {
                commandOpen = !commandOpen;
              }}
              size="icon-xs"
              title={commandOpen ? "Show less" : "Show the whole command"}
              variant="ghost"
            >
              <IconChevronDown
                class="motion-safe:transition-[rotate] motion-safe:dur-control motion-safe:ease-drawer group-data-open/cmd:rotate-180"
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
          class="flex flex-col gap-space-2 mt-0 mb-space-3 p-space-3 rounded-sm bg-surface-recess"
        >
          {#each presentation.fields as field, i (`${i}:${field.key}`)}
            <div
              data-slot="prompt-field"
              class="flex flex-col gap-space-1 min-w-0"
            >
              <dt class="text-size-label font-medium text-ink-muted"
                >{field.key}</dt
              >
              <!-- literal: 200px -->
              <dd
                class="m-0 max-h-(--value-max) overflow-auto font-(family-name:--font-mono) text-size-meta text-ink-strong whitespace-pre-wrap"
                style:--value-max="200px"
              >{field.value}</dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>
    <div
      data-slot="foot"
      class="part flex-none pt-space-1 opacity-0 transition-[opacity] dur-fade ease-out motion-safe:translate-y-(--pop-rise) group-data-shown/hitl:opacity-100 group-data-shown/hitl:translate-none"
      style:--part="2"
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
        <!-- literal: 12px, 2.75rem -->
        <Button
          class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium flex-none min-w-0 text-ink-strong! border-status-done-ink bg-surface-recess hover:bg-surface-recess"
          data-prompt-grant={grant}
          disabled={disabledOf("allow")}
          failed={failedOf("allow")}
          icon={IconTick}
          label="Approve"
          onclick={() => answer("allow")}
          pending={pendingOf("allow")}
          pendingLabel="Approving…"
          style="--btn-gap: var(--space-2); --btn-icon: 12px; --btn-h-coarse: 2.75rem"
          variant="secondary"
        />
        <!-- literal: 12px, 2.75rem -->
        <Button
          class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium flex-none min-w-0 text-ink-strong! border-status-fail-ink bg-surface-recess hover:bg-surface-recess"
          data-prompt-refuse={refuse}
          disabled={disabledOf("deny")}
          failed={failedOf("deny")}
          icon={IconClose}
          label="Deny"
          onclick={() => answer("deny")}
          pending={pendingOf("deny")}
          pendingLabel="Denying…"
          style="--btn-gap: var(--space-2); --btn-icon: 12px; --btn-h-coarse: 2.75rem"
          variant="secondary"
        />
      </div>
      {@render wait()}
      {#if rule}
        <!-- A clear break from the gate above, on the scale (--space-8 /
             --space-5). The permission scope actually being granted is
             consequential text — it reads at --text-label, never the
             10.25px micro-label step. -->
        <div
          class="mt-space-8 pt-space-5 border-t border-t-border-hairline"
        >
          <!-- literal: 66ch -->
          <p
            class="text-size-body font-normal text-ink-muted mb-space-2 max-w-(--measure)"
            style:--measure="66ch"
          >
            This would allow <span
              class="font-(family-name:--font-mono) text-size-label"
              >{rule.full}</span
            > for
            {rule.scope}
            — a wider grant than the request above.
          </p>
          <!-- A standing grant must read as consequential: the kit's grant
             (warning tint, warning ink, a real edge). -->
          <!-- literal: 12px, 2.75rem -->
          <Button
            class="h-space-8 coarse:h-(--btn-h-coarse) gap-(--btn-gap) rounded-sm px-space-3 text-label font-medium"
            disabled={disabledOf("always")}
            failed={failedOf("always")}
            icon={IconShield}
            label="Always allow {rule.short}"
            onclick={() => answer("always")}
            pending={pendingOf("always")}
            pendingLabel="Allowing…"
            style="--btn-gap: var(--space-2); --btn-icon: 12px; --btn-h-coarse: 2.75rem"
            variant="grant"
          />
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* residual: unmapped */
  /* The title, the body and the foot come up with the shape one after the
     other, by opacity and translate alone, and sink back together as it
     folds. No filter: a blur transitioning on a part hung WebKit's web
     process for good as the card came up (Playwright WebKit 2359 at an
     iPhone's size, the owner's iPhone Safari: "stop responding and it didn't
     even show"; with the blur snapped instead of transitioned, or none, it
     never hung). Two durations and two curves in one transition: no
     utility carries them. */
  @media (prefers-reduced-motion: no-preference) {
    .part {
      transition:
        opacity var(--dur-fade) var(--ease-out),
        translate var(--dur-panel) var(--ease-drawer);
    }
  }
  /* The stagger: it must outrank the shorthand above, which resets the
     delay, so it stands beside it rather than as a utility under it. */
  [data-shown] .part {
    transition-delay: calc(var(--part) * var(--dur-stagger));
  }
  [data-slot="prompt-field"] > dd {
    word-break: break-word;
  }
  /* A list-form option row stands its keycap on the label's first line:
     the cross axis starts at `start` (items-start writes `flex-start`). The
     row is bits-ui's ToggleGroup item, reached through the body. */
  [data-slot="body"] :global([data-list] > .kit-chip) {
    align-items: start;
  }
</style>
