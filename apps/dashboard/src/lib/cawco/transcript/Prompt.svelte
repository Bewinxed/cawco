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
  /**
   * The one human-in-the-loop surface, floating above the composer: a permission
   * gate (a measurably-symmetric Approve / Deny pair, with scope-widening kept
   * apart) or a question (selectable answers plus free text). Both settle their
   * parked tool call by handing the answer up, where it goes out as one tracked
   * command whose stages this card's wait line reads. Ported from the mock's
   * `.hitl`.
   */
  import { onMount, untrack } from "svelte";
  import { Button } from "$lib/components/ui/button";
  import {
    IconArrowUp,
    IconCheck,
    IconClose,
    IconShield,
    IconTick,
  } from "$lib/icons";
  import { isTyping } from "$lib/utils/typing";
  import {
    cawco,
    commandRecord,
    type PendingPermission,
    permissionAnswer,
  } from "../client.svelte";
  import { permissionSummary, suggestedRule } from "../permission-summary";
  import { questionAnswer, questionsOf } from "../question";
  import { watchedSessions } from "./arrivals.svelte";

  let {
    request,
    onanswer,
  }: {
    request: PendingPermission;
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
  const summary = $derived(permissionSummary(request.toolName, input));
  const command = $derived(
    typeof input.command === "string" ? input.command : null
  );
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

  // A permission blocks the turn that asked it, so its answer must land exactly
  // once and only when it can reach the daemon that asked. `pressed` latches
  // the card the instant it is answered — a double-tap, or an Enter after a
  // click, cannot answer twice — and every path refuses while the hub is
  // unreachable, where the answer would resolve into nothing and leave the
  // turn wedged. The pressed button pends (the kit's pending: spinner, its
  // label morphing to what it is doing) while its peers dim, until the gate
  // leaves; refused, it stops and the reason sits under the buttons.
  type Choice = "allow" | "deny" | "always" | "answer";
  let pressed = $state<Choice | null>(null);
  const connected = $derived(cawco.hub === "connected");
  const answerable = $derived(pressed === null && connected);

  /**
   * The card arrives — settles in — only when it comes in while the reader is
   * watching its session: the same rule every transcript row follows. A card
   * that was already waiting when the page opened, or that came in on a
   * hidden page or behind another pane, is simply there.
   */
  const arriving = untrack(
    () =>
      watchedSessions.has(request.instanceId) &&
      typeof document !== "undefined" &&
      !document.hidden
  );

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
    pressed === null ? !connected : !pendingOf(choice);

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
   * The keys the card already advertises: a digit picks the option wearing that
   * keycap, Enter sends once every question has an answer, Escape dismisses.
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
    if (event.key === "Escape") {
      event.preventDefault();
      answer("deny");
      return;
    }
    if (event.key >= "1" && event.key <= "9") {
      const option = questions?.[current]?.options[Number(event.key) - 1];
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
    if (!answerable) {
      return;
    }
    pressed = "answer";
    commandId = onanswer(questionAnswer(input, answers));
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

  /* A standing grant must read as consequential: warning tint, warning ink,
     a real edge. */
  const widen =
    `${btnBase} border-[var(--status-attn-ink)] !bg-[var(--status-attn-bg)] ` +
    "!text-[color:var(--status-attn-ink)]";
</script>

<svelte:window onkeydown={handleKeydown} />

<!-- Under the buttons, one line when there is something the buttons cannot
     say: the socket cannot carry an answer yet, or the hub refused the one
     sent and said why. A live region, so the refusal is heard. -->
{#snippet wait()}
  {#if refused}
    <p class="wait refused" role="status">{refused}</p>
  {:else if pressed === null && !connected}
    <p class="wait" role="status">Reconnecting — can't answer yet.</p>
  {/if}
{/snippet}

<section
  aria-label={questions ? 'Question from the agent' : 'Permission request'}
  class="hitl"
  class:arriving={arriving}
>
  {#if questions}
    <h2>
      <span class="pill attn"><IconArrowUp />needs you</span>Question from the
      agent
    </h2>
    {#each questions as q, qi (q.question)}
      <p class="lede">{q.question}</p>
      <div class="qopts">
        {#each q.options as opt, i (opt.label)}
          {@const live = ownsKeys && qi === current && i < 9}
          <button
            aria-keyshortcuts={live ? String(i + 1) : undefined}
            aria-pressed={isSelected(q.question, opt.label)}
            class="touch-hit"
            onclick={() => toggle(qi, opt.label)}
            type="button"
            class:sel={isSelected(q.question, opt.label)}
          >
            <span class="kc" class:dim={!live}>{i + 1}</span
            ><span>{opt.label}</span>
          </button>
        {/each}
      </div>
    {/each}
    <div class="qact">
      <Button
        class={primary}
        disabled={disabledOf('answer') || (pressed === null && !allAnswered)}
        failed={failedOf('answer')}
        icon={IconCheck}
        label="Answer"
        onclick={submitQuestion}
        pending={pendingOf('answer')}
        pendingLabel="Answering…"
      />
      <Button
        class={dismiss}
        disabled={disabledOf('deny')}
        failed={failedOf('deny')}
        label="Dismiss"
        onclick={() => answer('deny')}
        pending={pendingOf('deny')}
        pendingLabel="Dismissing…"
        variant="outline"
      />
    </div>
    {@render wait()}
  {:else}
    <h2>
      <span class="pill attn"><IconArrowUp />needs you</span>Permission —
      {request.toolName}
    </h2>
    <p class="lede">{summary}</p>
    {#if command}
      <div class="cmd">{command}</div>
    {/if}
    <!-- The disclosed payload: a summary line is not enough to grant on — an
         Edit/Write/WebFetch shows one sentence and hides the file, the diff, the
         URL it is actually about. Every field of the tool input is here, one
         disclosure away, so the grant is informed. -->
    <details class="disclose">
      <summary>What this touches</summary>
      <div class="fields">
        {#each Object.entries(input) as [key, value]}
          {@const text = typeof value === 'string' ? value : JSON.stringify(value, null, 2)}
          <div class="field">
            <span class="k">{key}</span>
            <pre class="v">{text}</pre>
          </div>
        {/each}
      </div>
    </details>
    <div class="choice">
      <Button
        class={grant}
        disabled={disabledOf('allow')}
        failed={failedOf('allow')}
        icon={IconTick}
        label="Approve"
        onclick={() => answer('allow')}
        pending={pendingOf('allow')}
        pendingLabel="Approving…"
        variant="secondary"
      />
      <Button
        class={refuse}
        disabled={disabledOf('deny')}
        failed={failedOf('deny')}
        icon={IconClose}
        label="Deny"
        onclick={() => answer('deny')}
        pending={pendingOf('deny')}
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
        <Button
          class={widen}
          disabled={disabledOf('always')}
          failed={failedOf('always')}
          icon={IconShield}
          label="Always allow {rule.short}"
          onclick={() => answer('always')}
          pending={pendingOf('always')}
          pendingLabel="Allowing…"
          variant="outline"
        />
      </div>
    {/if}
  {/if}
</section>

<style>
  /* The focal moment: the card arrives with ONE settle and is then completely
     still. No pulse, no attention loop — the arrival is the whole signal, and a
     card that keeps moving after it has landed is asking twice. Two
     --dur-control, so it moves with the scale if the scale moves. `backwards`
     holds the from-frame before the first tick, so the card never flashes at
     full opacity for a frame before it settles. */
  @keyframes hitl-settle {
    from {
      opacity: 0;
      translate: 0 8px;
    }
  }
  .hitl {
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    padding: var(--space-3);
    box-shadow: var(--shadow-hairline, var(--shadow-tile));

    @media (prefers-reduced-motion: no-preference) {
      &.arriving {
        animation: hitl-settle calc(var(--dur-control) * 2) var(--ease-out)
          backwards;
      }
    }
  }
  h2 {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-block-end: var(--space-2);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    block-size: 20px;
    padding-block: 0;
    padding-inline: var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .pill :global(svg) {
    inline-size: 12px;
    block-size: 12px;
    flex: 0 0 auto;
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

  /* The disclosed payload — collapsed by default, every tool-input field inside. */
  .disclose {
    margin-block-end: var(--space-3);
  }
  .disclose > summary {
    display: inline-flex;
    align-items: center;
    inline-size: fit-content;
    cursor: pointer;
    list-style: none;
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-muted);
  }
  .disclose > summary::-webkit-details-marker {
    display: none;
  }
  .disclose > summary::before {
    content: "▸";
    margin-inline-end: var(--space-2);
  }
  .disclose[open] > summary::before {
    transform: rotate(90deg);
  }
  .disclose > summary:hover {
    color: var(--ink-strong);
  }
  .fields {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
    margin-block-start: var(--space-2);
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
  @media (prefers-reduced-motion: no-preference) {
    .disclose > summary {
      transition: color var(--dur-control) var(--ease-out);
    }
    .disclose > summary::before {
      transition: transform var(--dur-control) var(--ease-out);
    }
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
  .qopts {
    --hit-gap-x: var(--space-2);
    --hit-gap-y: var(--space-2);
    display: flex;
    gap: var(--space-2);
    flex-wrap: wrap;
    margin-block: 2px var(--space-2);
  }
  .qopts button {
    min-block-size: 30px;
    padding-block: var(--space-2);
    padding-inline: var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font-family: var(--font-body);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    text-align: start;
    max-inline-size: 100%;
  }
  .qopts button:not(.sel):hover {
    background: var(--surface-hover);
  }
  /* A picked option is a state, not a warning. --status-attn-* is the fleet's
     one hue for "a person is holding this up" (the needs-you pill above, the
     standing grant below); spending it on selection says the reader chose
     wrong. Selection takes the brand instead — brand edge, sunken fill,
     promoted ink, and a keycap that inverts. The brand is monochrome in this
     palette, so those three differences survive greyscale by construction, and
     none of them is a weight or size change: the chip never reflows on pick. */
  .qopts button.sel {
    border-color: var(--brand-solid);
    background: var(--surface-recess);
    color: var(--ink-strong);
  }
  .qopts button.sel .kc {
    background: var(--chip-chosen-bg);
    color: var(--chip-chosen-ink);
  }
  /* A digit that answers nothing must not look like a digit that does: keycaps
     go quiet on every question the keys are not currently pointed at. A picked
     option keeps its bright keycap either way — there it is a record of which
     digit was pressed, not an offer to press it. */
  .qopts button:not(.sel) .kc.dim {
    opacity: 0.45;
  }
  /* biome-ignore lint/style/noDescendingSpecificity: cascade order is load-bearing — .kc's own base rules must lose to .qopts button.sel .kc above them. */
  .kc {
    display: inline-grid;
    place-items: center;
    min-inline-size: 17px;
    block-size: 17px;
    padding-block: 0;
    padding-inline: 4px;
    border-radius: var(--radius-xs);
    background: var(--surface-recess);
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-strong);
    line-height: 1;
    flex: 0 0 auto;
  }
  .qact {
    display: flex;
    gap: var(--space-2);
  }
</style>
