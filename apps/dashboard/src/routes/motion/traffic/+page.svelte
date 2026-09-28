<script lang="ts">
  /**
   * ARRIVAL TRAFFIC BENCH — the real transcript, fed on a schedule.
   *
   * Row-arrival motion can only be judged while rows are ARRIVING, and until
   * now the only way to get that was to run an agent and watch: three
   * near-identical 36-call passes through a model session, minutes each, to
   * observe six seconds of animation. The traffic is the only part of an agent
   * that this work needs, and traffic does not require a model.
   *
   * So this route mounts `Transcript` itself — not a copy of it, not a mock of
   * its rows — against a `blankSession` it drives directly. Everything the
   * arrival logic reads is real: the fold in `rows.ts`, the virtualizer, and
   * the transcript's arrival ledger (`transcript/arrivals.svelte.ts`: a row
   * animates only when its id is new to a watched view and it came in on the
   * live stream). Only the sender is synthetic.
   *
   * It is driven from `window.__traffic`, so a script can sequence a scenario
   * and record what Chrome actually animated. The controls below are the same
   * primitives for driving it by hand.
   *
   * WHY A ROUTE AND NOT A FIXTURE: the defect this was built for — a run of
   * tool calls animating only its first call — lived in the seam between the
   * row fold and the arrival decision. A fixture that stubbed either would have
   * rendered the bug invisible.
   */
  import { blankSession, type SessionState } from "$lib/whiffle/client.svelte";
  import Transcript from "$lib/whiffle/transcript/Transcript.svelte";
  import type { Message } from "$lib/whiffle/types";

  const INSTANCE = "traffic-bench";

  let session = $state<SessionState>(blankSession(INSTANCE));
  let landed = $state(false);
  /** Which mount is on screen. Bumped by `reset` to remount the transcript. */
  let generation = $state(0);
  /** Monotonic for the life of the page — ids must never repeat across
      scenarios, because a transcript rejects a row whose key it has seen. */
  let n = 0;

  const now = (): Date => new Date();

  function push(m: Omit<Message, "instanceId">): void {
    session.messages.push({ instanceId: INSTANCE, ...m } as Message);
  }

  /** One completed tool call. Consecutive ones fold into a single row. */
  function tool(name: string, arg: string): void {
    n += 1;
    push({
      id: `tool-${n}`,
      toolCallId: `call-${n}`,
      type: "tool.use",
      content: "",
      timestamp: now(),
      metadata: {
        toolName: name,
        toolInput: { file_path: arg, pattern: arg },
        toolResult: "ok",
        toolStatus: "success",
      },
    });
  }

  function assistant(text: string): void {
    n += 1;
    push({
      id: `asst-${n}`,
      type: "assistant",
      content: text,
      timestamp: now(),
    });
  }

  function note(text: string): void {
    n += 1;
    push({
      id: `note-${n}`,
      type: "system.task",
      content: text,
      timestamp: now(),
    });
  }

  /** The live tool glance — the row that shows a call still in flight. */
  function glance(name: string, text: string | null): void {
    n += 1;
    session.currentTool = text
      ? { name, glance: text, toolId: `live-${n}` }
      : null;
    session.busy = !!text;
  }

  /** The live reasoning block: open it with text, close it with null. */
  function thinking(text: string | null): void {
    if (text === null) {
      session.openBlock = null;
      session.thinkingStream = "";
      session.busy = false;
      return;
    }
    session.openBlock = "thinking";
    session.thinkingStream = text;
    session.busy = true;
  }

  function streaming(text: string): void {
    session.streaming = text;
    session.busy = !!text;
  }

  /** Seed history, so the bench starts where a real session starts: landed. */
  function seed(count: number): void {
    for (let i = 0; i < count; i += 1) {
      if (i % 3 === 0) {
        assistant(
          `Seeded turn ${i + 1}. This is history and must never animate.`
        );
      } else {
        tool("Read", `seed/file-${i}.ts`);
      }
    }
  }

  /**
   * A fresh transcript, optionally with history already in it.
   *
   * The remount is the point. `Transcript` keeps the answers it has given —
   * which rows it has seen, when it landed — for the life of the component,
   * deliberately, so that a virtualizer recycling a row cannot make it arrive
   * twice. A bench that reused one component would therefore have every
   * scenario after the first judged against the previous one's memory. Keying
   * the mount is what makes each scenario a page load.
   *
   * History is seeded BEFORE the mount for the same reason: a real transcript
   * has its history in hand when it lands, and pushing it in afterwards is an
   * append — a different thing entirely, and one that should animate.
   */
  function reset(seedCount = 0): void {
    session = blankSession(INSTANCE);
    if (seedCount > 0) {
      seed(seedCount);
    }
    landed = false;
    generation += 1;
  }

  const TOOLS: [string, string][] = [
    ["Read", "apps/dashboard/package.json"],
    ["Bash", "ls apps/dashboard/src/lib"],
    ["Grep", "reserve"],
    ["Read", "apps/dashboard/svelte.config.js"],
    ["Bash", "wc -l Transcript.svelte"],
    ["Grep", "cascade"],
  ];

  /** A run of `count` calls, one every `gapMs` — the shape that broke. */
  /** Calls have to land one at a time for a run to fold the way a real one does. */
  async function run(count: number, gapMs: number): Promise<void> {
    for (let i = 0; i < count; i += 1) {
      const [name, arg] = TOOLS[i % TOOLS.length];
      tool(name, `${arg}#${n}`);
      // biome-ignore lint/performance/noAwaitInLoops: the spacing IS the scenario.
      await new Promise((r) => setTimeout(r, gapMs));
    }
  }

  $effect(() => {
    // The driver's whole surface. Everything a scenario needs and nothing that
    // reaches around the component under test.
    (window as unknown as Record<string, unknown>).__traffic = {
      seed,
      reset,
      tool,
      assistant,
      note,
      glance,
      thinking,
      streaming,
      run,
      landed: () => landed,
      rows: () => session.messages.length,
      patch: (next: Partial<SessionState>) => Object.assign(session, next),
      user: (content: string) => {
        n += 1;
        push({ id: `user-${n}`, type: "user", content, timestamp: now() });
        session.busy = true;
      },
    };
  });
</script>

<div class="bench">
  <header>
    <h1>Arrival traffic</h1>
    <p>
      The real transcript, driven without a model. Sequence it from
      <code>window.__traffic</code>, or use these.
    </p>
    <div class="controls">
      <button onclick={() => reset(14)} type="button">load history</button>
      <button onclick={() => run(6, 900)} type="button">6 tools @900ms</button>
      <button onclick={() => run(6, 120)} type="button">6 tools @120ms</button>
      <button onclick={() => assistant('A settled turn.')} type="button">
        assistant
      </button>
      <button onclick={() => note('task done')} type="button">note</button>
      <button onclick={() => reset(0)} type="button">reset</button>
      <span class="count">{session.messages.length} messages</span>
    </div>
  </header>

  <div class="pane">
    {#key generation}
      <Transcript
        agentName="Traffic"
        focused
        onlanded={() => {
        landed = true;
      }}
        {session}
        visible
      />
    {/key}
  </div>
</div>

<style>
  .bench {
    display: flex;
    flex-direction: column;
    height: 100dvh;
    background: var(--surface-recess);
  }
  header {
    padding: var(--space-4) var(--space-5);
    border-bottom: 1px solid var(--border-hairline);
  }
  h1 {
    font-size: var(--text-title);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
  }
  header p {
    margin-top: var(--space-1);
    font-size: var(--text-body);
    font-weight: var(--weight-body);
    color: var(--ink-muted);
  }
  code {
    font-family: var(--font-mono);
  }
  .controls {
    display: flex;
    flex-wrap: wrap;
    align-items: center;
    gap: var(--space-2);
    margin-top: var(--space-3);
  }
  button {
    border-radius: var(--radius-xs);
    border: 1px solid var(--border-hairline);
    background: transparent;
    padding: var(--space-1) var(--space-2);
    font-size: var(--text-label);
    font-weight: var(--weight-strong);
    color: var(--ink-strong);
    cursor: pointer;
  }
  button:hover {
    background: var(--surface-hover);
  }
  .count {
    font-size: var(--text-meta);
    color: var(--ink-muted);
    font-variant-numeric: tabular-nums;
  }
  /* A bounded scroller: scroll position decides whether the transcript
     follows the tail, and a transcript that cannot scroll cannot reproduce
     what the operator sees. */
  .pane {
    flex: 1 1 auto;
    min-height: 0;
    display: flex;
    flex-direction: column;
  }
</style>
