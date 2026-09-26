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
  } from "@whiffle/core";
  /**
   * The one human-in-the-loop surface, floating above the composer: a permission
   * gate (a measurably-symmetric Approve / Deny pair, with scope-widening kept
   * apart) or a question (selectable answers plus free text). Both settle their
   * parked tool call by handing the answer up, where it goes out as one tracked
   * command whose stages this card's wait line reads. Ported from the mock's
   * `.hitl`.
   */
  import { onMount } from "svelte";
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
    commandRecord,
    type PendingPermission,
    permissionAnswer,
    whiffle,
  } from "../client.svelte";
  import { permissionSummary, suggestedRule } from "../permission-summary";
  import { questionAnswer, questionsOf } from "../question";

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
  // once and only when it can reach the daemon that asked. `sent` latches the
  // row the instant it is answered — a double-tap, or an Enter after a click,
  // cannot answer twice — and both paths refuse while the hub is unreachable,
  // where the answer would resolve into nothing and leave the turn wedged.
  let sent = $state(false);
  const answerable = $derived(!sent && whiffle.hub === "connected");

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
    sent = true;
    commandId = onanswer(permissionAnswer(request, kind));
  }

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
    sent = true;
    commandId = onanswer(questionAnswer(input, answers));
  }

  /* shadcn <Button>, dressed in DESIGN.md tokens so nothing reads as stock
     shadcn (no 4/8/12 padding ladder, no pill radius, no --primary fill).
     Control height sits on the scale — --space-8 (32) fine, 44 coarse. */
  const btnBase =
    "h-[var(--space-8)] pointer-coarse:h-11 gap-[var(--space-2)] " +
    "rounded-[var(--radius-sm)] px-[var(--space-3)] " +
    "text-label font-medium " +
    "[&_svg:not([class*='size-'])]:size-3";

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

<section
  aria-label={questions ? 'Question from the agent' : 'Permission request'}
  class="hitl"
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
        disabled={!(allAnswered && answerable)}
        onclick={submitQuestion}
      >
        <IconCheck />Answer
      </Button>
      <Button
        class={dismiss}
        disabled={!answerable}
        onclick={() => answer('deny')}
        variant="outline"
        >Dismiss</Button
      >
    </div>
    <!-- One line, three truths: the answer is out, the socket cannot carry it
         yet, or the hub called it off and said why. A live region, so the last
         of those is heard when it replaces the first. -->
    {#if !answerable}
      <p class="wait" role="status">
        {refused ?? (sent ? 'Sent.' : "Reconnecting — can't answer yet.")}
      </p>
    {/if}
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
        disabled={!answerable}
        onclick={() => answer('allow')}
        variant="secondary"
      >
        <IconTick />Approve
      </Button>
      <Button
        class={refuse}
        disabled={!answerable}
        onclick={() => answer('deny')}
        variant="secondary"
      >
        <IconClose />Deny
      </Button>
    </div>
    <!-- One line, three truths: the answer is out, the socket cannot carry it
         yet, or the hub called it off and said why. A live region, so the last
         of those is heard when it replaces the first. -->
    {#if !answerable}
      <p class="wait" role="status">
        {refused ?? (sent ? 'Sent.' : "Reconnecting — can't answer yet.")}
      </p>
    {/if}
    {#if rule}
      <div class="widen">
        <p>
          This would allow <span class="mono">{rule.full}</span> for
          {rule.scope}
          — a wider grant than the request above.
        </p>
        <Button
          class={widen}
          disabled={!answerable}
          onclick={() => answer('always')}
          variant="outline"
        >
          <IconShield />Always allow {rule.short}
        </Button>
      </div>
    {/if}
  {/if}
</section>

<style>
  /* The focal moment: the card arrives with ONE settle and is then completely
     still. No pulse, no attention loop — the arrival is the whole signal, and a
     card that keeps moving after it has landed is asking twice. 200ms is written
     on the token scale (--dur-control × 2) so it moves with the scale if the scale
     moves. `both` holds the from-frame before the first tick, so the card never
     flashes at full opacity for a frame before it settles. */
  @keyframes hitl-settle {
    from {
      opacity: 0;
      transform: translateY(8px);
    }
    to {
      opacity: 1;
      transform: translateY(0);
    }
  }
  .hitl {
    border: 1px solid var(--border-control);
    border-radius: var(--radius-lg);
    background: var(--surface-raised);
    padding: var(--space-3);
    box-shadow: var(--shadow-hairline, var(--shadow-tile));
    animation: hitl-settle calc(var(--dur-control) * 2) var(--ease-out) both;
  }
  @media (prefers-reduced-motion: reduce) {
    .hitl {
      animation: none;
    }
  }
  h2 {
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    display: flex;
    align-items: center;
    gap: var(--space-2);
    margin-bottom: var(--space-2);
  }
  .pill {
    display: inline-flex;
    align-items: center;
    gap: var(--space-1);
    height: 20px;
    padding: 0 var(--space-2);
    border-radius: var(--radius-pill);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    background: var(--status-attn-bg);
    color: var(--status-attn-ink);
  }
  .pill :global(svg) {
    width: 9px;
    height: 9px;
    flex: 0 0 auto;
  }
  .wait {
    margin-top: var(--space-2);
    font-size: var(--text-meta);
    color: var(--ink-muted);
  }
  .lede {
    font-size: var(--text-label);
    line-height: var(--leading-body);
    color: var(--ink-strong);
    margin-bottom: var(--space-2);
    max-width: 72ch;
  }
  .cmd {
    font-family: var(--font-mono);
    font-size: var(--text-label);
    color: var(--ink-strong);
    border-left: 2px solid var(--border-hairline);
    padding: 3px 0 3px var(--space-3);
    margin-bottom: var(--space-2);
    white-space: pre-wrap;
  }

  /* The disclosed payload — collapsed by default, every tool-input field inside. */
  .disclose {
    margin-bottom: var(--space-3);
  }
  .disclose > summary {
    display: inline-flex;
    align-items: center;
    width: fit-content;
    cursor: pointer;
    list-style: none;
    font-size: var(--text-meta);
    color: var(--ink-muted);
    transition: color var(--dur-control) var(--ease-out);
  }
  .disclose > summary::-webkit-details-marker {
    display: none;
  }
  .disclose > summary::before {
    content: "▸";
    margin-right: var(--space-2);
    transition: transform var(--dur-control) var(--ease-out);
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
    margin-top: var(--space-2);
    padding: var(--space-3);
    border-radius: var(--radius-sm);
    background: var(--surface-recess);
  }
  .field {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-width: 0;
  }
  .field .k {
    font-size: var(--text-meta);
    font-weight: var(--weight-medium);
    color: var(--ink-muted);
  }
  .field .v {
    margin: 0;
    max-height: 200px;
    overflow: auto;
    font-family: var(--font-mono);
    font-size: var(--text-meta);
    color: var(--ink-strong);
    white-space: pre-wrap;
    word-break: break-word;
  }
  @media (prefers-reduced-motion: reduce) {
    .disclose > summary,
    .disclose > summary::before {
      transition: none;
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
    margin-top: var(--space-2);
  }
  .choice > :global(*) {
    flex: 0 0 auto;
  }
  .widen {
    /* a clear break from the gate above, on the scale (--space-8 / --space-5) */
    margin-top: var(--space-8);
    padding-top: var(--space-5);
    border-top: 1px solid var(--border-hairline);
  }
  .widen > p {
    font-size: var(--text-label);
    color: var(--ink-muted);
    margin-bottom: var(--space-2);
    max-width: 66ch;
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
    margin: 2px 0 var(--space-2);
  }
  .qopts button {
    min-height: 30px;
    padding: var(--space-2) var(--space-3);
    border: 1px solid var(--border-control);
    border-radius: var(--radius-sm);
    background: var(--surface-raised);
    color: var(--ink-strong);
    font-family: var(--font-body);
    font-size: var(--text-label);
    font-weight: var(--weight-medium);
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    cursor: pointer;
    text-align: left;
    max-width: 100%;
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
    background: var(--brand-solid);
    color: var(--on-brand);
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
    min-width: 17px;
    height: 17px;
    padding: 0 4px;
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
