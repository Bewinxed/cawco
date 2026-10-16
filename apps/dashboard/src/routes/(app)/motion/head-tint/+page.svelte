<script lang="ts">
  /**
   * The transcript's head under the chosen tab, on a bench: the real
   * PaneTabs over the real SessionPanes, one per tab as a group holds them
   * (PaneLeaf: every pane mounted, only the chosen one shown), each over a
   * real Transcript long enough to scroll. The sessions are fed through the
   * client's own state with no hub: four sessions in mixed statuses (needs
   * you, working, idle, working), their histories read back and in hand, so
   * no pane asks the hub for anything.
   *
   * Scroll a transcript and its rows go out of focus under the strip and
   * dissolve into the chosen tab's sheet (HeadFade); at the top there is
   * nothing under the strip and the band is clear.
   *
   * `?theme=` light | dark; `?at=` the index of the tab chosen first (1).
   * `window.__ht.choose(id)` chooses a tab as a click does; `ids` and
   * `chosen()` say the rest: what scripts/probe-kit/specs/web/head-tint.ts
   * drives.
   *
   * A click on a tab chooses it here, in the bench's own group; the strip's
   * own choice goes to the workspace, which holds no such group and would
   * navigate to the session.
   */
  import type { SessionPulse } from "@cawco/core";
  import { onMount, untrack } from "svelte";
  import { blankSession } from "#lib/cawco/client.svelte.js";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import type { Message } from "#lib/cawco/types.js";
  import PaneTabs from "#lib/cawco/workspace/PaneTabs.svelte";
  import type { LeafNode } from "#lib/cawco/workspace/workspace.svelte.js";
  import { theme } from "#lib/theme.svelte.js";
  import { page } from "$app/state";

  const ids = [
    "1a2b3c4d-0000-4000-8000-000000000001",
    "1a2b3c4d-0000-4000-8000-000000000002",
    "1a2b3c4d-0000-4000-8000-000000000003",
    "1a2b3c4d-0000-4000-8000-000000000004",
  ];
  /** What each session's pulse says: needs you, working, idle, working. */
  const DOING: Record<string, SessionPulse["activity"]> = {
    [ids[0]]: "blocked",
    [ids[1]]: "working",
    [ids[2]]: "idle",
    [ids[3]]: "working",
  };

  /** A conversation long enough to scroll: turns of ask, work and answer. */
  const TURNS: [string, [string, string][], string][] = [
    [
      "The tray chip overflows on narrow panes. Can you find where its width comes from?",
      [
        ["Grep", "tray-chip"],
        ["Read", "apps/dashboard/src/lib/cawco/tray/TrayChip.svelte"],
      ],
      "The chip takes its width from its label alone, and nothing caps it: a long project name pushes it past the pane's edge. The fix is a max width tied to the pane's container, with the label ending in an ellipsis.",
    ],
    [
      "Cap it at the pane, not the window.",
      [
        ["Read", "apps/dashboard/src/lib/cawco/workspace/PaneLeaf.svelte"],
        ["Edit", "apps/dashboard/src/lib/cawco/tray/TrayChip.svelte"],
      ],
      "Done. The chip now reads the leaf's container width, so a split pane 370px wide caps it at that pane, whatever the window is. The label truncates from its end and the count stays whole.",
    ],
    [
      "Does the count still line up with the other chips?",
      [["Bash", "bun run check"]],
      "It does: the count keeps its tabular figures, so a row of chips with counts of different widths still lines its numbers up. The check passes with no new warnings.",
    ],
    [
      "What happens when the label is a single long word?",
      [
        ["Read", "apps/dashboard/src/app.css"],
        ["Edit", "apps/dashboard/src/lib/cawco/tray/TrayChip.svelte"],
      ],
      "A single long word had nowhere to break, so the ellipsis never came. The label now sets overflow-wrap to anywhere under the cap, and the ellipsis lands on the last character that fits.",
    ],
    [
      "Show me the narrowest case.",
      [["Bash", "bun scripts/shot.mjs --width 320"]],
      "At 320px the chip holds its glyph, four characters and the ellipsis, then the count. Nothing reaches the pane's edge, and the chip's hit area stays 44px tall under a finger.",
    ],
    [
      "Good. And on the phone's row?",
      [
        ["Read", "apps/dashboard/src/lib/cawco/Shell.svelte"],
        ["Grep", "c-bar-phone-gap"],
      ],
      "The phone's row hosts the same chip; the bar's own padding already clears the toggle and Caw's glass, so the cap there is the bar's width less both. It truncates the same way.",
    ],
    [
      "Commit it on the branch.",
      [["Bash", "git commit -am 'Tray chip: capped at its pane'"]],
      "Committed on the branch: the chip is capped at its pane, its label truncates at the cap, and a single long word breaks at the last character that fits.",
    ],
  ];

  /** One session's history, read back: every turn in hand. */
  function history(id: string): Message[] {
    const at = new Date(Date.now() - 3_600_000).getTime();
    const rows: Message[] = [];
    let n = 0;
    const stamp = () => new Date(at + n * 20_000).toISOString();
    for (const [ask, tools, answer] of TURNS) {
      n += 1;
      rows.push({
        id: `${id}-user-${n}`,
        instanceId: id,
        type: "user",
        content: ask,
        timestamp: stamp(),
      } as Message);
      for (const [name, arg] of tools) {
        n += 1;
        rows.push({
          id: `${id}-tool-${n}`,
          instanceId: id,
          toolCallId: `${id}-call-${n}`,
          type: "tool.use",
          content: "",
          timestamp: stamp(),
          metadata: {
            toolName: name,
            toolInput: { file_path: arg, pattern: arg, command: arg },
            toolResult: "ok",
            toolStatus: "success",
          },
        } as Message);
      }
      n += 1;
      rows.push({
        id: `${id}-asst-${n}`,
        instanceId: id,
        type: "assistant",
        content: answer,
        timestamp: stamp(),
      } as Message);
    }
    return rows;
  }

  // The client's own state, as the hub's frames and reads would have set it:
  // the sessions' pulses and their histories, in hand (`initialized`), so a
  // pane opening one reads nothing (dev's `__cawcoDebug`, set when
  // client.svelte.ts loads, which this page imports ahead of this script).
  const debug = (
    globalThis as unknown as {
      __cawcoDebug: {
        state: {
          pulses: Record<string, SessionPulse>;
          sessions: Record<string, ReturnType<typeof blankSession>>;
        };
      };
    }
  ).__cawcoDebug;
  const now = Date.now();
  for (const id of ids) {
    const activity = DOING[id];
    debug.state.pulses[id] = {
      activity,
      at: now,
      busy: activity === "working",
      currentTool: null,
      instanceId: id,
      runningSubagents: 0,
    };
    const session = blankSession(id);
    session.machineId = "bench";
    session.cwd = "/bench";
    session.messages = history(id);
    session.initialized = true;
    debug.state.sessions[id] = session;
  }

  const first = untrack(() =>
    Math.min(
      ids.length - 1,
      Math.max(0, Number(page.url.searchParams.get("at") ?? 1) || 0)
    )
  );
  const leaf = $state<LeafNode>({
    id: "head-tint",
    t: "l",
    tabs: ids,
    active: ids[first],
  });

  const scheme = $derived(
    page.url.searchParams.get("theme") === "dark" ? "dark" : "light"
  );
  $effect(() => {
    theme.set(scheme);
  });

  /** Chooses a tab in the bench's group, as a click on it does. */
  function choose(id: string) {
    if (leaf.tabs.includes(id)) {
      leaf.active = id;
    }
  }

  /**
   * A click that would choose a tab (its link, its empty details slot) or
   * close one is the bench's: the strip's own would act on the workspace.
   * The chosen tab's own click (its details card) is left to the strip.
   */
  function benchClick(event: MouseEvent) {
    const target = event.target instanceof Element ? event.target : null;
    const tab = target?.closest<HTMLElement>(".tab");
    const id = tab
      ?.querySelector<HTMLElement>("[data-session-tab]")
      ?.getAttribute("data-session-tab");
    if (!(tab && id)) {
      return;
    }
    if (target?.closest(".tclose")) {
      event.preventDefault();
      event.stopPropagation();
      return;
    }
    if (id === leaf.active) {
      return;
    }
    event.preventDefault();
    event.stopPropagation();
    choose(id);
  }

  onMount(() => {
    Object.assign(window, {
      __ht: { ids, choose, chosen: () => leaf.active },
    });
    return () => {
      Reflect.deleteProperty(window, "__ht");
      for (const id of ids) {
        delete debug.state.pulses[id];
        delete debug.state.sessions[id];
      }
    };
  });
</script>

<svelte:head><title>Transcript head proof | CawCo</title></svelte:head>

<!-- Over the shell and anything it draws (a hub banner): one group, its
     strip on the shelf and its panes under it. -->
<!-- svelte-ignore a11y_click_events_have_key_events, a11y_no_static_element_interactions -->
<div class="proof" data-head-tint onclickcapture={benchClick}>
  <PaneTabs {leaf} />
  <div data-slot="stack" class="stack">
    {#each ids as id (id)}
      {@const shown = leaf.active === id}
      <div data-slot="slot" class="slot" data-pane={id} class:hidden={!shown}>
        <SessionPane
          active={shown}
          browsing={null}
          browsingCwd=""
          browsingHarness="claude"
          focused={shown}
          viewId={id}
          visible={shown}
        />
      </div>
    {/each}
  </div>
</div>

<style>
  /* A group as the workspace lays one out (PaneLeaf `.leaf`), over the
     whole window, a strip's room above it on the shelf. */
  .proof {
    position: fixed;
    inset: 0;
    z-index: 2147483000;
    container: leaf / inline-size;
    display: flex;
    flex-direction: column;
    padding-block-start: var(--space-7);
    background: var(--surface-shelf);
    color: var(--ink-strong);
  }
  /* What the strip opens (the session card, a tab's menu) is portalled to
     the body and stands over the bench. */
  :global(body:has([data-head-tint]) [data-bits-floating-content-wrapper]) {
    z-index: 2147483001 !important;
  }
  /* The group's panes (PaneLeaf `.stack`, `.pane`, `.pane-hidden`): every
     one laid out in the same box, only the chosen one drawn. */
  .stack {
    position: relative;
    display: flex;
    flex: 1 1 auto;
    min-block-size: 0;
    min-inline-size: 0;
    overflow: hidden;
    background: var(--surface-recess);
  }
  .slot {
    position: absolute;
    inset: 0;
    display: flex;
  }
  .slot.hidden {
    content-visibility: hidden;
    pointer-events: none;
  }
</style>
