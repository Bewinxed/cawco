<script lang="ts">
  /**
   * Who decides whole, on the real state (WhoDecides) holding the hub's
   * records and the latest questions agents asked: the team, the kinds'
   * cards, and whatever stands open. The writes stay here: a hand-over, a
   * save, a picture, a kind added or removed change what the page holds and
   * nothing reaches the hub. Each prop sets the situation it stands in.
   */
  import {
    type DecidesTable,
    KIND_SEED,
    type Kind,
    type Member,
    slugOf,
  } from "@cawco/core/decides";
  import { decidesWords } from "@cawco/core/words/decides";
  import { conversationWords } from "@cawco/core/words/project-conversation";
  import { untrack } from "svelte";
  import { HUB_UNREACHABLE } from "#lib/cawco/hub-read.js";
  import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
  import { WhoDecides } from "../decides.svelte";
  import type { FleetOffer, RecentCall } from "../decides-client";
  import { drawPopoversInPlace, holdsPanels } from "../in-place";
  import { KindAdd } from "../kinds.svelte";
  import { type Draft, NEW } from "../setup.svelte";
  import WhoDecidesPage from "../WhoDecidesPage.svelte";
  import { calls as fleetCalls, records } from "./calls";
  import { added, fleetRoutes } from "./records";
  import { harnesses, skills, types } from "./setup-records";

  /** A kind he added, for its removal. */
  const dataKind: Kind = {
    id: "data",
    name: "Data and migrations",
    example: "a schema change, a backfill, a data fix",
    builtIn: false,
    position: 6,
  };

  let {
    members = added.slice(0, 6),
    routes = { ...fleetRoutes, look: "design-reviewer" },
    extraKind = false,
    project = null,
    offers = harnesses,
    read = "read",
    recent = "read",
    calls = fleetCalls,
    problems = [],
    open = null,
    draft = {},
    tried = false,
    picking = false,
    handing = null,
    addingKind = null,
    renaming = null,
    removingKind = null,
    inPlace = true,
  }: {
    members?: Member[];
    /** Who answers each kind on this page. */
    routes?: Record<string, string>;
    /** A kind he added stands after the six. */
    extraKind?: boolean;
    /** The project's name; null on the fleet's page. */
    project?: string | null;
    offers?: FleetOffer["harnesses"];
    read?: "read" | "reading" | "failed";
    recent?: "read" | "reading" | "failed";
    calls?: RecentCall[];
    /** decides.md's problems, when it doesn't read. */
    problems?: string[];
    /** Whose card stands open: a member's id, or "new" for Add an agent. */
    open?: string | null;
    /** What the open card's draft says over what the hub holds. */
    draft?: Partial<Draft>;
    /** Save or Add was pressed. */
    tried?: boolean;
    picking?: boolean;
    /** The kind whose hand-over list stands open. */
    handing?: string | null;
    /** A kind being added, as typed so far. */
    addingKind?: { name: string; example: string; tried?: boolean } | null;
    /** The kind being renamed. */
    renaming?: string | null;
    /** The kind whose removal stands asked. */
    removingKind?: string | null;
    /** Cards and lists draw in place under what opened them (a states file's frame); false floats them as the page does. */
    inPlace?: boolean;
  } = $props();

  if (untrack(() => inPlace)) {
    drawPopoversInPlace();
  }

  const kinds = untrack(() =>
    extraKind ? [...KIND_SEED, dataKind] : KIND_SEED
  );
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
              routes[kind.id] === (fleetRoutes[kind.id] ?? "you")
                ? "fleet"
                : "project",
            ])
          ),
          problems,
          yours: [],
        }
  );

  untrack(() => {
    who.parked = {};
    who.kindAdd = null;
    if (read === "failed") {
      who.read = {
        state: "failed",
        reason: decidesWords.unread(HUB_UNREACHABLE),
      };
    } else if (read === "reading") {
      who.read = { state: "reading" };
    } else {
      who.read = {
        state: "read",
        fleet: {
          members,
          kinds,
          routes:
            project === null
              ? { ...routes, ...(extraKind ? { data: "advisor" } : {}) }
              : { ...fleetRoutes, ...(extraKind ? { data: "advisor" } : {}) },
          pictures: {},
          harnesses: offers,
          skills,
          connections: { slack: false, email: false },
        },
        table,
        types,
      };
    }
    if (recent === "failed") {
      who.recent = {
        state: "failed",
        reason: decidesWords.recentUnread(HUB_UNREACHABLE),
      };
    } else if (recent === "reading") {
      who.recent = { state: "reading" };
    } else {
      who.recent = { state: "read", calls };
    }
    if (project !== null) {
      // His seat as the page's CawLead holds it: on, at rest, nothing moving.
      who.lead = {
        project: {
          id: "cawco-dev",
          name: project,
          eventsOn: true,
          cawHarness: "claude",
          cawModel: null,
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
      } as unknown as CawLead;
    }
  });

  // The hub's writes, kept on the page.
  const reroute = (kind: string, to: string | null) => {
    if (who.read.state !== "read") {
      return;
    }
    const next = to ?? fleetRoutes[kind] ?? "you";
    if (who.read.table) {
      who.read = {
        ...who.read,
        table: {
          ...who.read.table,
          routes: { ...who.read.table.routes, [kind]: next },
          from: {
            ...who.read.table.from,
            [kind]: to === null ? "fleet" : "project",
          },
        },
      };
    } else {
      who.read = {
        ...who.read,
        fleet: {
          ...who.read.fleet,
          routes: { ...who.read.fleet.routes, [kind]: next },
        },
      };
    }
  };
  who.handTo = (kind, to) => {
    reroute(kind, to);
    return Promise.resolve(true);
  };
  who.useFleet = (ids) => {
    for (const kind of ids) {
      reroute(kind, null);
    }
    return Promise.resolve(true);
  };
  who.readRecord = (member) => {
    who.record = {
      member,
      read: {
        state: "read",
        record: records[member] ?? {
          caw: null,
          decided: 0,
          lastAt: null,
          takenBack: 0,
          waiting: 0,
          spendUsd: 0,
        },
      },
    };
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
  /** The fleet as the hub would answer it after a kind's write. */
  const withKinds = (
    next: (kinds: Kind[]) => Kind[],
    route?: [string, string]
  ) => {
    if (who.read.state !== "read") {
      return;
    }
    who.read = {
      ...who.read,
      fleet: {
        ...who.read.fleet,
        kinds: next(who.read.fleet.kinds),
        routes: route
          ? { ...who.read.fleet.routes, [route[0]]: route[1] }
          : who.read.fleet.routes,
      },
    };
  };
  who.addKind = () => {
    const add = who.kindAdd;
    if (!add) {
      return Promise.resolve();
    }
    add.tried = true;
    if (Object.keys(who.kindAddProblems(add)).length > 0) {
      return Promise.resolve();
    }
    const id = slugOf(add.name.trim());
    withKinds(
      (all) => [
        ...all,
        {
          id,
          name: add.name.trim(),
          example: add.example.trim(),
          builtIn: false,
          position: all.length,
        },
      ],
      [id, add.to]
    );
    who.kindAdd = null;
    return Promise.resolve();
  };
  who.doneRename = () => {
    const rename = who.kindRename;
    if (rename && Object.keys(who.renameProblems(rename)).length === 0) {
      withKinds((all) =>
        all.map((one) =>
          one.id === rename.id
            ? {
                ...one,
                name: rename.name.trim(),
                example: rename.example.trim(),
              }
            : one
        )
      );
      who.kindRename = null;
    }
    return Promise.resolve();
  };
  who.removeKind = () => Promise.resolve();
  who.loadRecent = () => Promise.resolve();
  who.load = () => Promise.resolve();

  untrack(() => {
    if (handing !== null) {
      who.handing = handing;
    }
    if (addingKind !== null) {
      const add = new KindAdd();
      add.name = addingKind.name;
      add.example = addingKind.example;
      add.tried = addingKind.tried ?? false;
      who.kindAdd = add;
    }
    if (renaming !== null) {
      who.startRename(renaming);
    }
    if (removingKind !== null) {
      const kind = kinds.find((one) => one.id === removingKind);
      who.asker.ask({
        at: `remove-kind:${removingKind}`,
        title: decidesWords.removeKindAsk(kind?.name ?? removingKind),
        body: [decidesWords.waitingMove(2, ["Cawco-Dev"])],
        cancelLabel: decidesWords.keep,
        confirmLabel: decidesWords.removeAndMove(2),
        pendingLabel: decidesWords.removingKind,
        run: () => Promise.resolve(),
      });
    }
    if (open === null) {
      return;
    }
    who.openSetup(open);
    const { setup } = who;
    if (!setup) {
      return;
    }
    if (open === NEW) {
      who.addAs("agent");
    }
    Object.assign(setup.draft, draft);
    setup.tried = tried;
    setup.picking = picking;
  });

  const facts = (id: string): string | null => {
    const member = who.member(id);
    const said = member
      ? who.facts(member, who.lead?.project ?? undefined)
      : null;
    return said?.attention ? said.text : null;
  };
</script>

<!-- Cards and lists hung from the page draw in place under what opened
     them, and the page grows to hold them whole: a frame is as tall as its
     page. -->
<div
  class="relative min-h-dvh bg-surface-recess px-space-5 py-space-6 max-phone:px-space-4"
  {@attach holdsPanels}
>
  <WhoDecidesPage {facts} {project} {who} />
</div>
