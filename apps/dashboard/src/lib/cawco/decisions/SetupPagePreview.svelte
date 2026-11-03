<script lang="ts">
  import type { ChoiceEntry } from "@cawco/core/choices";
  import { decisionCardOf } from "#lib/cawco/decisions/host/card-fault.js";
  import { DECISION_LIBRARY } from "#lib/cawco/decisions/host/library.js";
  import {
    type Bridge,
    bridge,
    picks,
  } from "#lib/cawco/decisions/host/page.svelte.js";
  import { stillCaw } from "#lib/cawco/decisions/host/StillCaw.svelte";
  /**
   * A project's setup page as the decision host draws it (the decision
   * library's `Setup`): the PR team's program as the project-setup skill
   * has Caw write it, on the host's own components and renderer, with no
   * hub. The page's bridge is the preview's own when it has one (each
   * change kept on the preview), else a stand-in that keeps it in memory.
   */
  import OpenUiRenderer from "#lib/cawco/views/openui/OpenUiRenderer.svelte";

  const PROGRAM = `root = Decisions("Your PR team", [setup])
setup = Setup("Your PR team", "A personal PR team: the job search, visa applications and renewals, travel booked around them, and a public voice. Research and drafts are done by delegates; every message, post and application goes out only once you send it.", [inbox, researching, drafted, call, sent, waiting, done, dropped], [researcher, writer], "own")
inbox = Stage("Inbox", "todo", "inbox", "cyan")
researching = Stage("Researching", "active", "search", "cyan", {runs: "researcher"}, "Runs the researcher")
drafted = Stage("Drafted", "active", "pen", "amber", {runs: "writer"}, "Runs the writer")
call = Stage("Your call", "you")
sent = Stage("Sent", "waiting", "send", "orange")
waiting = Stage("Waiting on reply", "waiting", "hourglass", "orange", {after: "7d"}, "Moves on after 7 days")
done = Stage("Done", "done", "done", "green")
dropped = Stage("Dropped", "dropped", "trash")
researcher = Delegate("researcher", "Researcher", "Finds roles, visa rules and travel options on the web, with sources.", "Claude Code · Sonnet")
writer = Delegate("writer", "Writer", "Drafts applications, cover letters, posts and replies in your voice.", "Claude Code · Opus")`;

  // The page's bridge: a preview's overlay brings its own (frozen on
  // `window`, keeping each change on the preview's artifact), followed here
  // as the host follows it (host.ts); with none, a stand-in keeps each
  // change in memory and hands it back as picks.
  const found = bridge();
  if (found) {
    found.on("picks", (next) => {
      picks.now = next;
    });
  } else {
    const kept: Record<string, ChoiceEntry> = {};
    (window as unknown as { cawco: Bridge }).cawco = {
      choose: () => Promise.resolve(),
      note: () => Promise.resolve(),
      on: () => () => undefined,
      send: () => Promise.resolve(),
      set: (key, value) => {
        kept[key] = {
          options: [],
          note: null,
          value,
          pageHash: "bench",
          at: new Date().toISOString(),
        } as ChoiceEntry;
        picks.now = { ...kept };
        return Promise.resolve();
      },
    } as Bridge;
  }
</script>

<OpenUiRenderer
  caw={stillCaw}
  cardOf={decisionCardOf}
  label="setup page bench"
  library={DECISION_LIBRARY}
  response={PROGRAM}
/>
