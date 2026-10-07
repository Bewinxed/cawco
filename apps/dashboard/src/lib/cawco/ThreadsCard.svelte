<script lang="ts">
  import { cawco } from "#lib/cawco/client.svelte.js";
  /**
   * A project's threads with Caw (WORDS.md: thread), on the project page:
   * whether Caw leads the project and what its lead has spent, the threads
   * newest first, and one thread open at a time with its messages and a
   * field to answer in. Your message reaches Caw as an event while Caw is
   * on; off, it waits here and nothing wakes a model. Caw's answers arrive
   * as `thread_message` frames and fold in over what was read.
   */
  import ErrorText from "#lib/cawco/ErrorText.svelte";
  import { since } from "#lib/cawco/rules.js";
  import {
    at,
    type CawView,
    listThreads,
    merged,
    postToThread,
    readCaw,
    readThread,
    setCaw,
    startThread,
    type Thread,
    type ThreadMessage,
    type ThreadSummary,
  } from "#lib/cawco/threads.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import { Card } from "#lib/components/ui/card/index.js";
  import { Markdown } from "#lib/components/ui/markdown/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { Switch } from "#lib/components/ui/switch/index.js";
  import { Textarea } from "#lib/components/ui/textarea/index.js";
  import { IconChevronLeft } from "#lib/icons.js";

  let { projectId }: { projectId: string } = $props();

  let caw = $state<CawView | null>(null);
  let threads = $state<ThreadSummary[] | null>(null);
  let open = $state<{ thread: Thread; messages: ThreadMessage[] } | null>(null);
  let draft = $state("");
  let sending = $state(false);
  let switching = $state(false);
  let problem = $state<string | null>(null);

  const message = (error: unknown): string =>
    error instanceof Error ? error.message : String(error);

  /** What was heard live in this project since the page loaded. */
  const heard = $derived(cawco.threadMessagesOf(projectId));

  /** The open thread's messages: read on open, with what was heard since. */
  const shown = $derived(
    open
      ? merged(
          open.messages,
          heard.filter((each) => each.threadId === open?.thread.id)
        )
      : []
  );

  /** The list, each thread's newest message and count taken from what was heard. */
  const listed = $derived.by(() =>
    (threads ?? [])
      .map((thread) => {
        const mine = heard.filter((each) => each.threadId === thread.id);
        const all = merged(thread.last ? [thread.last] : [], mine);
        const last = all.at(-1) ?? null;
        const fresh = mine.filter((each) => each.id !== thread.last?.id);
        return {
          ...thread,
          last,
          count: thread.count + fresh.length,
          at: last ? at(last) : Date.parse(thread.updatedAt),
        };
      })
      .sort((a, b) => b.at - a.at)
  );

  /** Caw's lead session as the board has it: whether it is at work now. */
  const lead = $derived(
    caw?.instanceId
      ? cawco.instances.find((row) => row.id === caw?.instanceId)
      : undefined
  );

  /** One line on Caw: off, waiting for its first event, or leading, and its spend. */
  const cawLine = $derived.by(() => {
    if (!caw) {
      return "";
    }
    if (!caw.on) {
      return "Caw is off: messages wait here, and nothing wakes a model.";
    }
    if (lead?.status === "running") {
      return "Caw is working.";
    }
    return caw.instanceId
      ? "Caw leads this project and wakes on events."
      : "Caw starts on this project's first event.";
  });

  let loadedFor = "";
  $effect(() => {
    if (loadedFor === projectId) {
      return;
    }
    loadedFor = projectId;
    caw = null;
    threads = null;
    open = null;
    problem = null;
    Promise.all([readCaw(projectId), listThreads(projectId)])
      .then(([view, list]) => {
        caw = view;
        threads = list;
      })
      .catch((error: unknown) => {
        problem = message(error);
        threads = [];
      });
  });

  async function toggleCaw(on: boolean) {
    switching = true;
    problem = null;
    try {
      caw = await setCaw(projectId, { on });
    } catch (error) {
      problem = message(error);
    } finally {
      switching = false;
    }
  }

  async function show(id: string) {
    problem = null;
    try {
      open = await readThread(projectId, id);
      draft = "";
    } catch (error) {
      problem = message(error);
    }
  }

  async function submit(event: SubmitEvent) {
    event.preventDefault();
    const body = draft.trim();
    if (!body || sending) {
      return;
    }
    sending = true;
    problem = null;
    try {
      if (open) {
        const sent = await postToThread(projectId, open.thread.id, body);
        open = { ...open, messages: [...open.messages, sent] };
      } else {
        const started = await startThread(projectId, body);
        open = { thread: started.thread, messages: [started.message] };
        threads = [
          { ...started.thread, count: 1, last: started.message },
          ...(threads ?? []),
        ];
      }
      draft = "";
      // A first message can start Caw: its lead session is news.
      readCaw(projectId)
        .then((view) => {
          caw = view;
        })
        .catch(() => undefined);
    } catch (error) {
      problem = message(error);
    } finally {
      sending = false;
    }
  }

  /** mod+Enter sends, as the composer does; Enter alone is a new line. */
  function sendOnModEnter(event: KeyboardEvent) {
    if (event.key !== "Enter" || !(event.metaKey || event.ctrlKey)) {
      return;
    }
    event.preventDefault();
    if (event.currentTarget instanceof HTMLTextAreaElement) {
      event.currentTarget.form?.requestSubmit();
    }
  }

  /** Under your message: whether Caw got it. Sent says nothing (a quiet row is a healthy row). */
  const deliveryLine = (each: ThreadMessage): string | null => {
    if (each.author !== "you") {
      return null;
    }
    switch (each.delivery) {
      case null:
        return "Sending to Caw…";
      case "off":
        return "Caw was off";
      default:
        return null;
    }
  };
</script>

<Card class="gap-0 rounded-[var(--radius-lg)] py-0 shadow-md">
  <header class="head">
    <h2 class="text-title">Threads</h2>
    {#if caw}
      <div class="caw-switch">
        <label class="caw-label" for="caw-{projectId}">Caw</label>
        <Switch
          checked={caw.on}
          disabled={switching}
          id="caw-{projectId}"
          onCheckedChange={toggleCaw}
        />
      </div>
    {/if}
  </header>
  <div class="body">
    {#if caw}
      <p class="caw-line">
        <span class="line">{cawLine}</span>
        {#if caw.on || caw.spentUsd > 0}
          <span class="spend num">${caw.spentUsd.toFixed(2)} spent</span>
        {/if}
      </p>
    {:else}
      <Skeleton class="h-5 w-2/3" />
    {/if}

    {#if open}
      <div class="thread-head">
        <Button
          aria-label="All threads"
          onclick={() => {
            open = null;
            draft = "";
          }}
          size="icon-xs"
          variant="ghost"
        >
          <IconChevronLeft aria-hidden="true" />
        </Button>
        <h3 class="thread-title">{open.thread.title}</h3>
      </div>
      <ol class="messages">
        {#each shown as each (each.id)}
          <li class="message">
            <div class="who">
              <span class="author"
                >{each.author === "caw" ? "Caw" : "You"}</span
              >
              <span class="when num">{since(at(each))}</span>
            </div>
            {#if each.author === "caw"}
              <div class="prose-body"><Markdown source={each.body} /></div>
            {:else}
              <p class="mine">{each.body}</p>
            {/if}
            {#if each.delivery === "failed"}
              <ErrorText
                message={each.deliveryError ?? "Caw could not be reached."}
                title="Caw did not get this message"
              >
                Did not reach Caw
              </ErrorText>
            {:else if deliveryLine(each)}
              <span class="delivery">{deliveryLine(each)}</span>
            {/if}
          </li>
        {/each}
      </ol>
    {:else if threads === null}
      <Skeleton class="h-[var(--c-btn-h-sm)] w-full" />
    {:else if listed.length === 0}
      <p class="line">
        Talk with Caw about this project; each conversation is a thread.
      </p>
    {:else}
      <ul class="threads">
        {#each listed as thread (thread.id)}
          <li>
            <button
              class="row press-tint focus-inset"
              onclick={() => show(thread.id)}
              type="button"
            >
              <span class="title">{thread.title}</span>
              <span class="meta num">
                {thread.count}
                {thread.count === 1 ? "message" : "messages"}
                &middot;
                {since(thread.at)}
              </span>
            </button>
          </li>
        {/each}
      </ul>
    {/if}

    <form class="compose" onsubmit={submit}>
      <Textarea
        aria-label={open ? "Answer in this thread" : "Start a thread"}
        onkeydown={sendOnModEnter}
        placeholder={open ? "Answer Caw…" : "Ask Caw about this project…"}
        rows={2}
        bind:value={draft}
      />
      <div class="actions">
        {#if problem}
          <ErrorText
            message={problem}
            title="The thread could not be read or sent"
          />
        {/if}
        <Button
          class="ml-auto"
          disabled={!draft.trim()}
          pending={sending}
          pendingLabel="Sending…"
          size="sm"
          type="submit"
          >{open ? "Send" : "Start thread"}</Button
        >
      </div>
    </form>
  </div>
</Card>

<style>
  .head {
    display: flex;
    align-items: center;
    gap: var(--space-3);
    padding: var(--space-3) var(--space-4);
  }
  .caw-switch {
    display: inline-flex;
    align-items: center;
    gap: var(--space-2);
    margin-inline-start: auto;
  }
  .caw-label {
    font: var(--type-label);
    color: var(--ink-strong);
    cursor: pointer;
  }
  .body {
    display: flex;
    flex-direction: column;
    gap: var(--space-3);
    padding: 0 var(--space-4) var(--space-4);
  }
  .caw-line {
    display: flex;
    flex-wrap: wrap;
    align-items: baseline;
    column-gap: var(--space-2);
  }
  .spend {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .line {
    font: var(--type-body);
    color: var(--ink-muted);
    text-wrap: pretty;
  }
  .thread-head {
    display: flex;
    align-items: center;
    gap: var(--space-1);
    margin-inline-start: calc(var(--space-2) * -1);
  }
  .thread-title {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    color: var(--ink-strong);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .messages {
    display: flex;
    flex-direction: column;
    gap: var(--space-4);
    margin: 0;
    padding: 0;
    list-style: none;
  }
  .message {
    display: flex;
    flex-direction: column;
    gap: var(--space-1);
    min-inline-size: 0;
  }
  .who {
    display: flex;
    align-items: baseline;
    gap: var(--space-2);
  }
  .author {
    font: var(--type-label);
    color: var(--ink-strong);
  }
  .when,
  .delivery {
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .mine {
    font: var(--type-body);
    color: var(--ink-strong);
    white-space: pre-wrap;
    overflow-wrap: anywhere;
    text-wrap: pretty;
  }
  .prose-body {
    min-inline-size: 0;
    overflow-wrap: anywhere;
  }
  .threads {
    display: flex;
    flex-direction: column;
    gap: var(--space-row);
    margin: 0 calc(var(--space-2) * -1);
    padding: 0;
    list-style: none;
  }
  .row {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    inline-size: 100%;
    min-block-size: var(--c-btn-h-sm);
    padding-inline: var(--space-2);
    border: 0;
    border-radius: var(--radius-sm);
    background: transparent;
    color: var(--ink-strong);
    text-align: start;
    cursor: pointer;
  }
  @media (hover: hover) and (pointer: fine) {
    .row:hover {
      background: var(--surface-hover);
    }
  }
  .title {
    min-inline-size: 0;
    overflow: hidden;
    font: var(--type-label);
    text-overflow: ellipsis;
    white-space: nowrap;
  }
  .meta {
    flex: none;
    margin-inline-start: auto;
    font: var(--type-meta);
    color: var(--ink-subtle);
  }
  .compose {
    display: flex;
    flex-direction: column;
    gap: var(--space-2);
  }
  .actions {
    display: flex;
    align-items: center;
    gap: var(--space-2);
    min-inline-size: 0;
  }
</style>
