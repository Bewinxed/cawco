<script lang="ts">
  /**
   * Fixture for ReferenceChips.stories.ts: one line of a reply's markdown as
   * a conversation draws it (MessageBody), its `cawco:` links drawn by the
   * dashboard's own registry (references.ts) over product-shaped records. The
   * hub's answers are held here: the names, tasks and plans its chips ask
   * for, and the artifacts and pins the panes would hold.
   */
  import type { ArtifactKind } from "@cawco/core/artifact-kinds";
  import type { Pin } from "@cawco/core/comments/model";
  import { holdArtifact, noteArtifact } from "./artifact-names.svelte";
  import MessageBody from "./MessageBody.svelte";
  import { provideMarkdownFleet } from "./markdown-fleet";
  import { liveMarkdown } from "./markdown-live";

  let { source }: { source: string } = $props();

  const TASK_PATH = /^\/api\/projects\/[^/]+\/tasks\/([^/]+)$/u;
  const PLAN_PATH = /^\/api\/instances\/[^/]+\/plan$/u;
  const SESSION = "f3a91c2e-7b40-4d1e-9a52-0c6e8d417b93";
  const LONG_SESSION = "9d2c61b8-35aa-4e07-b1f4-62e7a0c9d815";

  const conversation = (id: string, title: string, cwd: string) => ({
    kind: "conversation",
    id,
    instanceId: id,
    handle: `${cwd.split("/").pop()}#${id.slice(0, 8)}`,
    title,
    cwd,
    dir: cwd.split("/").pop(),
    harness: "claude",
    machine: { id: "obelisk", name: "obelisk-of-light" },
    project: null,
    children: { count: 0, needsYou: 0 },
    lastReport: null,
    moments: [],
    parent: null,
    matched: [],
    score: 1,
    lastActivity: null,
  });

  const SESSIONS = [
    conversation(SESSION, "Fix tray chip overflow", "/home/bewinxed/cockpit"),
    conversation(
      LONG_SESSION,
      "Move the sign-in for stored transcripts onto the hub so a machine that was offline when the session ended can still open its conversation",
      "/home/bewinxed/harbourline"
    ),
  ];

  const TASKS: Record<string, { title: string; stage: string }> = {
    "tsk-142": { title: "Tray chip overflow on a phone", stage: "todo" },
    "tsk-151": {
      title: "Sign-in move for stored transcripts",
      stage: "in-progress",
    },
    "tsk-97": { title: "Release health tiles", stage: "done" },
  };

  const PLAN = {
    source: "cawco",
    steps: [
      {
        id: "s1",
        content: "Read the chip's markup",
        depth: 0,
        status: "completed",
      },
      {
        id: "s2",
        content: "Draw every chip on the canvas at both widths",
        depth: 0,
        status: "in_progress",
      },
      { id: "s3", content: "Report what changed", depth: 0, status: "pending" },
    ],
  };

  const json = (value: unknown, status = 200): Response =>
    new Response(JSON.stringify(value), {
      status,
      headers: { "content-type": "application/json" },
    });

  const real = globalThis.fetch;
  globalThis.fetch = ((input: RequestInfo | URL, init?: RequestInit) => {
    const url = new URL(
      input instanceof Request ? input.url : String(input),
      location.href
    );
    const path = url.pathname;
    if (path === "/api/find") {
      return Promise.resolve(json({ results: SESSIONS }));
    }
    const task = path.match(TASK_PATH)?.[1];
    if (task) {
      const one = TASKS[task];
      return Promise.resolve(
        one
          ? json({
              ...one,
              id: task,
              description: "",
              todos: [],
              comments: [],
            })
          : json({ error: "No such task." }, 404)
      );
    }
    if (PLAN_PATH.test(path)) {
      return Promise.resolve(json(PLAN));
    }
    if (path.startsWith("/api/")) {
      return Promise.resolve(json({ error: "Not found." }, 404));
    }
    return real(input, init);
  }) as typeof fetch;

  const named = (title: string, kind: ArtifactKind) => ({
    instanceId: SESSION,
    kind,
    name: title.toLowerCase().replace(/\W+/gu, "-"),
    title,
  });
  noteArtifact("art-page", named("Release health", "page"));
  noteArtifact(
    "art-preview",
    named("Tray chip, as it draws on a phone", "preview")
  );
  noteArtifact(
    "art-canvas",
    named("Where the sign-in move touches the hub", "canvas")
  );
  noteArtifact("art-component", named("Reference chips", "component"));
  holdArtifact("art-page", {
    choices: {},
    pins: [
      {
        id: "pin-2",
        number: 2,
        kind: "comment",
        by: "person",
        at: "2026-11-12T09:14:00Z",
        anchor: { selector: "h1", source: null },
        elements: [],
        thread: [],
        title: "the heading's second line",
      } satisfies Pin,
    ],
  });

  provideMarkdownFleet(() => liveMarkdown);
</script>

<div class="ps-space-4 pe-space-4 pt-space-4 pb-space-4" data-slot="transcript">
  <MessageBody at="reference-line" {source} />
</div>
