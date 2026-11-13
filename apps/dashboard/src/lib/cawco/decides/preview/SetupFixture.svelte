<script lang="ts">
  /**
   * Who decides' roster with a member's settings or Add a member open from
   * its card, on the real state (WhoDecides) holding the hub's records. The
   * writes stay here: Save, a picture and Remove change what the page holds
   * and nothing reaches the hub. `open` names whose settings stand open;
   * the rest set the state they stand in.
   */
  import type { DecidesTable, Member } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { conversationWords } from "@cawco/core/words/project-conversation";
  import { untrack } from "svelte";
  import { HUB_UNREACHABLE } from "#lib/platform/hub-read.js";
  import { type RecordRead, WhoDecides } from "../decides.svelte";
  import type { FleetOffer } from "../decides-client";
  import { drawPopoversInPlace, holdsPanels } from "../in-place";
  import { type Draft, NEW, type RowId } from "../setup.svelte";
  import WhoRoster from "../WhoRoster.svelte";
  import { added, fleetRoutes, kinds, project as projectName } from "./records";
  import { harnesses, records, skills, types } from "./setup-records";

  let {
    members = added.slice(0, 7),
    routes = { ...fleetRoutes, look: "design-reviewer" },
    project = projectName,
    offers = harnesses,
    open = null,
    row = null,
    adding = false,
    reached = 0,
    draft = {},
    tried = false,
    picking = false,
    removing = false,
    parked = [],
    record = "read",
  }: {
    members?: Member[];
    routes?: Record<string, string>;
    /** The project's name; null on the fleet's page. */
    project?: string | null;
    offers?: FleetOffer["harnesses"];
    /** Whose settings stand open: a member's id, or "new" for Add a member. */
    open?: string | null;
    /** The row standing open in them. */
    row?: RowId | null;
    /** Add a member: an agent picked. */
    adding?: boolean;
    /** Add a member: the furthest step reached. */
    reached?: number;
    /** What the draft says over what the hub holds. */
    draft?: Partial<Draft>;
    /** Save or Continue was pressed. */
    tried?: boolean;
    picking?: boolean;
    /** Remove member was pressed: its question stands. */
    removing?: boolean;
    /** Members whose settings were closed before saving, with a change each. */
    parked?: string[];
    /** The open member's record: as the hub answered it, still reading, or failed. */
    record?: "read" | "reading" | "failed";
  } = $props();

  drawPopoversInPlace();

  const projectId = untrack(() => (project === null ? null : "cawco-dev"));
  const who = new WhoDecides(projectId);
  const table = untrack((): DecidesTable | null =>
    project === null
      ? null
      : {
          routes,
          from: Object.fromEntries(
            kinds.map((kind) => [
              kind.id,
              routes[kind.id] === fleetRoutes[kind.id] ? "fleet" : "project",
            ])
          ),
          problems: [],
          yours: [],
        }
  );
  untrack(() => {
    who.read = {
      state: "read",
      fleet: {
        members,
        kinds,
        routes: project === null ? routes : fleetRoutes,
        pictures: {},
        harnesses: offers,
        skills,
        connections: { slack: false, email: false },
      },
      table,
      types,
    };
    if (project !== null) {
      // His seat as the page's CawLead holds it: on, at rest, nothing moving.
      who.lead = {
        project: {
          cawHarness: "claude",
          cawModel: null,
          eventsOn: true,
          name: project,
        },
        on: true,
        moving: false,
        harness: "claude",
        model: null,
        sentence: conversationWords.status.ready,
        refused: null,
        view: null,
        configure: () => Promise.resolve(),
        read: () => Promise.resolve(),
      };
    }
  });

  // The hub's writes, kept on the page.
  who.handTo = () => Promise.resolve(true);
  who.useFleet = () => Promise.resolve(true);
  /** The record each read answers, as `record` says it stands. */
  const recordOf = (member: string): RecordRead => {
    if (record === "failed") {
      return {
        state: "failed",
        reason: decidesWords.record.unread(HUB_UNREACHABLE),
      };
    }
    if (record === "reading") {
      return { state: "reading" };
    }
    return {
      state: "read",
      record: records[member] ?? {
        caw: null,
        decided: 0,
        lastAt: null,
        takenBack: 0,
        waiting: 0,
        spendUsd: 0,
      },
    };
  };
  who.readRecord = (member) => {
    const read = recordOf(member);
    who.record = { member, read };
    return Promise.resolve();
  };
  who.saveSetup = () => {
    const { setup } = who;
    if (setup && Object.keys(who.setupProblems(setup)).length > 0) {
      setup.tried = true;
      setup.shown += 1;
      return Promise.resolve();
    }
    who.cancelSetup();
    return Promise.resolve();
  };
  who.pickPicture = (picture) => {
    const { setup } = who;
    if (setup) {
      setup.picking = false;
      if ("hue" in picture) {
        setup.draft.hue = picture.hue;
      }
    }
    return Promise.resolve();
  };
  who.removeMember = () => {
    who.cancelSetup();
    return Promise.resolve();
  };

  untrack(() => {
    // Drafts closed before saving: each with its job changed.
    who.parked = {};
    for (const key of parked) {
      who.openSetup(key);
      if (who.setup) {
        who.setup.draft.job = `${who.setup.draft.job} And it reads the build.`;
        if (key === NEW) {
          who.addAs("agent");
          who.setup.draft.name = "Release checker";
        }
      }
      who.closeSetup();
    }
    if (open === null) {
      return;
    }
    who.openSetup(open);
    const { setup } = who;
    if (!setup) {
      return;
    }
    if (adding) {
      who.addAs("agent");
      setup.reached = reached;
    }
    Object.assign(setup.draft, draft);
    if (row !== null || adding) {
      setup.open = row ?? who.rowsOf(setup)[reached] ?? null;
    }
    setup.tried = tried;
    setup.picking = picking;
    if (removing) {
      const member = who.member(open);
      who.asker.ask({
        at: `remove:${open}`,
        title: decidesWords.removeAsk(member?.name ?? open),
        body: decidesWords.removeLine(who.kindsHeldAnywhere(open), 1),
        cancelLabel: decidesWords.keep,
        confirmLabel: decidesWords.remove,
        pendingLabel: decidesWords.removing,
        run: () => who.removeMember(open),
      });
    }
  });
</script>

<!-- The settings draw in place under their card (SetupPopover), and the
     page grows to hold them whole: a frame is as tall as its page. -->
<div
  class="relative bg-surface-page p-space-5 max-desk:p-space-4"
  {@attach holdsPanels}
>
  <WhoRoster
    facts={(member) => who.facts(member, who.lead?.project ?? undefined)}
    {project}
    settings
    {who}
  />
</div>
