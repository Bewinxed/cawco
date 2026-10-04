<script lang="ts" module>
  /** Which session the board is peeking, and where a dive would land. */
  export interface PeekTarget {
    /** Where Open goes. */
    href: string;
    /** What the board row the peek came from calls it. */
    title: string;
    /** The instance the peek is watching. */
    viewId: string;
  }
</script>

<script lang="ts">
  import { getToolGlance, machineLabel } from "@cawco/core";
  /**
   * The middle step of the board's loop: glance at the fleet, peek at one
   * session, dive into it. A peek answers "what is this one actually doing"
   * without leaving the board, so it shows the tail of the conversation rather
   * than the conversation — the last handful of turns, rendered flat, with the
   * live text still arriving. Anything that needs reading properly is a dive.
   *
   * It reads the same session state the route does and reads its history the
   * same way, so peeking a session and then opening it costs one transcript
   * read between them, not two.
   */
  import { untrack } from "svelte";
  import { toast } from "svelte-sonner";
  import { Button } from "#lib/components/ui/button/index.js";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import { followTail } from "#lib/hooks/follow-tail.js";
  import {
    IconClose,
    IconExternal,
    IconFolder,
    IconFork,
    IconStop,
    IconTick,
  } from "#lib/icons.js";
  import { smoothText } from "#lib/utils/smooth-text.svelte.js";
  import { goto } from "$app/navigation";
  import {
    ACTIVITY_LABEL,
    SLEEPING_LABEL,
    STOPPED_LABEL,
    UNKNOWN_HINT,
    UNKNOWN_LABEL,
  } from "./activity";
  import ContextMeter from "./ContextMeter.svelte";
  import {
    cawco,
    forkSession,
    isFailed,
    isResumable,
    isStale,
    openSession,
    type PendingPermission,
    type PermissionAnswer,
    permissionAnswer,
    readTranscript,
    refreshContext,
    setPeeked,
    stopSession,
    submitCommand,
  } from "./client.svelte";
  import { identityVar } from "./folder-prefs.svelte";
  import { conversationHref } from "./links";
  import OsMark from "./OsMark.svelte";
  import { permissionSummary } from "./permission-summary";
  import { plainMarkdown, plainStreaming } from "./plain-markdown";
  import { questionsOf } from "./question";
  import SessionMark, { sessionStatus } from "./SessionMark.svelte";
  import TaskPanel from "./TaskPanel.svelte";
  import { refreshTasks, taskProgress, tasksOf } from "./tasks.svelte";
  import type { Message } from "./types";

  interface Props {
    /** Puts the peek away; the board keeps its place. */
    onclose: () => void;
    target: PeekTarget;
  }

  let { target, onclose }: Props = $props();

  // A peek is a live view, so it subscribes for frames exactly like an open tab
  // and unsubscribes the moment it is put away. Untracked: `setPeeked` reads the
  // peeked id it writes, and tracking that read re-ran this effect on its own
  // write, subscribing and unsubscribing until Svelte gave up.
  $effect(() => {
    const id = target.viewId;
    untrack(() => setPeeked(id));
    return () => untrack(() => setPeeked(null));
  });

  // Opening writes to the store, so it stays in an effect and the reads below
  // stay derived — the route's bargain, for the same reason: the fields this
  // writes are ones the store reads back, and tracking them would loop. A live
  // session the board never opened has already said everything it has said,
  // and frames only carry what comes next, so its history is read back once.
  $effect(() => {
    const id = target.viewId;
    untrack(() => {
      openSession(id);
      // A peek is the one moment a session's plan is looked at from the board,
      // and no frame is coming to say it moved while nobody was watching.
      refreshTasks(id);
      const held = cawco.session(id);
      if (!(held?.initialized && held.messages.length > 0)) {
        // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — the read publishes into the store the tail below reads
        void readTranscript(id);
      }
    });
  });

  const session = $derived(cawco.session(target.viewId) ?? null);
  const row = $derived(cawco.instanceIndex.byId.get(target.viewId) ?? null);

  const failed = $derived(row ? isFailed(row) : false);
  const sleeping = $derived(row ? isResumable(row) : false);
  /** The hub can't reach this row's machine — distinct from idle and asleep. */
  const stale = $derived(row ? isStale(row) : false);
  const running = $derived(
    row?.status === "running" || row?.status === "starting"
  );
  const activity = $derived(cawco.activityOf(target.viewId));
  const stateLabel = $derived.by(() => {
    if (failed) {
      return "Failed";
    }
    if (row?.status === "stopped") {
      return STOPPED_LABEL;
    }
    if (sleeping) {
      return SLEEPING_LABEL;
    }
    if (stale) {
      return UNKNOWN_LABEL;
    }
    return ACTIVITY_LABEL[activity];
  });
  const tool = $derived(cawco.currentToolOf(target.viewId));

  const machine = $derived.by(() => {
    const machineId = session?.machineId || row?.machineId || "";
    return (
      cawco.machines.find((entry) => entry.machineId === machineId) ?? null
    );
  });

  const host = $derived(
    machine
      ? machineLabel(machine.hostname)
      : session?.machineId || row?.machineId || ""
  );

  const cwd = $derived(session?.cwd || row?.cwd || "");

  /** The SDK session a fork branches from. */
  const forkable = $derived(session?.sessionId ?? row?.sessionId ?? null);

  async function fork() {
    if (!(forkable && machine)) {
      return;
    }
    // The page leaves for the fork once the hub has taken it; a refusal stays
    // here, with the hub's reason.
    let instanceId: string;
    try {
      instanceId = await forkSession({
        machineId: machine.machineId,
        cwd,
        sessionId: forkable,
        harness: session?.harness ?? "claude",
      });
    } catch (error) {
      toast.error(error instanceof Error ? error.message : String(error));
      return;
    }
    await goto(conversationHref(instanceId, cawco.instanceIndex));
  }

  /**
   * A permission parked by a process that has since died cannot be answered —
   * the reply reaches a daemon with no such session. A dead one shows none.
   */
  const answerable = $derived.by((): PendingPermission[] => {
    if (!(row && running)) {
      return [];
    }
    return session?.pending ?? [];
  });

  // Only a live session has a window to report on, and only one that has been
  // asked has a number; asking once per peek is what makes the meter say
  // something rather than sit at a dash.
  $effect(() => {
    const id = target.viewId;
    const machineId = session?.machineId;
    if (!(machineId && running)) {
      return;
    }
    // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — the store the effect reads is what this call updates
    untrack(() => void refreshContext(id, machineId));
  });

  const plan = $derived(tasksOf(target.viewId));
  const progress = $derived(
    plan && plan.tasks.length > 0 ? taskProgress(plan) : null
  );

  /** How much conversation a peek is: enough to see what it is up to. */
  const TAIL = 10;

  /** What a tail says. The rest is chrome the transcript renders and this does not. */
  const SPOKEN = new Set<Message["type"]>([
    "user",
    "user.peer",
    "assistant",
    "tool.use",
    "tool.handoff",
    "result.error",
  ]);

  const tail = $derived(
    (session?.messages ?? [])
      .filter(
        (message) =>
          SPOKEN.has(message.type) && message.content.trim().length > 0
      )
      .slice(-TAIL)
  );

  const stream = smoothText(() => session?.streaming ?? "");
  /** The paced stream, flat, held to its last whole word. */
  const streamed = $derived(plainStreaming(stream.text));

  const glanceOf = (message: Message): string =>
    getToolGlance(
      message.metadata?.toolInput as Record<string, unknown> | undefined
    );

  function answer(request: PendingPermission, kind: PermissionAnswer): void {
    if (!session) {
      return;
    }
    // Not optimistic: the request leaves when the hub has taken the answer.
    submitCommand(session.instanceId, session.machineId, "permission.answer", {
      requestId: request.requestId,
      result: permissionAnswer(request, kind),
    });
  }
</script>

<div class="peek flex min-h-0 flex-1 flex-col overflow-hidden">
  <ContextMenu.Root>
    <ContextMenu.Trigger class="contents">
      <header class="flex items-start gap-2 px-4 py-3">
        <div class="min-w-0 flex-1">
          <h2 class="flex min-w-0 items-center gap-2 text-body font-medium">
            <!-- The directory's hue, the same one its row wears: the peek
                 belongs to a project. -->
            {#if cwd}
              <IconFolder
                class="identity-ink size-4 shrink-0"
                style={identityVar(cwd)}
              />
            {/if}
            <span class="truncate">{target.title}</span>
          </h2>
          <p class="flex items-baseline gap-2 text-meta text-muted-foreground">
            <span class="flex shrink-0 items-center gap-1.5">
              {#if machine}
                <OsMark class="size-3.5" os={machine.os} />
              {/if}
              {host}
            </span>
            {#if cwd}
              <!-- Truncated from the left, as every path in the app is: the
                   leaf is what tells two checkouts apart. -->
              <span
                class="min-w-0 truncate font-mono [direction:rtl]"
                title={cwd}
              >
                <bdi>{cwd}</bdi>
              </span>
            {/if}
          </p>
        </div>
        <Button
          class="-mr-1.5 shrink-0"
          href={target.href}
          size="sm"
          variant="ghost"
        >
          Open
        </Button>
      </header>
    </ContextMenu.Trigger>

    <ContextMenu.Content>
      <ContextMenu.Item onSelect={() => goto(target.href)}>
        <IconExternal />
        Open
      </ContextMenu.Item>
      <ContextMenu.Item disabled={!(forkable && machine)} onSelect={fork}>
        <IconFork />
        Fork
      </ContextMenu.Item>
      {#if running && row}
        <ContextMenu.Item onSelect={() => stopSession(row.id, row.machineId)}>
          <IconStop />
          Stop
        </ContextMenu.Item>
      {/if}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={onclose}>
        <IconClose />
        Close peek
      </ContextMenu.Item>
    </ContextMenu.Content>
  </ContextMenu.Root>

  <div class="flex items-center gap-2 px-4 pb-3 text-meta">
    <SessionMark
      id={target.viewId}
      place={row?.cwd || row?.machineId || target.viewId}
      status={sessionStatus(row)}
    />
    <span
      class="shrink-0 {failed || activity === "blocked"
        ? "font-medium text-error"
        : "text-muted-foreground"}"
      >{stateLabel}</span
    >
    {#if activity === "working" && tool}
      <span class="flex min-w-0 items-baseline gap-1.5 text-muted-foreground">
        <span class="shrink-0">{tool.name}</span>
        <span class="shrink-0">·</span>
        <span class="truncate font-mono">{tool.glance}</span>
      </span>
    {/if}
    {#if running}
      <span class="ml-auto flex shrink-0 items-center gap-1">
        <ContextMeter
          compaction={session?.lastCompaction ?? null}
          onrefresh={() => {
            if (session) {
              // biome-ignore lint/complexity/noVoid: fire-and-forget by intent — the meter re-renders off the store this call updates
              void refreshContext(session.instanceId, session.machineId);
            }
          }}
          status={session?.sdkStatus ?? null}
          usage={session?.context ?? null}
        />
      </span>
    {/if}
  </div>

  <!-- What the session is parked on comes before what it was saying: the
       tail scrolls, and this must not be somewhere in it. -->
  {#each answerable as request (request.requestId)}
    {@const question = Boolean(questionsOf(request.toolName, request.input))}
    {@const summary = question
      ? "asked a question"
      : permissionSummary(request.toolName, request.input)}
    <div
      class="flex flex-col gap-2 border-t border-border/50 bg-[var(--status-attn-bg)] px-4 py-3"
    >
      <p class="text-body">{summary}</p>
      {#if question}
        <!-- A question wants a real choice, which is made on its own card
             in the session — never guessed at from out here. -->
        <div class="flex items-center justify-end">
          <Button href={target.href} size="sm" variant="secondary"
            >Answer</Button
          >
        </div>
      {:else}
        <!-- Equal peers at opposite ends (DESIGN.md, The Peer Rule). -->
        <div class="flex items-center justify-between gap-8">
          <Button
            aria-label="Deny {summary}"
            onclick={() => answer(request, "deny")}
            size="sm"
            variant="secondary"
          >
            <IconClose class="text-[var(--ink-muted)]" />
            Deny
          </Button>
          <Button
            aria-label="Approve {summary}"
            onclick={() => answer(request, "allow")}
            size="sm"
            variant="secondary"
          >
            <IconTick class="text-[var(--ink-strong)]" />
            Approve
          </Button>
        </div>
      {/if}
    </div>
  {/each}

  {#if failed}
    <p
      class="border-t border-border/50 bg-error/10 px-4 py-3 text-meta text-error"
    >
      {row?.lastError || "Failed without saying why."}
    </p>
  {:else if stale}
    <p
      class="border-t border-border/50 px-4 py-3 text-meta text-muted-foreground"
    >
      {UNKNOWN_HINT}
    </p>
  {/if}

  <!-- What it set out to do, before what it last said about doing it.
       Capped, because a peek is a glance — a forty-task plan scrolls inside
       its own section rather than pushing the tail off. -->
  {#if progress}
    <div class="flex flex-col border-t border-border/50 pb-2">
      <p class="px-4 pt-3 pb-1 text-label">
        Tasks · {progress.done} of {progress.total}
      </p>
      <div class="max-h-48 overflow-y-auto px-2">
        <TaskPanel dense viewId={target.viewId} />
      </div>
    </div>
  {/if}

  <!-- The tail grows by whole turns and by streamed characters, and follows
       either: what a peek is for is the last thing said. Each session
       peeked opens at its own end. -->
  {#key target.viewId}
    <div
      class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-border/50 px-4 py-3"
      {@attach followTail()}
    >
      {#if session?.loading && tail.length === 0}
        <p class="text-meta">Reading…</p>
      {:else if session?.readFault && tail.length === 0}
        <!-- A read that failed is not a session with nothing to say. -->
        <p class="text-meta text-error">
          Couldn't read this session: {session.readFault.message}
        </p>
      {:else if tail.length === 0 && !session?.streaming}
        <p class="text-meta">Nothing said yet.</p>
      {:else}
        {#each tail as message, index (message.id ?? index)}
          {#if message.type === "tool.use" || message.type === "tool.handoff"}
            <p
              class="flex items-baseline gap-1.5 text-meta text-muted-foreground"
            >
              <span class="shrink-0"
                >{message.metadata?.toolName ?? message.content}</span
              >
              {#if glanceOf(message)}
                <span class="shrink-0">·</span>
                <span class="truncate font-mono">{glanceOf(message)}</span>
              {/if}
            </p>
          {:else if message.type === "user" || message.type === "user.peer"}
            <!-- The one voice worth tinting: what the session was asked. -->
            <p
              class="line-clamp-4 rounded-lg bg-action-solid/10 px-3 py-2 text-body break-words whitespace-pre-wrap"
            >
              {message.content}
            </p>
          {:else if message.type === "result.error"}
            <!-- A failed turn's last words are the agent's too: flat. -->
            <p class="line-clamp-3 text-body break-words text-error">
              {plainMarkdown(message.content)}
            </p>
          {:else}
            <!-- The agent's words read flat: its markdown, without the syntax. -->
            <p class="line-clamp-6 text-body break-words whitespace-pre-wrap">
              {plainMarkdown(message.content)}
            </p>
          {/if}
        {/each}
        {#if session?.streaming}
          <p class="text-body break-words whitespace-pre-wrap">
            {streamed}
            <span
              class="inline-block h-4 w-[3px] rounded-xs bg-action-solid/60 align-text-bottom"
            ></span>
          </p>
        {/if}
      {/if}
    </div>
  {/key}
</div>
