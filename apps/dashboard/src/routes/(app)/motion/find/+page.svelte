<script lang="ts" module>
  /** The address the bench last seeded its conversation and find for. */
  let seededFor: string | null = null;
</script>

<script lang="ts">
  /**
   * FIND IN A CONVERSATION, as built (dev bench): the real PaneTabs over
   * real SessionPanes, each over a real Transcript fed through the stores'
   * own state with no hub (head-tint's bench), the group's composer lent
   * as PaneLeaf lends it, and find's one record (find/conversation-find)
   * asked of a fixture in the hub's place. `?state=` draws find's states:
   *
   * - `finding`: Command-F has grown the composer its find field; the
   *   places rise out of the composer as its layer, the third, inside a
   *   folded Bash output, stepped to.
   * - `nothing`: words nothing in the conversation holds.
   * - `unreached`: the machine holding the transcript did not answer; the
   *   places in the turns loaded stand, the machine named, with Retry.
   * - `outdated`: its agent is older than the places read: the same, saying
   *   an update brings the rest, no Retry.
   * - `live`: a turn being written says the words: one more place, breathing.
   * - `closed`: find closed at the place found, its wash kept, and Back
   *   where you were in Jump to latest's place.
   *
   * `&in=caw`: the conversation in Caw's panel, docked beside the project
   * page, where the places are the composer's layer at every width.
   */
  import type {
    FindPlace,
    FindPlacesAnswer,
    PlacesHeard,
  } from "@cawco/core/find";
  import type { SessionPulse } from "@cawco/core/protocol";
  import { onMount, untrack } from "svelte";
  import {
    askPlacesWith,
    findIn,
  } from "#lib/cawco/find/conversation-find.svelte.js";
  import type { Read } from "#lib/cawco/find/find-client.js";
  import SessionPane from "#lib/cawco/SessionPane.svelte";
  import { blankSession } from "#lib/cawco/stores/sessions.svelte.js";
  import Composer from "#lib/cawco/transcript/Composer.svelte";
  import { ComposerDraft } from "#lib/cawco/transcript/composer-draft.svelte.js";
  import { composerFleet } from "#lib/cawco/transcript/composer-fleet.js";
  import {
    composerBindings,
    composerOf,
  } from "#lib/cawco/workspace/composer-dock.svelte.js";
  import PaneTabs from "#lib/cawco/workspace/PaneTabs.svelte";
  import type { LeafNode } from "#lib/cawco/workspace/workspace.svelte.js";
  import {
    BarFloat,
    BarGlass,
    BarItem,
  } from "#lib/components/ui/bar-glass/index.js";
  import {
    IconClose,
    IconListRowsLinear,
    IconMoveTabLinear,
    IconPlus,
  } from "#lib/icons.js";
  import { page } from "$app/state";
  import { benchClick, benchDebug, benchLeaf } from "../tab-bench";
  import {
    history,
    OTHER,
    recordOf,
    resultOf,
    SAID,
    whenOf,
    wordsOf,
  } from "./fixture";

  const STATES = [
    "finding",
    "nothing",
    "unreached",
    "outdated",
    "live",
    "closed",
  ] as const;
  type State = (typeof STATES)[number];
  const findState: State =
    STATES.find((one) => one === page.url.searchParams.get("state")) ??
    "finding";
  const inCaw = page.url.searchParams.get("in") === "caw";
  const WORDS = findState === "nothing" ? "ETIMEDOUT" : "ECONNRESET";
  /** How the machine took the places read, by the state drawn. */
  const HEARD: Record<State, PlacesHeard> = {
    finding: "answered",
    nothing: "answered",
    unreached: "silent",
    outdated: "outdated",
    live: "answered",
    closed: "answered",
  };

  const ids = [
    "f1d0c0de-0000-4000-8000-000000000001",
    "f1d0c0de-0000-4000-8000-000000000002",
    "f1d0c0de-0000-4000-8000-000000000003",
  ];
  const [, MAIN] = ids;
  const DOING: Record<string, SessionPulse["activity"]> = {
    [ids[0]]: "idle",
    [ids[1]]: findState === "live" ? "working" : "idle",
    [ids[2]]: "idle",
  };

  const debug = benchDebug();
  const now = Date.now();
  /**
   * The bench seeds its conversation and opens find once per address: the
   * shell mounts the page again now and then (it reads no hub), and a
   * second seeding undid what a reader had done on it.
   */
  const seeded = seededFor === page.url.search;
  seededFor = page.url.search;
  for (const id of seeded ? [] : ids) {
    const session = blankSession(id);
    session.machineId = "bench";
    session.cwd = "/home/bewinxed/cockpit";
    session.harness = "claude";
    session.messages = history(id, id === MAIN ? SAID : OTHER);
    session.initialized = true;
    debug.sessionsState.sessions[id] = session;
    debug.frame({
      kind: "pulse",
      instanceId: id,
      pulse: {
        activity: DOING[id],
        at: now,
        busy: DOING[id] === "working",
        currentTool: null,
        instanceId: id,
        runningSubagents: 0,
      },
    });
  }

  // The hub's place: every turn is loaded here, so the engine's answer adds
  // none; a machine that does not answer is obelisk, as a real one is named.
  askPlacesWith(async (): Promise<Read<FindPlacesAnswer>> => ({
    ok: true,
    value: {
      machine: {
        heard: HEARD[findState],
        id: "obelisk",
        name: "obelisk",
      },
      // What the engine answers for this conversation: every place, each
      // by its stored record; every one is loaded here, so each is the
      // transcript's own place.
      places: SAID.flatMap((s, n): FindPlace[] => {
        const text = wordsOf(s);
        const at = text.indexOf(WORDS);
        if (at < 0) {
          return [];
        }
        const WHOSE = {
          user: "me",
          assistant: "agent",
          thinking: "agent",
          tool: "tools",
          report: "delegates",
        } as const;
        return [
          {
            at: whenOf(s),
            docId: s.k === "tool" ? resultOf(MAIN, n) : recordOf(MAIN, n),
            excerpt: `${text.slice(Math.max(0, at - 40), at)}「${WORDS}」${text.slice(at + WORDS.length, at + WORDS.length + 40)}`,
            thinking: s.k === "thinking",
            whose: WHOSE[s.k],
          },
        ];
      }),
    },
  }));

  const leaf = $state<LeafNode>(untrack(() => benchLeaf("find", ids, "1")));
  const bound = $derived(composerBindings.get(MAIN));
  const draft = new ComposerDraft();
  draft.text = "Check the push probe next";

  const find = findIn(MAIN);
  window.__find = find;

  onMount(() => {
    // The frame reads no hub: the shell's hub band, which would say so over
    // the conversation, is put away while the bench stands.
    const band =
      document.querySelector<HTMLElement>("[data-hub-band-said]")
        ?.parentElement ?? null;
    band?.setAttribute("hidden", "");
    // The bar's own crumb ("Bench") stands where the bench draws its tabs.
    const crumb = document.querySelector<HTMLElement>('[data-slot="crumb"]');
    crumb?.setAttribute("hidden", "");
    if (seeded) {
      return () => {
        band?.removeAttribute("hidden");
        crumb?.removeAttribute("hidden");
      };
    }
    // A find another address left standing starts over.
    find.close();
    find.leave();
    find.whose = "all";
    if (findState === "live") {
      const session = debug.sessionsState.sessions[MAIN];
      session.busy = true;
      session.streaming =
        "The push probe passes on Wi-Fi. On the switch to cellular its socket closed with ECONNRESET as the phone left Wi-Fi, and the relay retried";
    }
    const lent = composerBindings.get(MAIN);
    if (lent) {
      lent.draft.text = "Check the push probe next";
    }
    // Command-F, as the person presses it, then the words and the third
    // place (a folded test run's output).
    const opening = setTimeout(() => {
      find.show();
      find.type(WORDS);
      setTimeout(() => {
        find.goTo(find.places[2]);
        if (findState === "closed") {
          setTimeout(() => find.close(), 900);
        }
      }, 400);
    }, 600);
    return () => {
      clearTimeout(opening);
      band?.removeAttribute("hidden");
      crumb?.removeAttribute("hidden");
    };
  });
</script>

<svelte:head>
  <title>Find in a conversation: {findState} | CawCo</title>
</svelte:head>

{#if inCaw}
  <!-- Caw's panel docked beside the project page (CawFloat's docked card),
       its bar floating over the conversation as ProjectConversation's does. -->
  <div
    class="absolute inset-0 flex justify-end bg-surface-shelf text-ink-strong"
  >
    <div
      class="relative flex min-h-0 w-c-panel-w m-space-6 flex-col overflow-hidden rounded-lg bg-surface-raised shadow-tile max-phone:m-0 max-phone:w-full max-phone:rounded-none"
    >
      <div
        class="relative flex h-full min-h-0 flex-auto flex-col"
        style:--bar-room="var(--spacing-c-top-bar-h)"
      >
        <BarFloat tint="bg-surface-recess">
          {#snippet trailing()}
            <BarGlass form="group">
              <BarItem icon={IconListRowsLinear} label="Session details" />
              <BarItem icon={IconPlus} label="New conversation" />
              <BarItem icon={IconMoveTabLinear} label="Open as a tab" />
            </BarGlass>
            <BarGlass form="group">
              <BarItem icon={IconClose} label="Hide Caw" />
            </BarGlass>
          {/snippet}
        </BarFloat>
        <div class="relative flex min-h-0 flex-auto flex-col">
          <SessionPane
            active
            browsing={null}
            browsingCwd=""
            browsingHarness={undefined}
            docked={{ draft, headRoom: "var(--spacing-c-top-bar-h)" }}
            focused
            viewId={MAIN}
            visible
          />
        </div>
      </div>
    </div>
  </div>
{:else}
  <div
    class="@container/leaf absolute inset-0 flex flex-col text-ink-strong"
    onclickcapture={benchClick(leaf)}
  >
    <div class="bg-surface-shelf">
      <PaneTabs {leaf} />
    </div>
    <div
      class="relative flex min-h-0 min-w-0 flex-auto overflow-hidden bg-surface-recess"
    >
      {#each ids as id (id)}
        {@const shown = leaf.active === id}
        <div
          class="absolute inset-0 flex data-hidden:pointer-events-none data-hidden:content-visibility-hidden"
          data-hidden={!shown || undefined}
        >
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
      {#if bound}
        <!-- The group's composer, over the transcript's share (PaneLeaf). -->
        <div
          class="pointer-events-none absolute inset-y-0 start-0 z-1 w-(--dock-w)"
          style:--dock-w="{bound.transcriptShare * 100}%"
        >
          <Composer
            fleet={composerFleet}
            {...composerOf(bound)}
            showing={MAIN}
            trayRows={[]}
          />
        </div>
      {/if}
    </div>
  </div>
{/if}
