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
  import { frameObserver } from "#lib/cawco/frame-observer.js";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import * as Tooltip from "#lib/components/ui/tooltip/index.js";
  import { WhoDecides } from "../decides.svelte";
  import type { FleetOffer } from "../decides-client";
  import Roster from "../Roster.svelte";
  import { drawSetupInPlace } from "../SetupPopover.svelte";
  import { type Draft, NEW, type RowId } from "../setup.svelte";
  import { added, fleetRoutes, kinds, project as projectName } from "./records";
  import { harnesses, skills, types } from "./setup-records";

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
  } = $props();

  drawSetupInPlace();

  /** The page as tall as the settings standing under their card reach, and its own padding past them. */
  function holdsSetup(page: HTMLElement) {
    const fit = () => {
      const panel = page.querySelector<HTMLElement>("[data-still-setup]");
      const pad = Number.parseFloat(getComputedStyle(page).paddingBlockEnd);
      page.style.minBlockSize = panel
        ? `${panel.offsetTop + panel.offsetHeight + pad}px`
        : "";
    };
    const watch = frameObserver(fit);
    let watched: Element | null = null;
    const seen = new MutationObserver(() => {
      const panel = page.querySelector("[data-still-setup]");
      if (panel !== watched) {
        if (watched) {
          watch.unobserve(watched);
        }
        if (panel) {
          watch.observe(panel);
        }
        watched = panel;
      }
      watch.request();
    });
    seen.observe(page, { childList: true, subtree: true });
    watch.observe(page);
    fit();
    return () => {
      watch.disconnect();
      seen.disconnect();
    };
  }

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
      const projectRow = {
        id: "cawco-dev",
        name: project,
        eventsOn: true,
        cawHarness: "claude",
        cawModel: null,
      };
      // His seat as the page's CawLead holds it: on, at rest, nothing moving.
      who.lead = {
        project: projectRow,
        on: true,
        moving: false,
        harness: "claude",
        model: null,
        sentence: conversationWords.status.ready,
        refused: null,
        view: null,
        configure: () => Promise.resolve(),
        read: () => Promise.resolve(),
      } as unknown as CawLead;
    }
  });

  // The hub's writes, kept on the page.
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

<Tooltip.Provider>
  <!-- The settings draw in place under their card (SetupPopover), and the
       page grows to hold them whole: a frame is as tall as its page. -->
  <div
    class="relative bg-surface-page p-space-5 max-desk:p-space-4"
    {@attach holdsSetup}
  >
    <Roster
      asking={who.asking}
      facts={(member) => who.facts(member, who.lead?.project ?? undefined)}
      fault={who.fault}
      fleetRoutes={who.fleetRoutes}
      bind:handing={who.handing}
      kinds={who.kinds}
      members={who.members}
      onhand={() => Promise.resolve(true)}
      onputback={() => Promise.resolve(true)}
      own={who.own}
      {project}
      routes={who.routes}
      {who}
    />
  </div>
</Tooltip.Provider>
