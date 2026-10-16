<script lang="ts">
  /**
   * Right-click (long-press on touch, the menu key on a focused row) on a
   * session, wherever one is listed: the rail, a project's page, the Fleet
   * board. Keep and Discard are what a spin-off is waiting on, so they only
   * appear on one (NEW.md §1). Fork and Stop decide as the peek header's menu
   * does: Fork needs a conversation and its machine, Stop a live process.
   *
   * Every action keeps the person on the row they asked from (DESIGN.md, The
   * Stay In Context Rule): Fork and Keep stay pending in the menu and say a
   * refusal there; Stop and Archive say what is on its way and what did not
   * go on the row itself (session-acts); Rename edits the row's title where
   * it stands (`onrename`); a delete asks under the row, through the row's
   * own `asker` (AskHere, The Open Page Rule), and the page stays live.
   *
   * The row is the trigger itself: `children` is handed the trigger's props
   * and spreads them on its own root element, so a table row stays a `<tr>`.
   */
  import {
    CONTROL_SPIN_OFF_HELD,
    type HarnessKind,
    holdsNothing,
    machineLabel,
    type SpinOffHeld,
  } from "@cawco/core";
  import type { Snippet } from "svelte";
  // biome-ignore lint/performance/noNamespaceImport: shadcn-svelte component-group convention
  import * as ContextMenu from "#lib/components/ui/context-menu/index.js";
  import {
    IconArchive,
    IconArrowRight,
    IconCheck,
    IconColumns,
    IconExternal,
    IconFork,
    IconPenLine,
    IconStop,
    IconTrash,
    IconUnarchive,
  } from "#lib/icons.js";
  import { goto } from "$app/navigation";
  import AccountSubmenu from "./accounts/AccountSubmenu.svelte";
  import type { Asker, AskHereRequest } from "./ask-here.svelte";
  import {
    archiveWorkspace,
    cawco,
    deleteTranscript,
    discardSession,
    forkSession,
    type InstanceRow,
    keepSession,
    machineControl,
    removeSession,
    workspaceHeld,
  } from "./client.svelte";
  import { continueInNewSession } from "./continue.svelte";
  import {
    archive,
    archivedRow,
    endedUnseen,
    home,
    unarchive,
  } from "./home/home-state.svelte";
  import { conversationHref } from "./links";
  import { heldByMove } from "./move.svelte";
  import { stopOnRow } from "./session-acts.svelte";
  import { sessionName } from "./session-name";
  import {
    canOpenBeside,
    focusAfterMenu,
    openBeside,
  } from "./workspace/open-beside.svelte";

  interface Props {
    /** The row's questions: its `<AskHere at={instance.id}>` draws them under it. */
    asker: Asker<AskHereRequest>;
    /** The row, spreading the trigger's props on its root element. */
    children: Snippet<[Record<string, unknown>]>;
    instance: InstanceRow;
    /** Set only where the row is listed as finished: takes it off the list. */
    onarchive?: () => void;
    /** The row's title becomes a field where it stands. */
    onrename: () => void;
  }

  let { asker, instance, onarchive, onrename, children }: Props = $props();

  const href = $derived(conversationHref(instance.id, cawco.instanceIndex));
  const scratch = $derived(instance.kind === "scratch");
  const running = $derived(
    instance.status === "running" || instance.status === "starting"
  );
  /** Stopping now cuts a turn short: the item says so. */
  const midTurn = $derived(
    running && cawco.activityOf(instance.id) === "working"
  );

  const session = $derived(cawco.session(instance.id) ?? null);
  /** The SDK session a fork branches from. */
  const forkable = $derived(session?.sessionId ?? instance.sessionId ?? null);
  const machine = $derived(
    cawco.machines.find((entry) => entry.machineId === instance.machineId) ??
      null
  );

  /**
   * Rename was chosen: the title's field opens once the menu has let go of
   * focus (its close would hand focus back to the row and blur the field).
   * A question asked under the row keeps the focus it took, as the field
   * does.
   */
  let renameAsked = false;
  function closeFocus(event: Event): void {
    if (renameAsked) {
      renameAsked = false;
      event.preventDefault();
      onrename();
      return;
    }
    if (asker.pending?.at === instance.id) {
      event.preventDefault();
      return;
    }
    focusAfterMenu(event);
  }

  /**
   * The menu stays open, the item "Forking…", until the hub has made the
   * fork; then the page leaves for it. A refusal stays in the item.
   */
  async function fork() {
    if (!(forkable && machine)) {
      return;
    }
    const forked = await forkSession({
      machineId: machine.machineId,
      cwd: session?.cwd || instance.cwd,
      sessionId: forkable,
      harness: (session?.harness ??
        instance.harness ??
        "claude") as HarnessKind,
    });
    await goto(conversationHref(forked, cawco.instanceIndex));
  }

  /**
   * A start that failed before the harness named a conversation: there is no
   * transcript to delete and no process to discard, so this is the only way
   * its row leaves the board.
   */
  const neverStarted = $derived(
    !instance.sessionId &&
      instance.status !== "running" &&
      instance.status !== "starting" &&
      !heldByMove(instance.id)
  );

  /**
   * Asleep with a transcript: the conversation lives on its machine, and
   * deleting it there is how the session leaves — the hub drops the row once
   * the machine confirms.
   */
  const asleepWithTranscript = $derived(
    Boolean(instance.sessionId) &&
      instance.status !== "running" &&
      instance.status !== "starting"
  );

  async function askDeleteTranscript() {
    const sessionId = instance.sessionId as string;
    await asker.ask({
      at: instance.id,
      title: "Delete this transcript?",
      body: `“${sessionName(instance.id, {}, instance.cwd).label}” is removed from ${instance.cwd || "this machine"}, for good. Nothing else on the machine is touched.`,
      confirmLabel: "Delete transcript",
      destructive: true,
      pendingLabel: "Deleting…",
      run: () =>
        deleteTranscript(
          instance.machineId,
          sessionId,
          instance.cwd || undefined,
          (instance.harness ?? undefined) as HarnessKind | undefined
        ),
    });
  }

  /** The workspace whose damaged record keeps this session from running. */
  const damagedWorkspace = $derived(
    instance.damaged?.remedy === "archive"
      ? instance.damaged.workspaceId
      : undefined
  );

  /**
   * Reads what the clone holds that is nowhere else before asking. Held
   * work turns the question into Keep or Save and archive, which has its
   * machine write it to a carry before deleting anything. A read that fails
   * asks plainly: the hub reads again on archive and refuses in its own
   * words what it cannot read.
   */
  async function askArchiveWorkspace() {
    const workspaceId = damagedWorkspace as string;
    const where = machine ? machineLabel(machine.hostname) : "its machine";
    const held = await workspaceHeld(workspaceId).catch(() => undefined);
    if (held && !holdsNothing(held)) {
      await asker.ask({
        at: instance.id,
        title: "This workspace holds work that is nowhere else",
        body: [
          `Its clone ${held.path} on ${held.machine} holds ${held.holds}, ${held.size} in all.`,
          `Save and archive writes its unlanded commits, changes and stashes to a carry on ${held.machine} (in ~/.cawco/carries), then deletes the clone, its boundary and its records. Keep leaves it all where it is.`,
        ],
        cancelLabel: "Keep",
        confirmLabel: "Save and archive",
        destructive: true,
        pendingLabel: "Saving…",
        run: () => archiveWorkspace(workspaceId, { discard: true }),
      });
      return;
    }
    await asker.ask({
      at: instance.id,
      title: "Archive this workspace?",
      body: `Its record ${instance.damaged?.file ?? ""} is damaged, so it cannot run. Archiving deletes its clone, its boundary and its records on ${where}, for good. Every other workspace runs as before.`,
      confirmLabel: "Archive workspace",
      destructive: true,
      pendingLabel: "Archiving…",
      run: () => archiveWorkspace(workspaceId),
    });
  }

  async function askRemove() {
    await asker.ask({
      at: instance.id,
      title: "Remove this session?",
      body: "It never started, so there is no transcript to lose.",
      confirmLabel: "Remove session",
      destructive: true,
      pendingLabel: "Removing…",
      run: () => removeSession(instance.id),
    });
  }

  /**
   * A spin-off may or may not have a worktree of its own (`scratch.worktree`
   * at its spawn): its machine reads what that worktree holds that is
   * nowhere else, and the question names it and that a discard keeps it as
   * a carry. A read that fails, or no worktree, asks in words naming what
   * the spawn made, whichever it was; the machine saves a carry either way.
   */
  async function askDiscard() {
    const held = await machineControl<SpinOffHeld | null>(
      instance.machineId,
      CONTROL_SPIN_OFF_HELD,
      [instance.id]
    ).catch(() => null);
    const where = machine ? machineLabel(machine.hostname) : "its machine";
    await asker.ask({
      at: instance.id,
      title: "Discard this spin-off?",
      body:
        held && (held.ahead > 0 || held.dirty > 0)
          ? [
              `Its worktree ${held.path} holds work that is nowhere else: ${held.holds}.`,
              `The session stops and the worktree and transcript go. That work is saved first, as a carry on ${where} (in ~/.cawco/carries).`,
            ]
          : "The session stops, and whatever the spawn created for it — its worktree, its transcript — goes with it, for good.",
      confirmLabel: "Discard spin-off",
      destructive: true,
      pendingLabel: "Discarding…",
      run: () => discardSession(instance.id, instance.machineId),
    });
  }
</script>

<!-- Built on the row's first hover or focus (ContextMenu.Lazy): a list
     draws a row per session, and the menu was half of each. -->
<ContextMenu.Lazy>
  {#snippet trigger(props)}
    {@render children(props)}
  {/snippet}

  <ContextMenu.Content onCloseAutoFocus={closeFocus}>
    <ContextMenu.Item onSelect={() => goto(href)}>
      <IconExternal />
      <span>Open</span>
    </ContextMenu.Item>
    {#if canOpenBeside(instance.id)}
      <ContextMenu.Item onSelect={() => openBeside(instance.id)}>
        <IconColumns />
        <span>Open in split view</span>
      </ContextMenu.Item>
    {/if}
    <ContextMenu.PendingItem
      disabled={!(forkable && machine)}
      icon={IconFork}
      label="Fork"
      pendingLabel="Forking…"
      run={fork}
    />
    <ContextMenu.Item
      onSelect={() =>
        continueInNewSession({
          instanceId: instance.id,
          machineId: instance.machineId,
          cwd: instance.cwd,
          harness: (instance.harness ?? "claude") as HarnessKind,
          model: instance.model ?? undefined,
          title: sessionName(instance.id, {}, instance.cwd).label,
        })}
    >
      <IconArrowRight />
      <span>Continue in new session…</span>
    </ContextMenu.Item>
    <AccountSubmenu {instance} />
    {#if running}
      <ContextMenu.Item
        onSelect={() => stopOnRow(instance.id, instance.machineId)}
      >
        <IconStop />
        <span>{midTurn ? "Stop mid-turn" : "Stop"}</span>
      </ContextMenu.Item>
    {/if}
    {#if onarchive}
      <ContextMenu.Item onSelect={onarchive}>
        <IconArchive />
        <span>Archive</span>
      </ContextMenu.Item>
    {:else if archivedRow(instance)}
      <ContextMenu.Item onSelect={() => unarchive([instance])}>
        <IconUnarchive />
        <span>Unarchive</span>
      </ContextMenu.Item>
    {:else if endedUnseen(instance) && home.archivable(instance)}
      <!-- Ended and listed in Finished, wherever this row is drawn. -->
      <ContextMenu.Item onSelect={() => archive(home.treeOf(instance.id))}>
        <IconArchive />
        <span>Archive</span>
      </ContextMenu.Item>
    {/if}
    <ContextMenu.Item
      onSelect={() => {
        renameAsked = true;
      }}
    >
      <IconPenLine />
      <span>Rename</span>
    </ContextMenu.Item>

    {#if asleepWithTranscript}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={askDeleteTranscript} variant="destructive">
        <IconTrash />
        <span>Delete transcript</span>
      </ContextMenu.Item>
    {/if}

    {#if damagedWorkspace}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={askArchiveWorkspace} variant="destructive">
        <IconArchive />
        <span>Archive workspace</span>
      </ContextMenu.Item>
    {/if}

    {#if neverStarted}
      <ContextMenu.Separator />
      <ContextMenu.Item onSelect={askRemove} variant="destructive">
        <IconTrash />
        <span>Remove session</span>
      </ContextMenu.Item>
    {/if}

    {#if scratch}
      <ContextMenu.Separator />
      <ContextMenu.PendingItem
        icon={IconCheck}
        label="Keep"
        pendingLabel="Keeping…"
        run={() => keepSession(instance.id)}
      />
      <ContextMenu.Item onSelect={askDiscard} variant="destructive">
        <IconTrash />
        <span>Discard</span>
      </ContextMenu.Item>
    {/if}

    <ContextMenu.Separator />

    <ContextMenu.CopyItem
      disabled={!instance.cwd}
      text={instance.cwd}
      what="Path"
    >
      Copy path
    </ContextMenu.CopyItem>
    <ContextMenu.CopyItem text={instance.id} what="Session id">
      Copy id
    </ContextMenu.CopyItem>
  </ContextMenu.Content>
</ContextMenu.Lazy>
