/**
 * Who decides as the page holds it (build spec §3.2): the fleet's members,
 * kinds and routes, and with a project its table, read from the hub. Every
 * write is asked at once and answered by the hub, whose answer replaces what
 * is held: nothing is guessed. While a write is out, the kinds it moves are
 * `asking`; a refusal stands as `fault` with the hub's sentence and its way
 * to try again.
 */
import type { DecidesTable, Kind, Member } from "@cawco/core/decides";
import type { DelegateType } from "@cawco/core/delegate-types";
import type { HarnessKind } from "@cawco/core/harness";
import { unhandled } from "@cawco/core/unhandled";
import { accountsWords } from "@cawco/core/words/accounts";
import { decidesWords } from "@cawco/core/words/decides";
import type { ProjectRow } from "#lib/cawco/client.svelte.js";
import { failureWords } from "#lib/cawco/hub-read.js";
import { modelLabel } from "#lib/cawco/models.svelte.js";
import {
  type FleetOffer,
  readFleet,
  readProject,
  readTypes,
  writeFleetRoutes,
  writeProjectRoutes,
} from "./decides-client";

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

  constructor(projectId: string | null) {
    this.projectId = projectId;
  }

  async load(): Promise<void> {
    this.read = { state: "reading" };
    try {
      const [fleet, table, catalog] = await Promise.all([
        readFleet(),
        this.projectId === null
          ? null
          : readProject(this.projectId).then((read) => read.decides),
        readTypes(),
      ]);
      this.read = { state: "read", fleet, table, types: catalog.types };
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
      if (this.projectId === null) {
        const fleet = await writeFleetRoutes({
          ...read.fleet.routes,
          ...(Object.fromEntries(
            Object.entries(routes).filter(([, member]) => member !== null)
          ) as Record<string, string>),
        });
        this.read = { ...read, fleet: { ...read.fleet, ...fleet } };
      } else {
        const message =
          handed === undefined
            ? decidesWords.backCommit(back.map(named))
            : decidesWords.handCommit(named(handed), toName);
        const { decides } = await writeProjectRoutes(
          this.projectId,
          routes,
          message
        );
        this.read = { ...read, table: decides };
      }
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
}
