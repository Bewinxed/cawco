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
  import { commandOf, questionsOf } from "@cawco/core";
  /**
   * The one human-in-the-loop surface, held in the composer's grown shape
   * (Composer, grown.ts): a permission gate (a measurably-symmetric Approve /
   * Deny pair, with scope-widening kept apart) or a question (selectable
   * answers, and a line for an answer of the reader's own). Both
   * settle their parked tool call by handing the answer up, where it goes out
   * as one tracked command whose stages this card's wait line reads.
   *
   * The composer draws the surface: this is what stands in it. Its title,
   * its body and its foot come up out of a slight blur one after the other
   * as the shape grows (`shown`), and sink back as it folds.
   */
  import { onMount, tick } from "svelte";
  import DiffView from "#lib/components/features/DiffView.svelte";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Input } from "#lib/components/ui/input/index.js";
  import { Kbd } from "#lib/components/ui/kbd/index.js";
  import {
    IconAsk,
    IconCheck,
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
  }: {
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

  const input = $derived(request.input as Record<string, unknown>);
  const questions = $derived(questionsOf(request.toolName, input));
  const presentation = $derived(request.presentation);
  const command = $derived(commandOf(input));
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
   * never moves; when it asks several, the digits follow the first question
   * still unanswered, and only that question's keycaps are lit — a keycap that
   * cannot be pressed is the defect this whole handler exists to fix.
   */
  let current = $state(0);

  function advance(): void {
    if (!questions) {
      return;
    }
    const next = questions.findIndex((q) => !isAnswered(q));
    if (next !== -1) {
      current = next;
    }
  }

  function toggle(index: number, label: string): void {
    const q = questions?.[index];
    if (!(q && answerable)) {
      return;
    }
    current = index;
    if (!q.multiSelect) {
      // Re-picking the chosen option clears it, so a mis-keyed digit is undoable
      // with the same digit rather than only by picking something else.
      const chosen = answers[q.question] === label;
      answers = { ...answers, [q.question]: chosen ? "" : label };
      // A picked option is the answer: the field's own goes back to waiting.
      if (otherAt === index) {
        otherAt = null;
        otherField?.blur();
      }
      if (!chosen) {
        advance();
      }
      return;
    }
    const value = answers[q.question];
    const list = asList(value);
    answers = {
      ...answers,
      [q.question]: list.includes(label)
        ? list.filter((l) => l !== label)
        : [...list, label],
    };
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

  /** The keys the field's line answers: Enter sends or moves on, Esc puts it down. */
  function otherKey(event: KeyboardEvent): void {
    if (event.key === "Escape") {
      event.preventDefault();
      event.stopPropagation();
      otherAt = null;
      otherField?.blur();
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
    otherAt = null;
    otherField?.blur();
    advance();
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
   * keycap, Enter sends once every question has an answer. Escape is not one:
   * it is heard window-wide, where it closes a menu, a dialog or a peek, and
   * an ask is settled only by the reader's own choice, never by a key meant
   * for something else (an Escape here once dismissed a question unseen).
   * They are inert while the reader is writing (`isTyping`) — which is what
   * lets "2" mean an option here and a character in the composer — inert under
   * a modifier, so browser and OS chords still reach their owners, and inert
   * whenever the buttons are, so the `answerable` latch is the single gate on
   * answering: an answer cannot be keyed in twice, or into a dead socket.
   */
  function handleKeydown(event: KeyboardEvent): void {
    if (!(ownsKeys && answerable)) {
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
    if (event.key === "Enter" && allAnswered) {
      event.preventDefault();
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

  /** Dismiss, pressed: the question is declined in the words the CLI uses for it. */
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
     one fill and one border. They differ in kind, never in salience: a check
     in --ink-strong grants, a cross in --ink-muted refuses. */
  const peer = `${btnBase} flex-1 min-w-0`;
  const grant = `${peer} !text-[var(--ink-strong)]`;
  const refuse = `${peer} !text-[var(--ink-muted)]`;
  const primary = `${btnBase} px-[var(--space-4)]`;
  const dismiss = btnBase;
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Under the buttons, one line when there is something the buttons cannot
     say: the session's machine or the socket cannot carry an answer yet, or
     the hub refused the one sent and said why. A live region, so the
     refusal is heard. -->
{#snippet wait()}
  {#if refused}
    <p class="wait refused" role="status">{refused}</p>
  {:else if pressed === null && offline}
    <p class="wait" role="status">Machine offline — can't answer yet.</p>
  {:else if pressed === null && !reachable}
    <p class="wait" role="status">Reconnecting — can't answer yet.</p>
  {/if}
{/snippet}

<!-- The title: what asks, and who, with where it stands among the asks
     waiting when there are several ("2 of 3"): they come one at a time. -->
{#snippet title(
  text: string
)}
  <h2 class="part" style:--part="0">
    <span aria-hidden="true" class="glyph">
      {#if questions}
        <IconAsk />
      {:else}
        <IconShield />
      {/if}
    </span>
    <span class="title">{text}</span>
    {#if place && place.of > 1}
      <Kbd class="place num">{place.at} of {place.of}</Kbd>
    {/if}
  </h2>
{/snippet}

<section
  aria-label={questions
    ? `Question from ${asker}`
    : `Permission request from ${presentation.asker}`}
  class="hitl"
  class:shown={shown}
>
  {#if questions}
    {@render title(`Question from ${asker}`)}
    <div class="body part" style:--part="1" class:railed={questions.length > 1}>
      {#if rail}
        <span
          aria-hidden="true"
          class="rail"
          style:block-size="{rail.height}px"
          style:translate="0 {rail.top}px"
        ></span>
      {/if}
      {#each questions as q, qi (q.question)}
        {@const own = q.options.length}
        <p class="lede" bind:this={ledes[qi]}>{q.question}</p>
        <div class="qopts kit-chips">
          {#each q.options as opt, i (opt.label)}
            {@const live = ownsKeys && qi === current && i < 9}
            <button
              aria-keyshortcuts={live ? String(i + 1) : undefined}
              aria-pressed={isSelected(q.question, opt.label)}
              class="kit-chip touch-hit"
              onclick={() => toggle(qi, opt.label)}
              type="button"
              class:sel={isSelected(q.question, opt.label)}
            >
              <span class="kit-keycap">{i + 1}</span><span>{opt.label}</span>
            </button>
          {/each}
          <!-- The reader's own answer, written in the field it opens. -->
          {#if own < 9}
            {@const live = ownsKeys && qi === current}
            <button
              aria-keyshortcuts={live ? String(own + 1) : undefined}
              aria-pressed={otherPicked(q) || otherAt === qi}
              class="kit-chip touch-hit"
              onclick={() => openOther(qi)}
              type="button"
              class:sel={otherPicked(q) || otherAt === qi}
            >
              <span class="kit-keycap">{own + 1}</span><span>Other</span>
            </button>
          {/if}
        </div>
        {#if otherAt === qi}
          <!-- The reader's own answer, a field under the choices it stands
               in for, before the card's actions. -->
          <Input
            aria-label={`Your answer to: ${q.question}`}
            class="other"
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
    <div class="foot part" style:--part="2">
      <div class="qact">
        <Button
          class={primary}
          disabled={disabledOf("answer") || (pressed === null && !allAnswered)}
          failed={failedOf("answer")}
          icon={IconCheck}
          label="Answer"
          onclick={submitQuestion}
          pending={pendingOf("answer")}
          pendingLabel="Answering…"
        />
        <Button
          class={dismiss}
          disabled={disabledOf("deny")}
          failed={failedOf("deny")}
          label="Dismiss"
          onclick={dismissQuestion}
          pending={pendingOf("deny")}
          pendingLabel="Dismissing…"
          variant="outline"
        />
      </div>
      {@render wait()}
    </div>
  {:else}
    {@render title(`${presentation.asker} asks for permission`)}
    <!-- What will happen and to what, then the change itself, open: a grant
         is made on what it changes, never on a sentence about it. The words
         are the hub's (core permission-presentation.ts), the same on iOS and
         Telegram; secrets in the fields are already hidden. -->
    <div class="body part" style:--part="1">
      <p class="lede summary">{presentation.summary}</p>
      {#if presentation.detail}
        <p class="detail">{presentation.detail}</p>
      {/if}
      {#if command}
        <div class="cmd">{command}</div>
      {/if}
      {#if presentation.changes.length > 0}
        <div class="changes">
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
      {#if presentation.fields.length > 0}
        <dl class="fields">
          {#each presentation.fields as field, i (`${i}:${field.key}`)}
            <div class="field">
              <dt class="k">{field.key}</dt>
              <dd class="v">{field.value}</dd>
            </div>
          {/each}
        </dl>
      {/if}
    </div>
    <div class="foot part" style:--part="2">
      <div class="choice">
        <Button
          class={grant}
          disabled={disabledOf("allow")}
          failed={failedOf("allow")}
          icon={IconTick}
          label="Approve"
          onclick={() => answer("allow")}
          pending={pendingOf("allow")}
          pendingLabel="Approving…"
          variant="secondary"
        />
        <Button
          class={refuse}
          disabled={disabledOf("deny")}
          failed={failedOf("deny")}
          icon={IconClose}
          label="Deny"
          onclick={() => answer("deny")}
          pending={pendingOf("deny")}
          pendingLabel="Denying…"
          variant="secondary"
        />
      </div>
      {@render wait()}
      {#if rule}
        <div class="widen">
          <p>
            This would allow <span class="mono">{rule.full}</span> for
            {rule.scope}
            — a wider grant than the request above.
          </p>
          <!-- A standing grant must read as consequential: the kit's grant
             (warning tint, warning ink, a real edge). -->
          <Button
            class={btnBase}
            disabled={disabledOf("always")}
            failed={failedOf("always")}
            icon={IconShield}
            label="Always allow {rule.short}"
            onclick={() => answer("always")}
            pending={pendingOf("always")}
            pendingLabel="Allowing…"
            variant="grant"
          />
        </div>
      {/if}
    </div>
  {/if}
</section>

<style>
  /* The grown shape is the surface (Composer draws it): the card is what
     stands in it, its title on top, its foot on the pill's top edge, and a
     long ask scrolls between the two. As tall as the room over the pill
     allows (`--ask-max`, the composer's). */
  .hitl {
    display: flex;
    flex-direction: column;
    max-block-size: var(--ask-max, none);
    padding: var(--space-3) var(--space-3) var(--space-2);
  }
  .body {
    position: relative;
    flex: 1 1 auto;
    min-block-size: 0;
    overflow-y: auto;
    overscroll-behavior: contain;
  }
  /* The live question's rail, on its lede's inline edge (`.railed .lede`,
     below). */
  .rail {
    position: absolute;
    inset-block-start: 0;
    inset-inline-start: 0;
    inline-size: 1px;
    background: var(--brand-solid);
    pointer-events: none;

    @media (prefers-reduced-motion: no-preference) {
      transition:
        translate var(--dur-control) var(--ease-drawer),
        block-size var(--dur-control) var(--ease-drawer);
    }
  }
  .foot {
    flex: none;
    padding-block-start: var(--space-1);
  }
  /* The title, the body and the foot come up with the shape, out of a
     slight blur, one after the other (the queued edit's row, Composer), and
     sink back together as it folds. */
  .part {
    opacity: 0;
    filter: blur(4px);
    transition:
      opacity var(--dur-fade) var(--ease-out),
      filter var(--dur-fade) var(--ease-out);

    @media (prefers-reduced-motion: no-preference) {
      translate: 0 var(--pop-rise);
      transition:
        opacity var(--dur-fade) var(--ease-out),
        translate var(--dur-panel) var(--ease-drawer),
        filter var(--dur-fade) var(--ease-out);
    }
  }
  .shown .part {
    opacity: 1;
    translate: none;
    filter: none;
    transition-delay: calc(var(--part) * var(--dur-stagger));
  }
  h2 {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
  }
  /* What asks, in the title's ink. Solar draws the question-circle's disc
     at 20/24 of its box, so the box is --icon-lg for the disc itself to
     stand at the title row's 16px icon size, its "?" large enough to read
     over the duotone's half-ink layer. */
  .glyph {
    display: inline-grid;
    place-items: center;
    flex: none;
    color: inherit;

    & :global(svg) {
      inline-size: var(--icon-lg);
      block-size: var(--icon-lg);
    }
  }
  .title {
    min-inline-size: 0;
    overflow: hidden;
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  h2 :global(.place) {
    margin-inline-start: auto;
  }
  /* The reader's own answer (the kit's field), on the step under the choices. */
  .body :global(.other) {
    margin-block-end: var(--space-2);
  }
  .wait {
    margin-block-start: var(--space-2);
    font-size: var(--text-meta);
    font-weight: var(--weight-body);
    color: var(--ink-muted);

    &.refused {
      color: var(--status-fail-ink);
    }
  }
  .lede {
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    margin-block-end: var(--space-2);
    max-inline-size: 72ch;
  }
  /* Every lede of a several-question ask stands off the rail's edge by the
     same step, railed or not, so nothing moves as the rail does. */
  .railed .lede {
    padding-inline-start: var(--space-2);
  }
  .cmd {
    font-family: var(--font-mono);
    font-size: var(--text-label);
    color: var(--ink-strong);
    border-inline-start: 2px solid var(--border-hairline);
    padding-block: 3px;
    padding-inline: var(--space-3) 0;
    margin-block-end: var(--space-2);
    white-space: pre-wrap;
  }

  /* What will happen, in the title's weight: the line the grant is made on. */
  .summary {
    font-weight: var(--weight-strong);
    margin-block-end: var(--space-1);
    overflow-wrap: anywhere;
  }
  /* How much it changes and where, under it. */
  .detail {
    font-size: var(--text-label);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    margin-block-end: var(--space-2);
  }
  /* The change itself, open: each diff stands to the token's share of the
     screen and scrolls inside it, so the answer row stays in reach. */
  .changes {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
  }
  /* The rest of the input, shown rather than disclosed: each field's name
     over its value, values that run long scrolling in place. */
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block: 0 var(--space-3);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .field .k {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .field .v {
    margin: 0;
    max-block-size: 200px;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-strong);
    white-space: pre-wrap;
    word-break: break-word;
  }
  /* JOURNEY §Triage: the full row width sits between grant and refusal. At
     --space-2 the two sat 7px apart, close enough that a hand aiming at
     Approve lands on Deny. The gap is unfillable on purpose — no third
     control belongs between a grant and a refusal — and --space-8 is the
     floor it never falls below when the row is narrow. */
  .choice {
    display: flex;
    justify-content: space-between;
    gap: var(--space-8);
    margin-block-start: var(--space-2);
  }
  .choice > :global(*) {
    flex: 0 0 auto;
  }
  .widen {
    /* a clear break from the gate above, on the scale (--space-8 / --space-5) */
    margin-block-start: var(--space-8);
    padding-block-start: var(--space-5);
    border-block-start: 1px solid var(--border-hairline);
  }
  .widen > p {
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
    margin-block-end: var(--space-2);
    max-inline-size: 66ch;
  }
  /* The permission scope actually being granted is consequential text — it
     reads at --text-label, never the 10.25px micro-label step. */
  .mono {
    font-family: var(--font-mono);
    font-size: var(--text-label);
  }
  /* The chip row is the kit's option-chip recipe (.kit-chips / .kit-chip in
     app.css); the card only sets where it sits. */
  .qopts {
    margin-block: 2px var(--space-2);
  }
  .qact {
    display: flex;
    gap: var(--space-2);
  }
</style>
