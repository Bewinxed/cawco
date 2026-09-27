<script lang="ts">
  import { quintOut } from "svelte/easing";
  import { fly } from "svelte/transition";
  import { Badge } from "$lib/components/ui/badge";
  import { Button } from "$lib/components/ui/button";
  import { Card } from "$lib/components/ui/card";
  import { isTyping } from "$lib/utils/typing";
  import ActivityDot from "./ActivityDot.svelte";
  /**
   * Everything in the fleet parked on a human, in one calm list — the Whiffle
   * fleet view's whole answer to "what needs me right now". One thing parks on
   * a person, so one thing is here: a permission or a question, which blocks
   * the turn that asked it and has an answer the user can give.
   *
   * A session that died has nothing to answer, so it is deliberately absent:
   * failure is a notification the row's status already carries, not a need.
   *
   * Derived rather than tracked, so a queue is never stale: the moment a
   * session clears its permissions, the strip that named it is gone with it.
   *
   * Ordered by how long the ask has been waiting, longest first — the one
   * ordering that matches why the list exists. The hub does not stamp a
   * permission with the moment it was raised, so the clock here is this
   * browser's own first sighting of the request; for an ask replayed from
   * `/api/pending` at page load that reads as "since you opened this tab",
   * which is why a row says "waiting" rather than claiming an exact age.
   *
   * Deliberately unalarming. The status dot already carries the one hue the
   * fleet uses for "needs you"; the rest of the strip reads like any other row
   * in the app, so a reader with six sessions waiting on them can scan this
   * calmly instead of bracing for six red banners.
   */
  import {
    type BlockedRequest,
    type PermissionAnswer,
    permissionAnswer,
    resolvePermission,
    whiffle,
  } from "./client.svelte";
  import { conversationHref } from "./links";
  import { reducedMotion } from "./motion.svelte";
  import { permissionSummary } from "./permission-summary";
  import { questionsOf } from "./question";

  /** A request only ever belongs to one session, but the pair is the honest key. */
  const rowKey = (item: BlockedRequest): string =>
    `${item.instanceId}:${item.request.requestId}`;

  /**
   * When this tab first saw each parked ask. Module-scoped so the clock keeps
   * running across the board mounting and unmounting, and pruned against the
   * live list so an answered ask does not leak its entry.
   */
  const firstSeen = new Map<string, number>();

  /** Ticks the relative ages without re-reading the store. */
  let now = $state(Date.now());
  $effect(() => {
    const timer = setInterval(() => {
      now = Date.now();
    }, 15_000);
    return () => clearInterval(timer);
  });

  const blocked = $derived(whiffle.blocked);
  const total = $derived(blocked.length);

  const queue = $derived.by(() => {
    const at = Date.now();
    const live = new Set(blocked.map(rowKey));
    for (const key of firstSeen.keys()) {
      if (!live.has(key)) {
        firstSeen.delete(key);
      }
    }

    const rows = blocked.map((item) => {
      const key = rowKey(item);
      let since = firstSeen.get(key);
      if (since === undefined) {
        since = at;
        firstSeen.set(key, since);
      }
      const questions = questionsOf(item.request.toolName, item.request.input);
      return {
        key,
        item,
        since,
        isQuestion: Boolean(questions),
        summary: questions
          ? questions.map((question) => question.question).join(" · ")
          : permissionSummary(item.request.toolName, item.request.input),
      };
    });

    // Longest wait first: the ask that has held a session up the longest is the
    // one the reader should answer next.
    return rows.sort((a, b) => a.since - b.since);
  });

  /** "waiting 4m" — deliberately vague under a minute, never a fake precision. */
  function waited(since: number): string {
    const seconds = Math.max(0, Math.floor((now - since) / 1000));
    if (seconds < 60) {
      return "waiting";
    }
    const minutes = Math.floor(seconds / 60);
    if (minutes < 60) {
      return `waiting ${minutes}m`;
    }
    const hours = Math.floor(minutes / 60);
    return hours < 24
      ? `waiting ${hours}h`
      : `waiting ${Math.floor(hours / 24)}d`;
  }

  function answer(item: BlockedRequest, kind: PermissionAnswer): void {
    resolvePermission(
      item.instanceId,
      item.machineId,
      item.request.requestId,
      permissionAnswer(item.request, kind)
    );
  }

  /**
   * The same two-letter pairs the permission card answers to (`y`/`a` allow,
   * `n`/`d` deny), while a control inside the row has focus — the handler sits
   * on the row's own buttons and link, so every path into it is a real tab
   * stop rather than a tabindex on a list item. A question has no one-key
   * answer — it wants an actual choice made in the session — so it never gets
   * a shortcut here, and neither does a row while the reader is typing
   * somewhere else.
   */
  function onKeydown(
    event: KeyboardEvent,
    item: BlockedRequest,
    isQuestion: boolean
  ): void {
    if (isQuestion || isTyping()) {
      return;
    }
    if (event.metaKey || event.ctrlKey || event.altKey) {
      return;
    }
    const key = event.key.toLowerCase();
    if (key === "y" || key === "a") {
      event.preventDefault();
      answer(item, "allow");
    } else if (key === "n" || key === "d") {
      event.preventDefault();
      answer(item, "deny");
    }
  }
</script>

{#if total > 0}
  <Card
    aria-labelledby="attention-queue-heading"
    class="flex flex-col gap-0 rounded-[var(--radius-lg)] py-0 shadow-[var(--shadow-tile)] [--card-spacing:var(--space-4)]"
  >
    <header
      class="flex flex-wrap items-center gap-[var(--space-2)] px-[var(--space-4)] pt-[var(--space-4)] pb-[var(--space-2)]"
    >
      <h2
        class="text-body font-medium text-foreground"
        id="attention-queue-heading"
      >
        Needs you
      </h2>
      <!-- Needs-you is not failure: --status-attn-* is the fleet's one hue for
           "a person is holding this up" (DESIGN.md Never #3 reserves red). -->
      <Badge
        aria-label="{total} {total === 1 ? 'session needs' : 'sessions need'} you"
        class="min-w-5 bg-[var(--status-attn-bg)] px-1.5 !text-[color:var(--status-attn-ink)] tabular-nums"
        variant="secondary"
      >
        {total}
      </Badge>
      <span class="text-label text-muted-foreground">Longest wait first</span>
    </header>

    <ul class="flex flex-col">
      {#each queue as entry (entry.key)}
        {@const item = entry.item}
        <li
          class="flex flex-wrap items-start gap-x-[var(--space-3)] gap-y-[var(--space-2)] border-t border-border-a60 px-[var(--space-4)] py-[var(--space-3)] first:border-t-0"
          in:fly={{ y: -8, duration: reducedMotion.current ? 0 : 240, easing: quintOut }}
        >
          <span class="mt-1 shrink-0">
            <ActivityDot activity="blocked" />
          </span>

          <div class="min-w-0 flex-1">
            <div class="flex flex-wrap items-baseline gap-x-2">
              <a
                class="text-body truncate font-medium text-foreground transition-colors hover:text-primary focus-visible:outline-none focus-ring"
                href={conversationHref(item.instanceId, whiffle.instanceIndex)}
                onkeydown={(event) => onKeydown(event, item, entry.isQuestion)}
              >
                {item.hostname}
              </a>
              {#if item.cwd}
                <!-- The path is what tells two blocked sessions on the same
                     machine apart — TX-02, like every other path in the app. -->
                <span class="text-meta text-muted-foreground truncate font-mono"
                  >{item.cwd}</span
                >
              {/if}
              <span
                class="text-label shrink-0 text-muted-foreground tabular-nums"
              >
                {waited(entry.since)}
              </span>
            </div>
            <p class="text-body truncate text-muted-foreground">
              {entry.isQuestion ? 'Asked a question' : entry.summary}
            </p>
          </div>

          <!-- A phone gives the actions their own row rather than squeezing
               the reason that made them necessary down to three words. -->
          <div
            class="flex w-full shrink-0 items-center justify-end gap-[var(--space-1)] sm:w-auto sm:pt-0.5"
          >
            {#if entry.isQuestion}
              <Button
                href={conversationHref(item.instanceId, whiffle.instanceIndex)}
                size="sm"
                >Answer</Button
              >
            {:else}
              <Button
                aria-label="Approve {entry.summary} on {item.hostname}"
                onclick={() => answer(item, 'allow')}
                onkeydown={(event: KeyboardEvent) => onKeydown(event, item, false)}
                size="sm"
              >
                Approve
              </Button>
              <Button
                aria-label="Deny {entry.summary} on {item.hostname}"
                onclick={() => answer(item, 'deny')}
                onkeydown={(event: KeyboardEvent) => onKeydown(event, item, false)}
                size="sm"
                variant="ghost"
              >
                Deny
              </Button>
              <Button
                href={conversationHref(item.instanceId, whiffle.instanceIndex)}
                size="sm"
                variant="ghost"
                >Open</Button
              >
            {/if}
          </div>
        </li>
      {/each}
    </ul>
  </Card>
{/if}
