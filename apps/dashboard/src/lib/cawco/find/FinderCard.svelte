<script lang="ts" module>
  import { FinderState } from "./finder-state.svelte";

  /**
   * The dashboard's one finder: what was typed is there again when it opens
   * again, as the glass's card is shut and opened.
   */
  const finder = new FinderState();
</script>

<script lang="ts">
  /**
   * Find in the glass's card (GlassCard's Jump face; ⌘K through the shell's
   * shortcuts, shell-shortcut.ts): the finder's contents, hung where the
   * Jump palette hung, opening what it finds where the dashboard opens it.
   *
   * - A session or a stored session: its conversation; a thread: its tab. At
   *   a moment, `?at=<docId>` with the engine's own record id (a transcript
   *   record's uuid, an opencode message id, a thread message's id), which
   *   the transcript scrolls to and marks.
   * - A task: its project with its sheet open (`?task=`); a routine: open
   *   in its project's Routines tab (a fleet routine has none, and ↵
   *   stays); a project: its page.
   * - A machine: the machines, opened onto it (bar-glass `showMachine`);
   *   "Start a session here" opens the new-session dialog on it;
   *   "See what runs here" asks the finder for its name, which every session
   *   on it answers to.
   * - An artifact or a decision: brought to the front of its session's panel,
   *   then its session; a commit or a file: the session that made it.
   */
  import { onMount } from "svelte";
  import { goto } from "$app/navigation";
  import { showArtifact } from "../artifact-api";
  import { barGlass } from "../bar-glass.svelte";
  import { cawco } from "../client.svelte";
  import { conversationHref } from "../links";
  import { routineHref, threadHref } from "../thread-tabs";
  import Finder from "./Finder.svelte";
  import type { FindMoment, FindResult, WaitingItem } from "./find-client";
  import type { MachineAct, Opening } from "./finder-state.svelte";

  let { phone = false, onclose }: { phone?: boolean; onclose: () => void } =
    $props();

  onMount(() => {
    finder.open();
    return () => finder.close();
  });

  const at = (href: string, moment: FindMoment | null) =>
    moment ? `${href}?at=${encodeURIComponent(moment.docId)}` : href;

  const sessionHref = (id: string, machineId?: string) =>
    conversationHref(
      id,
      cawco.instanceIndex,
      machineId ? { machineId } : undefined
    );

  const taskHref = (projectId: string, taskId: string) =>
    `/project/${encodeURIComponent(projectId)}?task=${encodeURIComponent(taskId)}`;

  /** Where a result opens; null when it has nowhere to yet. */
  async function hrefOf(
    result: FindResult,
    moment: FindMoment | null
  ): Promise<string | null> {
    switch (result.kind) {
      case "conversation":
        return at(
          sessionHref(
            result.instanceId ?? result.sessionId ?? result.id,
            result.machine.id
          ),
          moment
        );
      case "thread":
        return at(threadHref(result.id), moment);
      case "task":
        return result.project
          ? taskHref(result.project.id, result.taskId)
          : null;
      case "routine":
        return routineHref({
          id: result.id,
          projectId: result.project?.id ?? null,
        });
      case "project":
        return `/project/${encodeURIComponent(result.id)}`;
      case "artifact":
      case "decision":
        await showArtifact(result.conversation.id, result.id);
        return sessionHref(result.conversation.id);
      case "commit":
      case "file":
        return sessionHref(result.conversation.id);
      case "machine":
        break;
    }
    return null;
  }

  async function go(href: string | null) {
    if (href === null) {
      return;
    }
    onclose();
    await goto(href);
  }

  async function opened({ result, moment }: Opening) {
    if (result.kind === "machine") {
      // The machines, opened onto this one, where "Check machines" opens
      // them: the glass's card swaps Jump for them (the phone's sidebar, on
      // a phone; Shell).
      barGlass.showMachine(result.id);
      return;
    }
    await go(await hrefOf(result, moment));
  }

  async function openedWaiting(item: WaitingItem) {
    switch (item.kind) {
      case "artifact":
      case "decision":
        if (item.conversation) {
          await showArtifact(item.conversation.id, item.id);
          await go(sessionHref(item.conversation.id));
        }
        return;
      case "report":
        await go(item.conversation ? sessionHref(item.conversation.id) : null);
        return;
      case "task": {
        const taskId = item.id.slice(item.id.indexOf(":") + 1);
        await go(item.project ? taskHref(item.project.id, taskId) : null);
        return;
      }
      default:
    }
  }

  async function machine(result: FindResult, act: MachineAct) {
    if (act === "start") {
      await go(`/session?spawn=${encodeURIComponent(result.id)}`);
      return;
    }
    finder.text = `${result.title} `;
    finder.chosen = null;
    finder.peeked = null;
    finder.unfolded.clear();
    finder.ask();
  }
</script>

<!-- The glass's Jump face is `c-find-w` wide, right-aligned under the bar,
     its foot clear of the screen's (HangCard's `jump` frame). On a phone it
     is the sheet the wireframe draws, always its full height, and the finder
     fills it: the field stays at its foot over the keyboard and the best
     match nearest it however many rows the words leave. -->
<Finder
  class="max-[900px]:flex-1"
  {finder}
  {onclose}
  onmachine={machine}
  onopen={opened}
  onopenwaiting={openedWaiting}
  {phone}
/>
