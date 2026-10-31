/**
 * Who decides as the page holds it (build spec §3.2): the fleet's members,
 * kinds and routes, and with a project its table, read from the hub. Every
 * write is asked at once and answered by the hub, whose answer replaces what
 * is held: nothing is guessed. While a write is out, the kinds it moves are
 * `asking`; a refusal stands as `fault` with the hub's sentence and its way
 * to try again.
 */
import type {
  CawPoseId,
  DecidesTable,
  Kind,
  Member,
} from "@cawco/core/decides";
import type { DelegateType } from "@cawco/core/delegate-types";
import type { HarnessKind } from "@cawco/core/harness";
import { unhandled } from "@cawco/core/unhandled";
import { accountsWords } from "@cawco/core/words/accounts";
import { decidesWords } from "@cawco/core/words/decides";
import { Asker, type AskHereRequest } from "#lib/cawco/ask-here.svelte.js";
import type { ProjectRow } from "#lib/cawco/client.svelte.js";
import { failureWords } from "#lib/cawco/hub-read.js";
import { modelLabel } from "#lib/cawco/models.svelte.js";
import type { CawLead } from "#lib/cawco/project/caw-lead.svelte.js";
import {
  type AgentBody,
  addMember,
  type FleetOffer,
  readFleet,
  readProject,
  readTypes,
  removeMember,
  saveMember,
  setPicture,
  writeFleetRoutes,
  writeProjectRoutes,
} from "./decides-client";
import {
  blankDraft,
  draftOf,
  NEW,
  type Parked,
  type Problems,
  problemsOf,
  type RowId,
  readParked,
  rowOfRefusal,
  rowsFor,
  Setup,
  writeParked,
} from "./setup.svelte";

type Read =
  | { state: "reading" }
  | { state: "failed"; reason: string }
  | {
      state: "read";
      fleet: FleetOffer;
      /** The project's table; null on the fleet's page. */
      table: DecidesTable | null;
      types: DelegateType[];
    };

/** A member's facts line: what it runs on, or why it can't be reached (in the attention ink). */
export interface Facts {
  attention: boolean;
  text: string;
}

/** A write the hub refused: what it moved, its words, and the way to ask again. */
export interface Fault {
  again: () => Promise<boolean>;
  kinds: string[];
  reason: string;
}

export class WhoDecides {
  readonly projectId: string | null;
  read = $state<Read>({ state: "reading" });
  /** The kind whose hand-over list is open. */
  handing = $state<string | null>(null);
  /** A write the hub has not answered yet: the kinds it moves, and what it does, said to a screen reader. */
  asking = $state<{ kinds: string[]; said: string } | null>(null);
  fault = $state<Fault | null>(null);
  /** The settings standing open: a member's, or Add a member's. */
  setup = $state<Setup | null>(null);
  /** Drafts closed before saving, by key ({@link NEW} for Add a member), kept in the session's storage. */
  parked = $state<Record<string, Parked>>({});
  /** Asks before a member is removed, in its settings' flow. */
  readonly asker = new Asker<AskHereRequest>();
  /** The project's Caw, whose switch and harness his settings change; null on the fleet's page. */
  lead: CawLead | null = null;

  constructor(projectId: string | null) {
    this.projectId = projectId;
    this.parked = readParked(projectId);
  }

  async load(): Promise<void> {
    this.read = { state: "reading" };
    try {
      await this.#refresh();
    } catch (error) {
      this.read = {
        state: "failed",
        reason: decidesWords.unread(failureWords(error)),
      };
    }
  }

  readonly members = $derived(
    this.read.state === "read" ? this.read.fleet.members : []
  );
  readonly kinds = $derived(
    this.read.state === "read"
      ? this.read.fleet.kinds.toSorted((a, b) => a.position - b.position)
      : []
  );
  /** The fleet's member for each kind. */
  readonly fleetRoutes = $derived(
    this.read.state === "read" ? this.read.fleet.routes : {}
  );
  /** This page's member for each kind: the project's table, or the fleet's. */
  readonly routes = $derived(
    this.read.state === "read"
      ? (this.read.table?.routes ?? this.read.fleet.routes)
      : {}
  );
  /** decides.md's problems: while there are any, every kind is his. */
  readonly problems = $derived(
    this.read.state === "read" ? (this.read.table?.problems ?? []) : []
  );
  /** The kinds the project set itself, in the kinds' order; none on the fleet's page. */
  readonly own = $derived(
    this.read.state === "read" && this.read.table
      ? this.kinds
          .filter(
            (kind) =>
              this.read.state === "read" &&
              this.read.table?.from[kind.id] === "project"
          )
          .map((kind) => kind.id)
      : []
  );

  isOwn = (kind: string): boolean => this.own.includes(kind);

  /** The kinds `member` decides on this page, in order. */
  holds = (member: string): Kind[] =>
    this.kinds.filter((kind) => this.routes[kind.id] === member);

  member = (id: string | undefined): Member | undefined =>
    this.members.find((one) => one.id === id);

  /** The harnesses on the fleet, with their machines and models. */
  readonly harnesses = $derived(
    this.read.state === "read" ? this.read.fleet.harnesses : []
  );
  /** The fleet's skills catalog. */
  readonly skills = $derived(
    this.read.state === "read" ? this.read.fleet.skills : []
  );

  harnessName = (id: HarnessKind): string => this.#harness(id).name;
  modelName = (harness: HarnessKind, model: string | null): string =>
    this.#model(harness, model);

  /** A harness by the name the fleet's machines report it, else its own name. */
  #harness(id: HarnessKind) {
    const offer =
      this.read.state === "read"
        ? this.read.fleet.harnesses.find((one) => one.id === id)
        : undefined;
    return { offer, name: offer?.name ?? accountsWords.harnesses[id] ?? id };
  }

  /** A model as its harness offers it, else as the model list names it. */
  #model(harness: HarnessKind, model: string | null) {
    const { offer } = this.#harness(harness);
    const named = offer?.models.find((one) =>
      model === null ? one.default : one.id === model
    );
    return named?.name ?? modelLabel(model ?? "", harness);
  }

  /** What `member` runs on, or why it can't be reached; null for members with none. */
  facts = (member: Member, project: ProjectRow | undefined): Facts | null => {
    if (this.read.state !== "read") {
      return null;
    }
    switch (member.type) {
      case "you":
      case "asker":
        return null;
      case "person":
      case "channel":
        return { attention: true, text: decidesWords.unreachable(member.name) };
      case "caw":
        if (!project) {
          return null;
        }
        if (!project.eventsOn) {
          return {
            attention: true,
            text: decidesWords.notLeading(project.name),
          };
        }
        return {
          attention: false,
          text: decidesWords.leads(
            `${this.#harness(project.cawHarness).name} · ${this.#model(project.cawHarness, project.cawModel)}`,
            project.name
          ),
        };
      case "advisor":
      case "practice":
      case "agent": {
        const type = this.read.types.find(
          (one) => one.name === member.delegateType
        );
        if (!type) {
          return null;
        }
        const harness = this.#harness(type.harness);
        if (!harness.offer || harness.offer.machines.length === 0) {
          return {
            attention: true,
            text: decidesWords.cantRun(member.name, harness.name),
          };
        }
        return {
          attention: false,
          text: decidesWords.runsOn(
            harness.name,
            this.#model(type.harness, type.model),
            type.effort ?? null
          ),
        };
      }
      default:
        return unhandled("member type", member.type);
    }
  };

  /**
   * Writes `routes` (null: back to the fleet's) to the project's file as one
   * commit saying `message`, or to the fleet's table; the hub's answer
   * replaces what is held. A refusal throws its words.
   */
  async #route(
    routes: Record<string, string | null>,
    message: string
  ): Promise<void> {
    const { read } = this;
    if (read.state !== "read") {
      return;
    }
    if (this.projectId === null) {
      const fleet = await writeFleetRoutes({
        ...read.fleet.routes,
        ...(Object.fromEntries(
          Object.entries(routes).filter(([, member]) => member !== null)
        ) as Record<string, string>),
      });
      this.#replace({ fleet: { ...read.fleet, ...fleet } });
    } else {
      const { decides } = await writeProjectRoutes(
        this.projectId,
        routes,
        message
      );
      this.#replace({ table: decides });
    }
  }

  /** What the hub answered, over what is held now. */
  #replace(next: Partial<Extract<Read, { state: "read" }>>): void {
    if (this.read.state === "read") {
      this.read = { ...this.read, ...next };
    }
  }

  /** Reads the fleet, the project's table and the types again, keeping the page drawn while it does. */
  async #refresh(): Promise<void> {
    const [fleet, table, catalog] = await Promise.all([
      readFleet(),
      this.projectId === null
        ? null
        : readProject(this.projectId).then((read) => read.decides),
      readTypes(),
    ]);
    this.read = { state: "read", fleet, table, types: catalog.types };
  }

  /**
   * Sets each of `routes`' kinds to its member (null: back to the fleet's),
   * in the project's file or the fleet's table; answers whether it went.
   */
  async #write(routes: Record<string, string | null>): Promise<boolean> {
    const { read } = this;
    if (read.state !== "read" || this.asking !== null) {
      return false;
    }
    const kinds = Object.keys(routes);
    const named = (id: string) =>
      this.kinds.find((kind) => kind.id === id)?.name ?? id;
    const back = kinds.filter((kind) => routes[kind] === null);
    const handed = kinds.find((kind) => routes[kind] !== null);
    const to = handed === undefined ? null : (routes[handed] ?? null);
    const toName = to === null ? "" : (this.member(to)?.name ?? to);
    this.asking = {
      kinds,
      said:
        handed === undefined
          ? decidesWords.givingBack(back.map(named))
          : decidesWords.handing(named(handed), toName),
    };
    this.fault = null;
    try {
      await this.#route(
        routes,
        handed === undefined
          ? decidesWords.backCommit(back.map(named))
          : decidesWords.handCommit(named(handed), toName)
      );
      return true;
    } catch (error) {
      this.fault = {
        kinds,
        reason: failureWords(error),
        again: () => this.#write(routes),
      };
      return false;
    } finally {
      this.asking = null;
    }
  }

  /** Hands `kind` to `member` for choices raised from now on; to the fleet's own choice it follows the fleet again. */
  handTo = (kind: string, member: string): Promise<boolean> => {
    this.handing = null;
    return this.#write({
      [kind]:
        this.projectId !== null && this.fleetRoutes[kind] === member
          ? null
          : member,
    });
  };

  /** Puts `kinds` back on the fleet's choice. */
  useFleet = (kinds: string[]): Promise<boolean> =>
    this.#write(Object.fromEntries(kinds.map((kind) => [kind, null])));

  // ── A member's settings, and Add a member (build spec §3.4) ─────────────

  /** The member a setup is for; null while adding one. */
  setupMember = (setup: Setup): Member | null =>
    setup.key === NEW ? null : (this.member(setup.key) ?? null);

  /** The rows `setup` holds, in order. */
  rowsOf = (setup: Setup): RowId[] =>
    rowsFor(this.setupMember(setup), this.projectId !== null);

  /** What keeps `setup` from saving, by row. */
  setupProblems = (setup: Setup): Problems => {
    if (this.read.state !== "read") {
      return {};
    }
    const problems = problemsOf(
      setup.draft,
      this.rowsOf(setup),
      this.setupMember(setup),
      this.read.fleet,
      setup.key === NEW ? this.read.types : []
    );
    const row = setup.fault?.row;
    if (row && setup.fault && !problems[row]) {
      problems[row] = setup.fault.reason;
    }
    return problems;
  };

  #park(setup: Setup): void {
    const { [setup.key]: _was, ...rest } = this.parked;
    this.parked = setup.changed
      ? { ...rest, [setup.key]: setup.parked() }
      : rest;
    writeParked(this.projectId, this.parked);
  }

  #unpark(key: string): void {
    const { [key]: _was, ...rest } = this.parked;
    this.parked = rest;
    writeParked(this.projectId, this.parked);
  }

  /** The draft `member` holds as the hub has it. */
  #draftOf(member: Member): Setup["draft"] {
    const type =
      this.read.state === "read"
        ? this.read.types.find((one) => one.name === member.delegateType)
        : undefined;
    const project = this.lead?.project;
    return draftOf(
      member,
      type,
      this.holds(member.id).map((kind) => kind.id),
      member.type === "caw" && project
        ? { harness: project.cawHarness, model: project.cawModel }
        : null
    );
  }

  /** Opens `key`'s settings ({@link NEW}: Add a member), where its parked draft left them. */
  openSetup = (key: string): void => {
    if (this.read.state !== "read") {
      return;
    }
    if (this.setup) {
      this.#park(this.setup);
    }
    this.handing = null;
    const parked = this.parked[key];
    if (key === NEW) {
      this.setup = new Setup(NEW, blankDraft(this.read.fleet), parked);
      return;
    }
    const member = this.member(key);
    if (!member) {
      return;
    }
    this.setup = new Setup(key, this.#draftOf(member), parked);
  };

  /** ×, Escape or a press elsewhere: the draft is parked, unless nothing changed. */
  closeSetup = (): void => {
    if (this.setup) {
      this.#park(this.setup);
    }
    this.setup = null;
  };

  /** Cancel: the one discard. */
  cancelSetup = (): void => {
    if (this.setup) {
      this.#unpark(this.setup.key);
    }
    this.setup = null;
  };

  /** Add a member: the kind picked, its first step unfolds. */
  addAs = (kind: "agent"): void => {
    const { setup } = this;
    if (setup) {
      setup.adding = kind;
      setup.open = this.rowsOf(setup)[0] ?? null;
      setup.reached = 0;
    }
  };

  /** A folded row's Change: it opens, the one open before it folds. */
  openRow = (row: RowId | null): void => {
    if (this.setup) {
      this.setup.open = row;
    }
  };

  /**
   * Adding, Continue: the open step folds into its summary and the next
   * unfolds; a step with a problem stays, its problem shown. The last
   * step's press adds the member.
   */
  next = async (): Promise<void> => {
    const { setup } = this;
    if (!setup?.open) {
      return;
    }
    const rows = this.rowsOf(setup);
    if (this.setupProblems(setup)[setup.open]) {
      setup.tried = true;
      setup.shown += 1;
      return;
    }
    const at = rows.indexOf(setup.open);
    const last = rows.length - 1;
    if (at >= last && setup.reached >= last) {
      await this.saveSetup();
      return;
    }
    setup.reached = Math.max(setup.reached, at + 1);
    setup.open = rows[setup.reached] ?? null;
  };

  /** The Continue press would add the member now. */
  lastStep = (setup: Setup): boolean => {
    const rows = this.rowsOf(setup);
    const last = rows.length - 1;
    return setup.reached >= last && setup.open === rows[last];
  };

  /** The agent's Runs on and Knows, as the hub takes them. */
  #agent(setup: Setup): AgentBody {
    const { draft } = setup;
    return {
      harness: draft.harness ?? "claude",
      model:
        draft.model ??
        (this.read.state === "read"
          ? this.read.fleet.harnesses
              .find((one) => one.id === draft.harness)
              ?.models.find((one) => one.default)?.id
          : undefined) ??
        "",
      ...(draft.effort ? { effort: draft.effort } : {}),
      skills: draft.skills,
      instructions: draft.instructions,
      delegates: draft.delegates,
    };
  }

  /** The routes a member's Decides changes: kinds it takes, and kinds it clears (back to the fleet's choice, or to You where that was it). */
  #kindsChange(id: string, kinds: string[]): Record<string, string | null> {
    const routes: Record<string, string | null> = {};
    for (const kind of this.kinds) {
      const held = this.routes[kind.id] === id;
      const wanted = kinds.includes(kind.id);
      if (wanted && !held) {
        routes[kind.id] =
          this.projectId !== null && this.fleetRoutes[kind.id] === id
            ? null
            : id;
      } else if (held && !wanted) {
        routes[kind.id] =
          this.projectId !== null && this.fleetRoutes[kind.id] !== id
            ? null
            : "you";
      }
    }
    return routes;
  }

  /** The member's own settings written: added, Caw's harness and model, or its type and how he hears. */
  async #saveMember(setup: Setup): Promise<Member> {
    const { draft } = setup;
    const member = this.setupMember(setup);
    if (member === null) {
      const added = await addMember({
        name: draft.name.trim(),
        job: draft.job.trim(),
        hue: draft.hue,
        hear: draft.hear,
        agent: this.#agent(setup),
      });
      this.#unpark(NEW);
      setup.key = added.id;
      await this.#refresh();
      return added;
    }
    if (member.type === "caw") {
      const { lead } = this;
      const moved =
        draft.harness !== lead?.harness || draft.model !== lead?.model;
      if (lead && moved && draft.harness !== null) {
        await lead.configure({ harness: draft.harness, model: draft.model });
        if (lead.refused) {
          throw new Error(lead.refused);
        }
      }
      return member;
    }
    await saveMember(member.id, {
      hear: draft.hear,
      agent: this.#agent(setup),
      ...(member.type === "agent"
        ? { job: draft.job.trim(), hue: draft.hue }
        : {}),
    });
    return member;
  }

  /**
   * Save, or Add member: the problems first (the first scrolls into view);
   * then the member (added, or its type and how he hears), Caw's harness
   * and model, and its kinds, each as the hub answers. A refusal stands at
   * the field it names, else in the foot; what went stays gone (an added
   * member is saved, not added again, on the next press).
   */
  saveSetup = async (): Promise<void> => {
    const { setup } = this;
    if (!setup || setup.saving || this.read.state !== "read") {
      return;
    }
    setup.tried = true;
    setup.fault = null;
    const problems = this.setupProblems(setup);
    const first = this.rowsOf(setup).find((row) => problems[row]);
    if (first) {
      setup.open = first;
      setup.shown += 1;
      return;
    }
    setup.saving = true;
    try {
      const member = await this.#saveMember(setup);
      const { draft } = setup;
      const routes = this.#kindsChange(member.id, draft.kinds);
      if (Object.keys(routes).length > 0) {
        await this.#route(routes, decidesWords.setupCommit(member.name));
      }
      await this.#refresh();
      this.#unpark(setup.key);
      if (this.setup === setup) {
        this.setup = null;
      }
    } catch (error) {
      const reason = failureWords(error);
      setup.fault = { reason, row: rowOfRefusal(reason) };
      if (setup.fault.row) {
        setup.open = setup.fault.row;
        setup.shown += 1;
      }
    } finally {
      setup.saving = false;
    }
  };

  /**
   * A picture picked: a flock member wears the pose, an added member the
   * hue, as the hub answers; a member still being added keeps the hue in
   * its draft. The picker folds.
   */
  pickPicture = async (
    picture: { pose: CawPoseId } | { hue: number }
  ): Promise<void> => {
    const { setup } = this;
    if (!setup) {
      return;
    }
    setup.picking = false;
    if ("hue" in picture) {
      setup.draft.hue = picture.hue;
    }
    const member = this.setupMember(setup);
    if (member === null) {
      return;
    }
    setup.fault = null;
    try {
      const saved = await setPicture(member.id, picture);
      if (this.read.state === "read") {
        this.#replace({
          fleet: {
            ...this.read.fleet,
            members: this.read.fleet.members.map((one) =>
              one.id === saved.id ? saved : one
            ),
          },
        });
      }
      if ("hue" in picture) {
        // Saved already: the draft's hue is no change of its own.
        setup.start.hue = picture.hue;
      }
    } catch (error) {
      setup.fault = { reason: failureWords(error), row: null };
    }
  };

  /** The kinds `member` decides, here or across the fleet, by name. */
  kindsHeldAnywhere = (member: string): string[] =>
    this.kinds
      .filter(
        (kind) =>
          this.routes[kind.id] === member ||
          this.fleetRoutes[kind.id] === member
      )
      .map((kind) => kind.name);

  /** Removes a member he added: its kinds come back to him; a refusal throws its words. */
  removeMember = async (id: string): Promise<void> => {
    await removeMember(id);
    this.#unpark(id);
    if (this.setup?.key === id) {
      this.setup = null;
    }
    await this.#refresh();
  };
}
