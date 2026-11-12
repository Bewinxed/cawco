<script lang="ts" module>
  import type { Kind } from "@cawco/core/decides";
  import { kinds as seed } from "./records";

  /** The kinds he added beside the six built in: one short, one long. */
  export const addedKinds: Kind[] = [
    ...seed,
    {
      id: "data-and-migrations",
      name: "Data and migrations",
      example: "a schema change, a backfill, a data fix",
      builtIn: false,
      position: 6,
    },
    {
      id: "accessibility-and-keyboard-behaviour",
      name: "Accessibility and keyboard behaviour across every surface",
      example:
        "focus order, a screen reader's words, a shortcut, reduced motion, contrast in dark mode",
      builtIn: false,
      position: 7,
    },
  ];
</script>

<script lang="ts">
  /**
   * Who decides' head and roster with Kinds of choice open from the head's
   * button, on the real state (WhoDecides) holding the hub's records: the
   * five built-ins, Design reviewer and Release checker, the six built-in
   * kinds and two he added. The writes stay here: Add kind, Done and Remove
   * change what the page holds and nothing reaches the hub. The props set
   * the state it stands in.
   */
  import type { DecidesTable } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { untrack } from "svelte";
  import { HUB_UNREACHABLE } from "#lib/cawco/hub-read.js";
  import { WhoDecides } from "../decides.svelte";
  import { drawPopoversInPlace, holdsPanels } from "../in-place";
  import KindsOfChoice from "../KindsOfChoice.svelte";
  import { KIND_STEPS, KindAdd, type KindStep } from "../kinds.svelte";
  import WhoRoster from "../WhoRoster.svelte";
  import {
    added,
    addedFacts,
    fleetRoutes,
    project as projectName,
  } from "./records";
  import { harnesses, skills, types } from "./setup-records";

  let {
    project = projectName,
    open = true,
    failed = false,
    adding = null,
    renaming = null,
    refused = null,
    removing = null,
    moveTo = null,
  }: {
    /** The project's name; null on the fleet's page. */
    project?: string | null;
    /** Kinds of choice stands open. */
    open?: boolean;
    /** The fleet didn't load: the hub's words, and Retry. */
    failed?: boolean;
    /** A kind being added: how far its steps came, what was said, and whether Continue was pressed. */
    adding?: {
      reached: number;
      name?: string;
      example?: string;
      to?: string;
      tried?: boolean;
      open?: KindStep | null;
    } | null;
    /** A kind being renamed, and what its fields say. */
    renaming?: { kind: string; name?: string; example?: string } | null;
    /** The hub refused the rename: its words. */
    refused?: string | null;
    /** A kind being removed, with what waits under it and where. */
    removing?: { kind: string; count: number; projects: string[] } | null;
    /** The kind its choices go to, picked. */
    moveTo?: string | null;
  } = $props();

  drawPopoversInPlace();

  const members = added.slice(0, 7);
  const routes: Record<string, string> = {
    ...fleetRoutes,
    "data-and-migrations": "advisor",
    "accessibility-and-keyboard-behaviour": "design-reviewer",
  };

  const who = new WhoDecides(
    untrack(() => (project === null ? null : "cawco-dev"))
  );
  untrack(() => {
    const table: DecidesTable | null =
      project === null
        ? null
        : {
            routes,
            from: Object.fromEntries(
              addedKinds.map((kind) => [kind.id, "fleet" as const])
            ),
            problems: [],
            yours: [],
          };
    who.read = failed
      ? {
          state: "failed",
          reason: decidesWords.unread(HUB_UNREACHABLE),
        }
      : {
          state: "read",
          fleet: {
            members,
            kinds: addedKinds,
            routes,
            pictures: {},
            harnesses,
            skills,
            connections: { slack: false, email: false },
          },
          table,
          types,
        };
  });

  // The hub's writes, kept on the page.
  who.handTo = () => Promise.resolve(true);
  who.useFleet = () => Promise.resolve(true);
  who.addKind = () => {
    const add = who.kindAdd;
    if (add) {
      add.tried = true;
      const first = KIND_STEPS.find((step) => who.kindAddProblems(add)[step]);
      if (first) {
        add.open = first;
        add.shown += 1;
        return Promise.resolve();
      }
    }
    who.kindAdd = null;
    return Promise.resolve();
  };
  who.doneRename = () => {
    who.kindRename = null;
    return Promise.resolve();
  };
  who.askRemoveKind = (id) => {
    who.askRemoveWith(id, 0, []);
    return Promise.resolve();
  };
  who.removeKind = () => Promise.resolve();

  untrack(() => {
    who.kindAdd = null;
    if (adding) {
      const add = new KindAdd();
      add.name = adding.name ?? "";
      add.example = adding.example ?? "";
      add.to = adding.to ?? "you";
      add.reached = adding.reached;
      add.open =
        adding.open === undefined
          ? (KIND_STEPS[adding.reached] ?? null)
          : adding.open;
      add.tried = adding.tried ?? false;
      who.kindAdd = add;
    }
    if (renaming) {
      who.startRename(renaming.kind);
      if (who.kindRename) {
        who.kindRename.name = renaming.name ?? who.kindRename.name;
        who.kindRename.example = renaming.example ?? who.kindRename.example;
      }
    }
    if (refused && renaming) {
      who.kindFault = {
        kind: renaming.kind,
        reason: refused,
        again: () => Promise.resolve(),
      };
    }
    who.kindsOpen = open;
    if (removing) {
      who.askRemoveWith(removing.kind, removing.count, removing.projects);
      who.moveTo = moveTo;
    }
  });
</script>

<!-- Kinds of choice draws in place under its button, and the page grows
     to hold it whole: a frame is as tall as its page. -->
<div
  class="relative flex flex-col gap-space-5 bg-surface-page p-space-5 max-desk:p-space-4"
  {@attach holdsPanels}
>
  <div
    class="grid min-w-0 grid-cols-(--head-cols) items-start gap-x-space-5 gap-y-space-3 max-phone:grid-cols-1"
    style:--head-cols="minmax(0, 1fr) auto"
  >
    <h1 class="m-0 type-title text-balance text-ink-strong wrap-anywhere">
      {project === null
        ? decidesWords.detailsLabel
        : decidesWords.title(project)}
    </h1>
    <KindsOfChoice {who} />
  </div>
  {#if who.read.state === "read"}
    <WhoRoster
      facts={(member) => addedFacts[member.id] ?? null}
      {project}
      {who}
    />
  {/if}
</div>
