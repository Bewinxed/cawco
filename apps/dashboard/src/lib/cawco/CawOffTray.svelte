<script lang="ts" module>
  import type { CawRunning, CawView } from "@cawco/core";

  /** Turning a project's Caw off while what he started still runs. */
  export interface CawOffAsk {
    projectId: string;
    projectName: string;
    /** What he started that still runs, as his view listed it just now. */
    running: CawRunning[];
    /** The hub's view once he is off: the page's Caw takes it. */
    settled: (view: CawView) => void;
  }
</script>

<script lang="ts">
  /**
   * Turning Caw off while sessions he started still run (The Stay In
   * Context Rule): the same decision as forgetting a project with sessions
   * running, so the same tray (StopTray), standing in his panel under the
   * switch that asked (The Open Page Rule). Each thing he started is named
   * before you choose: his attempts and delegates, nested as the rail nests
   * them, and his own turn when an event started it. You choose here:
   * - "Let them finish": he is off, and they run to their end (the hub
   *   marks his own work kept: carried past an account's limit, its end
   *   noted in his thread without waking him). The tray closes; his panel
   *   says what still finishes.
   * - "Stop 3 and turn Caw off", then "Stop 3 mid-turn and turn Caw off":
   *   he is off at once and each row reads Stopped as its machine ends it
   *   (`project.stop`), his own turn when the idle after its cut comes; an
   *   away machine's row stops when it is back; a failure stays to be read,
   *   and Try again stops what is left.
   */
  import { configureCaw, stopProjectSessions } from "./client.svelte";
  import CawFace from "./home/CawFace.svelte";
  import StopTray, { type StopWords } from "./StopTray.svelte";

  let {
    ask,
    class: className,
    onclose,
  }: {
    ask: CawOffAsk;
    class?: string;
    /** The tray has left: the panel lets the ask go. */
    onclose: () => void;
  } = $props();

  /** He was turned off by the first stop: a retry stops the rows left, as a forget's does. */
  let off = false;

  const plural = (count: number, one: string, many: string) =>
    count === 1 ? one : many;
  /** How many he started that still run: the other way out says "it" or "them". */
  const listed = $derived(ask.running.length);

  const words = $derived.by((): StopWords => ({
    title: `Turn Caw off for ${ask.projectName || "this project"}?`,
    plain: "Turn off",
    stop: (count) => `Stop ${count} and turn Caw off`,
    armed: (count) => `Stop ${count} mid-turn and turn Caw off`,
    ending: "Turning Caw off…",
    ended: "Caw is off",
    partway: (stopped, total) => `Stopped ${stopped} of ${total}; Caw is off.`,
    line: (phase, count, done) => {
      switch (phase) {
        case "list":
          return `He started ${count} ${plural(count, "thing that is", "things that are")} still running. Let ${plural(count, "it", "them")} finish, or stop ${plural(count, "it", "them")} now.`;
        case "armed":
        case "stopping":
          return "Stopping cuts their turns short. Transcripts stay on disk.";
        case "fail":
          return "Caw is off. What couldn't be stopped still runs.";
        default:
          return `${done} Caw is off.`;
      }
    },
  }));

  /** A row as the tray names it: what it is, and its session. */
  function viewOf(id: string) {
    const one = ask.running.find((each) => each.id === id);
    if (!one) {
      return {};
    }
    if (one.kind === "turn") {
      return { title: `Caw · ${one.title ?? "his turn"}` };
    }
    const href = `/session/${encodeURIComponent(one.id)}`;
    if (one.kind === "attempt" && one.taskId) {
      return { href, title: `${one.taskId} · ${one.title ?? "attempt"}` };
    }
    return one.title ? { href, title: one.title } : { href };
  }

  /**
   * The first stop turns him off with `stop`: the hub stops what he started
   * through the forget's stop path and cuts his own turn. Rows its answer no
   * longer lists had already ended. A retry stops the rows left.
   */
  async function stop(ids: string[]): Promise<string[]> {
    const asked = ask;
    if (off) {
      await stopProjectSessions(
        asked.projectId,
        ids.filter((id) =>
          asked.running.some((one) => one.id === id && one.kind !== "turn")
        )
      );
      return [];
    }
    const view = await configureCaw(asked.projectId, {
      on: false,
      initiated: "stop",
    });
    off = true;
    asked.settled(view);
    const still = new Set(view.running.map((one) => one.id));
    return ids.filter((id) => !still.has(id));
  }

  async function letFinish(): Promise<void> {
    const asked = ask;
    asked.settled(
      await configureCaw(asked.projectId, { on: false, initiated: "finish" })
    );
  }
</script>

{#snippet face()}
  <CawFace size={36} status="ready" />
{/snippet}

<StopTray
  class={className}
  end={() => Promise.resolve()}
  head={face}
  onclose={() => {
    off = false;
    onclose();
  }}
  other={{
    label: `Let ${plural(listed, "it", "them")} finish`,
    run: letFinish,
  }}
  projectId={ask.projectId}
  sessions={ask.running}
  {stop}
  view={(session) => viewOf(session.id)}
  {words}
/>
