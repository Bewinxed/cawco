<script lang="ts">
  import { Badge } from "#lib/components/ui/badge/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { LiveDot } from "#lib/components/ui/live-dot/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import {
    IconChat,
    IconChevronLeft,
    IconExternal,
    IconHistory,
    IconPause,
    IconRules,
    IconUser,
  } from "#lib/icons.js";
  import { cn } from "#lib/utils.js";
  import AskMessage from "./AskMessage.svelte";
  import Composer from "./Composer.svelte";
  import DecisionBody from "./DecisionBody.svelte";
  import LineMessage from "./LineMessage.svelte";
  import type { Decision, Moment, Thread } from "./model.js";
  import { clock, since } from "./model.js";
  import { ARRIVE, RETINT } from "./motion.js";
  import PickList from "./PickList.svelte";
  import { KIND, WORDS } from "./words.js";

  /**
   * One asking session as a thread: its head (who, where, what it is doing,
   * how long it has stopped, Not now, Open the session), its messages in
   * time order, and the composer with Send. Every state a thread reaches is
   * in its `moment`, so each can be forced from a story; the live instance
   * keeps its own picks, words and sends as he works.
   */
  let {
    thread,
    moment = {},
    aside: asideArg = false,
    found,
    goesTo,
    onback,
    onaside,
    onkind,
    onpicture,
    onsent,
  }: {
    thread: Thread;
    moment?: Moment;
    /** Not now: set aside, still stopped. */
    aside?: boolean;
    /** A search result opened it here: this decision is marked. */
    found?: string;
    goesTo?: (d: Decision) => string;
    /** Back to the list, where the list is not beside it. */
    onback?: () => void;
    onaside?: (aside: boolean) => void;
    onkind?: () => void;
    onpicture?: () => void;
    onsent?: () => void;
  } = $props();

  const picksArg = $derived(moment.picks ?? {});
  const draftArg = $derived(moment.draft ?? "");
  const failed = $derived(moment.failed ?? false);
  const replied = $derived(moment.replied ?? false);
  const reply = $derived(moment.reply);
  const revision = $derived(moment.revision);
  const costAccount = $derived(moment.costAccount);
  const load = $derived(moment.load ?? "ready");
  const missing = $derived(moment.missing ?? 0);

  let picks = $derived(picksArg);
  let draft = $derived(draftArg);
  let sent = $derived(moment.sent ?? false);
  let pickAgain = $derived(moment.pickAgain ?? "none");
  let pickAgainOn = $derived(moment.pickAgainOn ?? "");
  let correcting = $derived(moment.correcting ?? false);
  let aside = $derived(asideArg);
  /** What he sent, kept as he sent it. */
  let sentPicks = $state<Record<string, string[]>>({});
  let sentWords = $state("");
  let settledBy = $state<"" | "changed" | "kept">("");

  const allDecisions = $derived(
    thread.messages.flatMap((m) => {
      if (m.kind === "ask") {
        return m.decisions;
      }
      return m.kind === "ahead" ? [m.decision] : [];
    })
  );
  /** What went with the send: his own, or the picks a story says were sent. */
  function whatWent(): Record<string, string[]> {
    if (!sent) {
      return {};
    }
    return Object.keys(sentPicks).length ? sentPicks : picksArg;
  }
  const sentSet = $derived(whatWent());
  const unsent = $derived(
    Object.entries(picks).filter(
      ([id, ids]) => ids.length && sentSet[id] !== ids
    ).length
  );
  const youPicks = $derived(
    Object.entries(sentSet).flatMap(([id, ids]) => {
      const d = allDecisions.find((x) => x.id === id);
      return d && ids.length
        ? [
            {
              question: d.question,
              label: d.options
                .filter((o) => ids.includes(o.id))
                .map((o) => o.label)
                .join(", "),
            },
          ]
        : [];
    })
  );
  const youWords = $derived(sent ? sentWords || draftArg : "");
  const resumedWith = $derived(youPicks.map((p) => p.label).join(" and "));

  function send() {
    sentPicks = { ...picks };
    sentWords = draft;
    draft = "";
    sent = true;
    onsent?.();
  }

  const goes = (d: Decision) => goesTo?.(d) ?? "goes to you";
  const speakerAt = (iso: string) => clock(iso);
</script>

<div class={cn("@container flex h-full min-h-0 min-w-0 flex-col", ARRIVE)}>
  <!-- One bar, one row: Back where the list is elsewhere; the thread's own
       acts trailing. The session's facts are content, under it. -->
  <div class="flex min-h-c-btn-h shrink-0 items-center gap-space-2">
    {#if onback}
      <span class="@wide/exchange:hidden">
        <Button
          aria-label={WORDS.backToThreads}
          icon={IconChevronLeft}
          onclick={onback}
          size="icon-sm"
          title={WORDS.backToThreads}
          variant="ghost"
        />
      </span>
    {/if}
    <div class="ms-auto flex items-center gap-space-2">
      {#if thread.standing === "stopped"}
        <Button
          aria-pressed={aside}
          onclick={() => {
            aside = !aside;
            onaside?.(aside);
          }}
          size="sm"
          variant="ghost">{WORDS.notNow}</Button
        >
      {/if}
      <Button href="#session-{thread.id}" size="sm" variant="outline">
        <span>{WORDS.openSession}</span>
        <IconExternal aria-hidden="true" data-icon="inline-end" />
      </Button>
    </div>
  </div>

  <div class="min-h-0 flex-1 overflow-y-auto">
    <div class="mx-auto flex w-full min-w-0 flex-col @phone:max-w-c-composer-w">
      <header class="flex min-w-0 flex-col gap-space-2 pt-space-3 pb-space-7">
        <h2 class="type-title text-balance text-ink-strong">
          {thread.session}
        </h2>
        <p
          class="type-meta flex flex-wrap items-center gap-x-space-2 gap-y-space-1 text-ink-muted"
        >
          <span class="font-medium text-ink-strong">{thread.harness}</span>
          <span>· {thread.machine} ·</span>
          <Button onclick={onkind} pad="none" size="xs" variant="link"
            >{thread.project}</Button
          >
        </p>
        <p class="type-meta text-pretty text-ink-muted">{thread.doing}</p>
        <p
          class="mark-line flex flex-wrap items-center gap-x-space-2 gap-y-space-1"
        >
          {#if thread.standing === "stopped" && !replied}
            <Badge data-box variant="attn"
              ><span>{aside ? "Set aside · still stopped" : "Stopped"}</span
              ></Badge
            >
            <span class="type-meta text-ink-muted tabular-nums"
              >{since(thread.since)}</span
            >
          {:else if replied && thread.standing === "stopped"}
            <LiveDot />
            <span class="type-label text-ink-strong">Working</span>
            <span class="type-meta text-ink-muted">resumed just now</span>
          {:else if thread.standing === "ahead"}
            <span class="type-label text-ink-strong">{WORDS.wentAhead}</span>
            <span class="type-meta text-ink-muted tabular-nums"
              >{since(thread.since)} ago</span
            >
          {:else if thread.standing === "ended"}
            <IconPause aria-hidden="true" class="size-icon-md text-ink-muted" />
            <span class="type-label text-ink-strong">Ended</span>
          {/if}
        </p>
      </header>

      {#if load === "loading"}
        <div class="flex flex-col gap-space-7" aria-busy="true">
          <Skeleton class="w-full" height="board" radius="card" />
          <Skeleton class="w-2/3" height="block" radius="card" />
        </div>
      {:else if load === "failed"}
        <div class="flex flex-col items-start gap-space-3 py-space-5">
          <p class="type-body text-pretty text-ink-strong">
            Couldn't read this thread: the hub answered (502). Its messages are
            safe on {thread.machine}.
          </p>
          <Button size="sm" variant="outline">{WORDS.tryAgain}</Button>
        </div>
      {:else}
        <ol class="flex min-w-0 flex-col gap-space-7 pb-space-7">
          {#if missing > 0}
            <li
              class="type-meta rounded-md border border-border-control border-dashed px-space-3 py-space-2 text-ink-muted"
            >
              <span class="tabular-nums">{missing}</span> earlier messages the
              hub couldn't fetch from {thread.machine}. They're kept there.
            </li>
          {/if}
          {#if thread.messages.length === 0}
            <li class="type-body py-space-5 text-pretty text-ink-muted">
              {thread.harness} withdrew both its asks at 12:02. Nothing here waits
              on you.
            </li>
          {/if}
          {#each thread.messages as m (m.id)}
            <li
              class={cn(
                "min-w-0",
                RETINT,
                found &&
                  m.kind === "ask" &&
                  m.decisions.some((d) => d.id === found) &&
                  "-mx-space-3 rounded-lg bg-surface-fill p-space-3"
              )}
            >
              {#if m.kind === "ask"}
                <LineMessage
                  at={speakerAt(m.at)}
                  icon={IconChat}
                  speaker="{thread.harness} asked"
                >
                  <AskMessage
                    goesTo={goes}
                    message={m}
                    {onkind}
                    onpick={(id, next) => {
                      picks = { ...picks, [id]: next };
                    }}
                    onpickagain={(id) => {
                      pickAgainOn = id;
                      pickAgain = "asked";
                    }}
                    {onpicture}
                    {picks}
                    stoppedSince={m.at}
                  />
                </LineMessage>
              {:else if m.kind === "you"}
                <LineMessage
                  at={speakerAt(m.at)}
                  icon={IconUser}
                  speaker="You"
                  tone="you"
                >
                  <PickList picks={m.picks} />
                  {#if m.note}
                    <p
                      class="type-body text-pretty break-words text-ink-strong"
                    >
                      {m.note}
                    </p>
                  {/if}
                </LineMessage>
              {:else if m.kind === "agent"}
                <LineMessage
                  at={speakerAt(m.at)}
                  icon={IconChat}
                  speaker={thread.harness}
                >
                  <p class="type-body text-pretty text-ink-strong">{m.text}</p>
                </LineMessage>
              {:else if m.kind === "settled"}
                <LineMessage
                  at={speakerAt(m.at)}
                  icon={IconRules}
                  speaker="{m.settlement.name} settled this for you"
                >
                  <div
                    class="flex min-w-0 flex-col gap-space-3 rounded-lg border border-border-hairline p-space-4"
                  >
                    <p class="type-meta text-ink-muted">
                      {m.decision.kind ? KIND[m.decision.kind] : ""} · goes to an
                      advisor
                    </p>
                    <p class="type-row text-balance text-ink-strong">
                      {m.decision.question}
                    </p>
                    <p class="type-label text-ink-strong">
                      {m.decision.options.find((o) =>
                        m.decision.chosen?.includes(o.id)
                      )?.label}
                    </p>
                    <p class="type-body text-pretty text-ink-muted">
                      {m.settlement.why}
                    </p>
                    <ul class="flex flex-wrap gap-space-1">
                      {#each m.settlement.sources as source (source)}
                        <li>
                          <Badge kind="meta"
                            ><span class="font-mono">{source}</span></Badge
                          >
                        </li>
                      {/each}
                    </ul>
                    {#if pickAgain === "none"}
                      <div class="flex flex-wrap gap-space-2 pt-space-1">
                        <Button size="sm" variant="outline"
                          >{WORDS.letStand}</Button
                        >
                        <Button
                          aria-label="{WORDS.pickAgain} on {m.decision
                            .question}"
                          onclick={() => {
                            pickAgainOn = m.decision.id;
                            pickAgain = "asked";
                          }}
                          size="sm"
                          variant="outline">{WORDS.pickAgain}</Button
                        >
                      </div>
                    {/if}
                  </div>
                </LineMessage>
              {:else if m.kind === "ahead"}
                <LineMessage
                  at={speakerAt(m.at)}
                  icon={IconChat}
                  speaker="{thread.harness} went ahead"
                >
                  <div
                    class="@container flex min-w-0 flex-col gap-space-4 rounded-lg bg-surface-raised p-space-4 shadow-tile @phone:p-space-6"
                  >
                    <p class="type-meta text-ink-muted">
                      {WORDS.wentAhead} on
                      <span class="font-medium text-ink-strong"
                        >{m.decision.options.find((o) => o.id === m.chosen)
                          ?.label}</span
                      >
                      · {m.since}
                    </p>
                    {#if correcting}
                      <DecisionBody
                        decision={m.decision}
                        goesTo={goes(m.decision)}
                        {onkind}
                        onpick={(next) => {
                          picks = { ...picks, [m.decision.id]: next };
                        }}
                        {onpicture}
                        picked={picks[m.decision.id] ?? []}
                      />
                    {:else}
                      {@const taken = m.decision.options.find(
                        (o) => o.id === m.chosen
                      )}
                      <DecisionBody
                        choosing={false}
                        decision={m.decision}
                        goesTo={goes(m.decision)}
                        {onkind}
                        {onpicture}
                      />
                      {#if taken}
                        <div
                          class="flex min-w-0 flex-col gap-space-1 rounded-md bg-surface-recess p-space-3"
                        >
                          <p class="type-meta text-ink-muted">Its default</p>
                          <p class="type-label text-pretty text-ink-strong">
                            {taken.label}
                          </p>
                          <p class="type-meta text-pretty text-ink-strong">
                            {taken.line}
                          </p>
                          <p class="type-meta text-pretty text-ink-muted">
                            Costs: {taken.cost}
                          </p>
                        </div>
                      {/if}
                      <div>
                        <Button
                          onclick={() => {
                            correcting = true;
                          }}
                          size="sm"
                          variant="outline">{WORDS.correctIt}</Button
                        >
                      </div>
                    {/if}
                  </div>
                </LineMessage>
              {:else if m.kind === "ended"}
                <LineMessage
                  at={speakerAt(m.at)}
                  icon={IconPause}
                  speaker="{thread.harness} ended"
                >
                  <p class="type-body text-pretty text-ink-strong">
                    <span class="tabular-nums">{m.neverPicked.length}</span>
                    never picked. {m.takenBy} takes this thread now: send a pick or
                    your words and it answers.
                  </p>
                  <ul class="flex flex-col gap-space-1">
                    {#each m.neverPicked as q (q)}
                      <li class="type-meta text-pretty text-ink-muted">{q}</li>
                    {/each}
                  </ul>
                </LineMessage>
              {/if}
            </li>
          {/each}

          {#if pickAgain !== "none"}
            <li class="min-w-0">
              <LineMessage icon={IconUser} speaker="You" tone="you">
                <p class="type-meta text-ink-muted">{WORDS.pickAgain} on</p>
                <p class="type-body text-pretty text-ink-strong">
                  {allDecisions.find((d) => d.id === pickAgainOn)?.question ??
                    ""}
                </p>
              </LineMessage>
            </li>
            <li class="min-w-0">
              {#if pickAgain === "asked"}
                <p
                  class="type-meta mark-line flex items-center gap-space-2 text-ink-muted"
                >
                  <LiveDot />
                  <span
                    >{thread.harness} is working out what changing it costs</span
                  >
                </p>
              {:else if costAccount}
                <LineMessage icon={IconChat} speaker={thread.harness}>
                  <p class="type-body text-pretty text-ink-strong">
                    {costAccount.text}
                  </p>
                  <ul class="flex flex-col gap-space-1">
                    {#each costAccount.touches as t (t)}
                      <li class="type-meta text-pretty text-ink-muted">{t}</li>
                    {/each}
                  </ul>
                  {#if settledBy}
                    <p class="type-label text-ink-strong">
                      {settledBy === "changed"
                        ? "You changed it. The agent is told."
                        : "You kept it as it stands."}
                    </p>
                  {:else}
                    <div class="flex flex-wrap gap-space-2">
                      <Button
                        onclick={() => {
                          settledBy = "changed";
                        }}
                        size="sm"
                        variant="outline">{WORDS.changeIt}</Button
                      >
                      <Button
                        onclick={() => {
                          settledBy = "kept";
                        }}
                        size="sm"
                        variant="outline">{WORDS.keepIt}</Button
                      >
                    </div>
                  {/if}
                </LineMessage>
              {/if}
            </li>
          {/if}

          {#if sent}
            <li class="min-w-0">
              <LineMessage at="now" icon={IconUser} speaker="You" tone="you">
                {#if youPicks.length}
                  <PickList picks={youPicks} />
                {/if}
                {#if youWords}
                  <p class="type-body text-pretty break-words text-ink-strong">
                    {youWords}
                  </p>
                {/if}
                {#if failed}
                  <div
                    class="flex flex-wrap items-center gap-x-space-3 gap-y-space-2"
                  >
                    <p class="type-meta text-pretty text-error-11">
                      Couldn't send: {thread.machine} stopped answering (timeout).
                      Your picks and words are kept here.
                    </p>
                    <Button size="xs" variant="outline">{WORDS.tryAgain}</Button
                    >
                  </div>
                {/if}
              </LineMessage>
            </li>
            {#if !failed}
              <li class="min-w-0">
                {#if replied}
                  <LineMessage
                    at="now"
                    icon={IconChat}
                    speaker={thread.harness}
                  >
                    <p class="type-body text-pretty text-ink-strong">
                      {reply ?? `Resumed with ${resumedWith}.`}
                    </p>
                  </LineMessage>
                {:else}
                  <p
                    class="type-meta mark-line flex items-center gap-space-2 text-ink-muted"
                  >
                    <LiveDot />
                    <span>Sent. Waiting for {thread.harness} to read it</span>
                  </p>
                {/if}
              </li>
            {/if}
            {#if replied && revision}
              <li class="min-w-0">
                <LineMessage
                  at="now"
                  icon={IconHistory}
                  speaker="{thread.harness} revised its ask"
                >
                  <p class="type-body text-pretty text-ink-strong">
                    {revision.changed}
                  </p>
                  <p class="type-meta text-pretty text-ink-muted">
                    {revision.kept}
                  </p>
                </LineMessage>
              </li>
            {/if}
          {/if}
        </ol>
      {/if}
    </div>
  </div>
  {#if load === "ready" && thread.standing !== "quiet"}
    <div
      class="mx-auto w-full shrink-0 pt-space-2 pb-space-4 @phone:max-w-c-composer-w"
    >
      <Composer bind:draft onsend={send} picks={unsent} />
    </div>
  {/if}
</div>
