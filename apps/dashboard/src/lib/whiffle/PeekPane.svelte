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
  import { goto } from "$app/navigation";
  import { Button } from "$lib/components/ui/button";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte convention for component groups
  import * as ContextMenu from "$lib/components/ui/context-menu";
  import {
    IconClose,
    IconExternal,
    IconFolder,
    IconFork,
    IconStop,
  } from "$lib/icons";
  import { smoothText } from "$lib/utils/smooth-text.svelte";
  import { getToolGlance } from "$lib/utils/tool-display";
  import ActivityDot from "./ActivityDot.svelte";
  import {
    ACTIVITY_LABEL,
    SLEEPING_LABEL,
    UNKNOWN_HINT,
    UNKNOWN_LABEL,
  } from "./activity";
  import ContextMeter from "./ContextMeter.svelte";
  import {
    forkSession,
    isFailed,
    isResumable,
    isStale,
    openSession,
    type PendingPermission,
    type PermissionAnswer,
    permissionAnswer,
    preloadHistory,
    refreshContext,
    resolvePermission,
    setPeeked,
    stopSession,
    whiffle,
  } from "./client.svelte";
  import { identityVar } from "./folder-prefs.svelte";
  import { conversationHref } from "./links";
  import { machineLabel } from "./machine";
  import OsMark from "./OsMark.svelte";
  import { permissionSummary } from "./permission-summary";
  import { questionsOf } from "./question";
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
      const held = whiffle.session(id);
      if (!(held?.initialized && held.messages.length > 0)) {
        // biome-ignore lint/complexity/noVoid: fire-and-forget inside untrack — the read publishes into the store the tail below reads
        void preloadHistory(id);
      }
    });
  });

  const session = $derived(whiffle.session(target.viewId) ?? null);
  const row = $derived(whiffle.instanceIndex.byId.get(target.viewId) ?? null);

  const failed = $derived(row ? isFailed(row) : false);
  const sleeping = $derived(row ? isResumable(row) : false);
  /** The hub can't reach this row's machine — distinct from idle and asleep. */
  const stale = $derived(row ? isStale(row) : false);
  const running = $derived(
    row?.status === "running" || row?.status === "starting"
  );
  const activity = $derived(whiffle.activityOf(target.viewId));
  const stateLabel = $derived.by(() => {
    if (failed) {
      return "Failed";
    }
    if (sleeping) {
      return SLEEPING_LABEL;
    }
    if (stale) {
      return UNKNOWN_LABEL;
    }
    return ACTIVITY_LABEL[activity];
  });
  const tool = $derived(whiffle.currentToolOf(target.viewId));

  const machine = $derived.by(() => {
    const machineId = session?.machineId || row?.machineId || "";
    return (
      whiffle.machines.find((entry) => entry.machineId === machineId) ?? null
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
    const instanceId = forkSession({
      machineId: machine.machineId,
      cwd,
      sessionId: forkable,
      harness: session?.harness ?? "claude",
      history: session?.messages ?? [],
    });
    await goto(conversationHref(instanceId, whiffle.instanceIndex));
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

  const glanceOf = (message: Message): string =>
    getToolGlance(
      message.metadata?.toolInput as Record<string, unknown> | undefined
    );

  function answer(request: PendingPermission, kind: PermissionAnswer): void {
    if (!session) {
      return;
    }
    resolvePermission(
      session.instanceId,
      session.machineId,
      request.requestId,
      permissionAnswer(request, kind)
    );
  }

  let tailEl = $state<HTMLDivElement | null>(null);

  // The tail grows by whole turns and by streamed characters, and follows
  // either: what a peek is for is the last thing said, not the first.
  $effect(() => {
    if (!tailEl || tail.length + stream.text.length === 0) {
      return;
    }
    tailEl.scrollTop = tailEl.scrollHeight;
  });
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
          <p class="flex items-baseline gap-2 text-micro text-muted-foreground">
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

  <div class="flex items-center gap-2 px-4 pb-3 text-micro">
    {#if failed}
      <span class="size-2 shrink-0 rounded-full bg-error"></span>
    {:else}
      <ActivityDot {activity} {sleeping} {stale} />
    {/if}
    <span
      class="shrink-0 {failed || activity === 'blocked'
        ? 'font-medium text-error'
        : 'text-muted-foreground'}"
      >{stateLabel}</span
    >
    {#if activity === 'working' && tool}
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
    <div
      class="flex flex-col gap-2 border-t border-border/50 bg-error/10 px-4 py-3"
    >
      <p class="text-body">
        {question ? 'asked a question' : permissionSummary(request.toolName, request.input)}
      </p>
      <div class="flex items-center justify-end gap-1.5">
        {#if question}
          <!-- A question wants a real choice, which is made on its own card
               in the session — never guessed at from out here. -->
          <Button href={target.href} size="sm">Answer</Button>
        {:else}
          <Button onclick={() => answer(request, 'allow')} size="sm"
            >Allow</Button
          >
          <Button
            onclick={() => answer(request, 'deny')}
            size="sm"
            variant="ghost"
          >
            Deny
          </Button>
        {/if}
      </div>
    </div>
  {/each}

  {#if failed}
    <p
      class="border-t border-border/50 bg-error/10 px-4 py-3 text-caption text-error"
    >
      {row?.lastError || 'Failed without saying why.'}
    </p>
  {:else if stale}
    <p
      class="border-t border-border/50 px-4 py-3 text-caption text-muted-foreground"
    >
      {UNKNOWN_HINT}
    </p>
  {/if}

  <!-- What it set out to do, before what it last said about doing it.
       Capped, because a peek is a glance — a forty-task plan scrolls inside
       its own section rather than pushing the tail off. -->
  {#if progress}
    <div class="flex flex-col border-t border-border/50 pb-2">
      <p class="px-4 pt-3 pb-1 text-caption">
        Tasks · {progress.done} of {progress.total}
      </p>
      <div class="max-h-48 overflow-y-auto px-2">
        <TaskPanel dense viewId={target.viewId} />
      </div>
    </div>
  {/if}

  <div
    class="flex min-h-0 flex-1 flex-col gap-3 overflow-y-auto border-t border-border/50 px-4 py-3"
    bind:this={tailEl}
  >
    {#if session?.loading && tail.length === 0}
      <p class="text-caption">Reading…</p>
    {:else if session?.readFault && tail.length === 0}
      <!-- A read that failed is not a session with nothing to say. -->
      <p class="text-caption text-error">
        Couldn't read this session: {session.readFault.message}
      </p>
    {:else if tail.length === 0 && !session?.streaming}
      <p class="text-caption">Nothing said yet.</p>
    {:else}
      {#each tail as message, index (message.id ?? index)}
        {#if message.type === 'tool.use' || message.type === 'tool.handoff'}
          <p
            class="flex items-baseline gap-1.5 text-micro text-muted-foreground"
          >
            <span class="shrink-0"
              >{message.metadata?.toolName ?? message.content}</span
            >
            {#if glanceOf(message)}
              <span class="shrink-0">·</span>
              <span class="truncate font-mono">{glanceOf(message)}</span>
            {/if}
          </p>
        {:else if message.type === 'user' || message.type === 'user.peer'}
          <!-- The one voice worth tinting: what the session was asked. -->
          <p
            class="line-clamp-4 rounded-lg bg-primary/10 px-3 py-2 text-body break-words whitespace-pre-wrap"
          >
            {message.content}
          </p>
        {:else if message.type === 'result.error'}
          <p class="line-clamp-3 text-body break-words text-error">
            {message.content}
          </p>
        {:else}
          <p class="line-clamp-6 text-body break-words whitespace-pre-wrap">
            {message.content}
          </p>
        {/if}
      {/each}
      {#if session?.streaming}
        <p class="text-body break-words whitespace-pre-wrap">
          {stream.text}
          <span
            class="inline-block h-4 w-[3px] animate-pulse rounded-xs bg-primary/60 align-text-bottom"
          ></span>
        </p>
      {/if}
    {/if}
  </div>
</div>
