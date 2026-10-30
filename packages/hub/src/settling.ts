/**
 * Who decides, at the hub (PRD §5.8, core decides.ts): each card a session
 * writes goes to the member the project's table names for its kind
 * (decides-file.ts), and the session hears where, one line per card
 * (`routed`).
 *
 * - **You**: the card waits on the person.
 * - **The agent** (`asker`): the writer settles it itself.
 * - **Caw**: the project's conversation hears it as a `decision` event
 *   (caw.ts), and its session settles it.
 * - **An agent member** (the Advisor, Common practice, one he added): its
 *   cards in one project settle in one session. A live session of it for
 *   the project whose cache is warm is handed the new cards (the handoff
 *   path, delegation-actions.ts); otherwise one run of its delegate type
 *   starts under the writer (work-items.ts `start`, `lands: none`) with
 *   every card waiting on it there.
 * - **A member that can't be reached** (a person or channel before a
 *   connection carries the question, an agent whose harness is on no online
 *   machine, Caw while he isn't leading the project): the card comes to the
 *   person, its ledger row signed with the reason, and the writer is told.
 *
 * Every card the hub sends somewhere has its row in `card_settlings`, the
 * ledger the decision surface reads. Who may `settle` a card (`settler`):
 * the writer for the asker, the conversation's session for Caw, the
 * member's session in the ledger for an agent member; no one for the
 * person. The pick itself is written by artifacts/service.ts `settle`.
 */
import type { DelegateType, InstanceRow } from "@cawco/core";
import type { ChoiceEntry, SettledBy } from "@cawco/core/choices";
import {
  BUILT_IN,
  type FleetDecides,
  kindName,
  kindOf,
  type Member,
  memberOf,
  type RouteState,
  routeLine,
} from "@cawco/core/decides";
import { type DecisionCard, pickMade } from "@cawco/core/decisions";
import { decisionLink, sessionLink } from "@cawco/core/references";
import { unhandled } from "@cawco/core/unhandled";
import { decidesWords } from "@cawco/core/words/decides";
import type { ArtifactRow } from "./db/artifacts";
import type { CardSettlingRow, DecidesDb } from "./db/decides";
import { decidesTable, SettleRefusal } from "./decides-file";
import { sessionLabel } from "./labels";
import {
  SESSION_TITLE_MAX,
  type WorkItemRequest,
  type WorkItemStart,
} from "./work-items";

/** A page's cards as a brief reads them: the page, the cards to settle, all its cards and its picks. */
export interface PageCards {
  all: DecisionCard[];
  cards: DecisionCard[];
  row: ArtifactRow;
  state: Record<string, ChoiceEntry>;
}

/** What settling reads and starts through. */
export interface SettlingDeps {
  readonly db: DecidesDb;
  /** The fleet delegate type `name`. */
  readonly delegateType: (name: string) => DelegateType | undefined;
  /** Hands `message` to session `to` as `from` would: the one handoff path (delegation-actions.ts). */
  readonly handoff: (
    from: InstanceRow,
    to: string,
    message: string
  ) => Promise<string>;
  /** A harness's name: "Claude Code". */
  readonly harnessName: (harness: string) => string;
  /** Whether `harness` runs on a machine that is online now. */
  readonly harnessOnline: (harness: string) => boolean;
  /** A member answered with `hear: "each"`: one push (push.ts). */
  readonly heard: (decided: Decided) => void;
  readonly instance: (id: string) => InstanceRow | undefined;
  /** Whether work item `id` is still starting or running. */
  readonly live: (workItemId: string) => boolean;
  /** A model's name on a harness: "Opus 5.5"; the id itself when no report names it. */
  readonly modelName: (harness: string, model: string) => string;
  /** The open cards of page `artifactId` among `cards`, as a brief reads them; undefined when the page is gone. */
  readonly pageCards: (
    artifactId: string,
    cards: readonly string[]
  ) => PageCards | undefined;
  /** Project `id`'s name, Caw's switch and runs-on. */
  readonly project: (id: string) =>
    | {
        cawHarness: string;
        cawModel: string | null;
        conversationInstanceId: string | null;
        eventsOn: boolean;
        name: string;
      }
    | undefined;
  /** Files and spawns a work item (work-items.ts `start`): what dispatch starts an attempt through. */
  readonly start: (request: WorkItemRequest) => Promise<WorkItemStart>;
  /** Tells the project's conversation a `decision` event (caw.ts `tell`): its session, or why it didn't take it. */
  readonly tellCaw: (
    projectId: string,
    event: { text: string; trigger: string }
  ) => Promise<{ instanceId: string } | { why: string }>;
  /** Whether session `id` is live and its prompt cache warm (keep-alive.ts `cacheWarmNow`). */
  readonly warm: (id: string) => boolean;
}

/** A member's answer, as its push says it. */
export interface Decided {
  artifactId: string;
  card: string;
  label: string;
  member: string;
  projectId: string | null;
  question: string;
  why: string;
}

/** Where a card's member stands, or why it can't be reached. */
type Reach = { ok: true } | { ok: false; reason: string };

/** A card routed: its member, and where its table came from. */
interface Routed {
  member: Member;
  where: "project" | "fleet";
}

/** One option of a card, as the member reads it. */
const optionLines = (card: DecisionCard): string[] =>
  card.options.map((option) =>
    [
      `- \`${option.id}\` ${option.label}${option.recommended ? " (recommended by the writer)" : ""}`,
      option.line && `Gets: ${option.line}`,
      option.cost && `Costs: ${option.cost}`,
      option.builds && `Builds: ${option.builds}`,
    ]
      .filter(Boolean)
      .join(". ")
  );

/** One card as a brief gives it: question, how to settle it, its kind, why, options. */
const cardLines = (
  fleet: FleetDecides,
  row: ArtifactRow,
  card: DecisionCard
): string => {
  const kind = kindOf(fleet, card.kind);
  return [
    `## ${card.question}`,
    `Settle with card: "${row.id}#${card.id}"`,
    kind ? `Kind: ${kind.name} (${kind.example}).` : "",
    card.why ? `The writer's why: ${card.why}` : "",
    "Options:",
    ...optionLines(card),
  ]
    .filter(Boolean)
    .join("\n");
};

/** A page's other cards, for context. */
const otherLines = (page: PageCards): string[] => {
  const others = page.all.filter((card) => !page.cards.includes(card));
  return others.length > 0
    ? [
        `## The page “${page.row.name}”'s other cards, for context\n${others
          .map(
            (card) =>
              `- ${card.question}: ${pickMade(card, page.state[card.id]) ? `picked ${page.state[card.id]?.options.join(", ")}` : "open"}`
          )
          .join("\n")}`,
      ]
    : [];
};

/** How a member settles: its standing instructions, Common practice's web rule. */
const howLines = (member: Member, instructions: string | null): string =>
  [
    "## How",
    instructions ? `Your standing instructions: ${instructions}` : "",
    member.id === "practice"
      ? "Find what well-run projects and the tools' own docs do for each question, from current sources on the web, and pick the option that matches it."
      : "Read what each question needs (the code, the docs, the brief's facts) and pick the option that best serves the person's product.",
    `Call settle once per card: { card, option, why, sources }. why is one sentence naming the fact that decides it. sources are the links or repository paths it rests on${member.id === "practice" ? "; common practice names at least one https link" : ""}.`,
  ]
    .filter(Boolean)
    .join("\n");

/**
 * The brief a member settles from: who it is, the cards it settles on each
 * page (question, why, options with Gets, Costs and Builds), the pages'
 * other cards for context, and how it settles each.
 */
const briefOf = (
  fleet: FleetDecides,
  member: Member,
  instructions: string | null,
  asker: InstanceRow,
  pages: PageCards[],
  run: boolean
): string => {
  const count = pages.reduce((sum, page) => sum + page.cards.length, 0);
  const kinds = [
    ...new Set(
      pages.flatMap((page) =>
        page.cards.map((card) => kindName(fleet, card.kind))
      )
    ),
  ];
  return [
    `You are ${member.name} in Who decides: you settle ${count === 1 ? "a decision card" : `${count} decision cards`} that ${sessionLink(asker.id, sessionLabel(asker).name)} and the project's other sessions wrote. Who decides sends ${kinds.join(" and ")} to you: you pick for the person, who can pick again later.`,
    ...pages.flatMap((page) => [
      ...page.cards.map((card) => cardLines(fleet, page.row, card)),
      ...otherLines(page),
    ]),
    [
      howLines(member, instructions),
      run
        ? "Change no file: your work lands nothing. Then call finish_item with each card's pick and why."
        : "Change no file. Then finish as you did before, with each card's pick and why.",
    ].join("\n"),
  ].join("\n\n");
};

/** Whether a ledger row stands for a member still on its card. */
const onIt = (deps: SettlingDeps, kept: CardSettlingRow | undefined) =>
  !!kept &&
  kept.settledAt === null &&
  kept.instanceId !== null &&
  (kept.workItemId === null
    ? deps.warm(kept.instanceId)
    : deps.live(kept.workItemId));

export const createSettling = (deps: SettlingDeps) => {
  /** Card `card`'s member on page `row`, by the project's table, and the table's problems. */
  const routeOf = async (
    fleet: FleetDecides,
    row: ArtifactRow,
    card: DecisionCard
  ): Promise<Routed & { problems: string[] }> => {
    const table = await decidesTable(row.projectId, fleet);
    const id = card.kind ? table.routes[card.kind] : undefined;
    return {
      member: (id && memberOf(fleet, id)) || BUILT_IN.you,
      where: row.projectId ? "project" : "fleet",
      problems: table.problems,
    };
  };

  /** Whether Caw can be reached for a card on project `projectId`'s page (null: none): only while he leads it. */
  const cawReach = (projectId: string | null): Reach => {
    if (!projectId) {
      return { ok: false, reason: decidesWords.noProject };
    }
    const project = deps.project(projectId);
    return project?.eventsOn
      ? { ok: true }
      : {
          ok: false,
          reason: decidesWords.notLeading(project?.name ?? projectId),
        };
  };

  /** Whether an agent member can run: its delegate type's harness is on a machine that is online. */
  const agentReach = (member: Member): Reach => {
    const type = member.delegateType
      ? deps.delegateType(member.delegateType)
      : undefined;
    if (!type) {
      return {
        ok: false,
        reason: decidesWords.cantRun(
          member.name,
          member.delegateType ?? member.name
        ),
      };
    }
    return deps.harnessOnline(type.harness)
      ? { ok: true }
      : {
          ok: false,
          reason: decidesWords.cantRun(
            member.name,
            deps.harnessName(type.harness)
          ),
        };
  };

  /** Whether `member` can be reached for a card on project `projectId`'s page (null: none), and if not why. */
  const reach = (member: Member, projectId: string | null): Reach => {
    switch (member.type) {
      case "you":
      case "asker":
        return { ok: true };
      case "caw":
        return cawReach(projectId);
      case "person":
      case "channel":
        return { ok: false, reason: decidesWords.unreachable(member.name) };
      case "advisor":
      case "practice":
      case "agent":
        return agentReach(member);
      default:
        return unhandled("member type", member.type);
    }
  };

  /** What a member runs on, as its signature says it. */
  const runsOf = (
    member: Member,
    settler: InstanceRow,
    projectId: string | null
  ): string | null => {
    if (member.type === "caw") {
      const project = projectId ? deps.project(projectId) : undefined;
      if (!project) {
        return null;
      }
      const runs = `${deps.harnessName(project.cawHarness)}${project.cawModel ? ` · ${deps.modelName(project.cawHarness, project.cawModel)}` : ""}`;
      return decidesWords.leads(runs, project.name);
    }
    if (member.type === "asker") {
      return `${deps.harnessName(settler.harness)}${settler.model ? ` · ${deps.modelName(settler.harness, settler.model)}` : ""}`;
    }
    const type = member.delegateType
      ? deps.delegateType(member.delegateType)
      : undefined;
    return type
      ? `${deps.harnessName(type.harness)} · ${deps.modelName(type.harness, type.model)}`
      : null;
  };

  /** The ledger row of `card` on `row` for `member`. */
  const rowOf = (
    row: ArtifactRow,
    card: DecisionCard,
    asker: InstanceRow,
    member: string,
    on: Pick<CardSettlingRow, "instanceId" | "workItemId" | "signed">
  ): CardSettlingRow => ({
    artifactId: row.id,
    card: card.id,
    route: member,
    askedBy: asker.id,
    createdAt: new Date(),
    kind: card.kind,
    settledAt: null,
    takenBackAt: null,
    ...on,
  });

  /** Caw's cards: one `decision` event to the project's conversation. */
  const toCaw = async (
    fleet: FleetDecides,
    asker: InstanceRow,
    page: PageCards
  ): Promise<RouteState> => {
    const projectId = page.row.projectId as string;
    const told = await deps.tellCaw(projectId, {
      trigger: decidesWords.decisionTrigger(
        decisionLink(page.row.id, page.cards[0]?.id ?? "", page.row.name)
      ),
      text: briefOf(fleet, BUILT_IN.caw, null, asker, [page], false),
    });
    if ("why" in told) {
      return { state: "failed", why: told.why };
    }
    deps.db.putSettlings(
      page.cards.map((card) =>
        rowOf(page.row, card, asker, "caw", {
          instanceId: told.instanceId,
          workItemId: null,
          signed: null,
        })
      )
    );
    return { state: "running" };
  };

  /** The member's own session for `page`'s project: the newest in the ledger, while it is live and its cache warm. */
  const warmSession = (kept: CardSettlingRow[]): InstanceRow | undefined => {
    const session = kept[0]?.instanceId
      ? deps.instance(kept[0].instanceId)
      : undefined;
    return session && deps.warm(session.id) ? session : undefined;
  };

  /** `page`'s cards handed to `session`, the member's warm session, by its parent: the handoff path. */
  const handTo = async (
    fleet: FleetDecides,
    member: Member,
    session: InstanceRow,
    asker: InstanceRow,
    page: PageCards
  ): Promise<RouteState> => {
    const from =
      (session.parentInstanceId
        ? deps.instance(session.parentInstanceId)
        : undefined) ?? asker;
    const type = deps.delegateType(member.delegateType as string);
    await deps.handoff(
      from,
      session.id,
      briefOf(fleet, member, type?.description ?? null, asker, [page], false)
    );
    deps.db.putSettlings(
      page.cards.map((card) =>
        rowOf(page.row, card, asker, member.id, {
          instanceId: session.id,
          workItemId: session.workItemId ?? null,
          signed: null,
        })
      )
    );
    console.log(
      `[settling] ${page.row.name}: ${page.cards.map((card) => card.id).join(", ")} handed to ${member.id}'s session ${session.id}`
    );
    return { state: "running" };
  };

  /** The other pages of the project whose cards still wait on the member, their run gone. */
  const stranded = (page: PageCards, kept: CardSettlingRow[]): PageCards[] => {
    const cards = new Map<string, string[]>();
    for (const one of kept) {
      if (
        one.artifactId !== page.row.id &&
        one.settledAt === null &&
        !onIt(deps, one)
      ) {
        cards.set(one.artifactId, [
          ...(cards.get(one.artifactId) ?? []),
          one.card,
        ]);
      }
    }
    return [...cards].flatMap(([artifactId, ids]) => {
      const read = deps.pageCards(artifactId, ids);
      return read && read.cards.length > 0 ? [read] : [];
    });
  };

  /** One run of the member's delegate type under `asker`, with every card of `pages`. */
  const startRun = async (
    fleet: FleetDecides,
    member: Member,
    asker: InstanceRow,
    pages: PageCards[]
  ): Promise<RouteState> => {
    const [page] = pages as [PageCards];
    const type = deps.delegateType(member.delegateType as string);
    const title = `Settle: ${page.cards[0]?.question ?? page.row.name}`;
    const started = await deps.start({
      parentInstanceId: asker.id,
      prompt: briefOf(
        fleet,
        member,
        type?.description ?? null,
        asker,
        pages,
        true
      ),
      title:
        title.length > SESSION_TITLE_MAX
          ? `${title.slice(0, SESSION_TITLE_MAX - 1)}…`
          : title,
      type: member.delegateType as string,
      lands: "none",
      settlesCards: true,
    });
    const { instanceId } = started.item;
    if (!instanceId) {
      return { state: "failed", why: "the hub started no session for it." };
    }
    deps.db.putSettlings(
      pages.flatMap((one) =>
        one.cards.map((card) =>
          rowOf(one.row, card, asker, member.id, {
            instanceId,
            workItemId: started.item.id,
            signed: null,
          })
        )
      )
    );
    console.log(
      `[settling] ${pages.map((one) => `${one.row.name}: ${one.cards.map((card) => card.id).join(", ")}`).join("; ")} to ${member.id} (${started.item.type ?? "default"}), item ${started.item.id} under ${asker.id}`
    );
    return { state: "running" };
  };

  /**
   * An agent member's cards: handed to its warm session for the project
   * when it has one, else one run of its type with every card waiting on
   * it there.
   */
  const toAgent = async (
    fleet: FleetDecides,
    member: Member,
    asker: InstanceRow,
    page: PageCards
  ): Promise<RouteState> => {
    const kept = deps.db.onProject(member.id, page.row.projectId);
    const session = warmSession(kept);
    try {
      return session
        ? await handTo(fleet, member, session, asker, page)
        : await startRun(fleet, member, asker, [page, ...stranded(page, kept)]);
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);
      console.warn(
        `[settling] ${page.row.name}: ${member.id} did not start: ${said}`
      );
      return { state: "failed", why: said.endsWith(".") ? said : `${said}.` };
    }
  };

  /**
   * Where card `card` goes now: settled here (`state`: the person's, the
   * writer's, a member already on it, or unreachable), with the ledger row
   * that records it when it changed; or, with no `state`, sent to `member`.
   */
  const sort = (
    asker: InstanceRow,
    row: ArtifactRow,
    card: DecisionCard,
    member: Member
  ): { ledger?: CardSettlingRow; state?: RouteState } => {
    const reached = reach(member, row.projectId);
    const kept = deps.db.settling(row.id, card.id);
    if (!reached.ok) {
      return {
        state: { state: "unreachable", reason: reached.reason },
        ...(kept?.signed === reached.reason
          ? {}
          : {
              ledger: rowOf(row, card, asker, "you", {
                instanceId: null,
                workItemId: null,
                signed: reached.reason,
              }),
            }),
      };
    }
    if (member.type === "you") {
      return { state: { state: "you" } };
    }
    if (member.type === "asker") {
      return {
        state: { state: "asker" },
        ...(kept?.route === "asker"
          ? {}
          : {
              ledger: rowOf(row, card, asker, "asker", {
                instanceId: asker.id,
                workItemId: null,
                signed: null,
              }),
            }),
      };
    }
    return kept?.route === member.id && onIt(deps, kept)
      ? { state: { state: "running" } }
      : {};
  };

  /** Refuses `settler` unless it wrote the card: the asker's cards are its writer's. */
  const writerOnly = (
    settler: InstanceRow,
    row: ArtifactRow,
    name: string
  ): void => {
    if (settler.id === row.instanceId || settler.id === row.madeBy) {
      return;
    }
    const writerId = row.madeBy ?? row.instanceId;
    const writer = writerId ? deps.instance(writerId) : undefined;
    throw new SettleRefusal(
      403,
      decidesWords.settleAsker(
        name,
        writer ? sessionLink(writer.id, sessionLabel(writer).name) : ""
      )
    );
  };

  /** Whether `settler` is `member`'s session for the card: the ledger's, or Caw's conversation. */
  const mayRun = (
    settler: InstanceRow,
    row: ArtifactRow,
    member: Member,
    kept: CardSettlingRow | undefined
  ): boolean => {
    if (kept?.instanceId === settler.id && kept.route === member.id) {
      return true;
    }
    return (
      member.type === "caw" &&
      !!row.projectId &&
      deps.project(row.projectId)?.conversationInstanceId === settler.id
    );
  };

  /**
   * Each open card of `page` sorted ({@link sort}), the ledger rows that
   * changed written: the cards settled where they stand, by id, and those
   * to send, by member.
   */
  const sortAll = (
    asker: InstanceRow,
    page: PageCards,
    routes: Map<string, Routed>
  ): {
    sent: Map<string, DecisionCard[]>;
    states: Map<string, RouteState>;
  } => {
    const states = new Map<string, RouteState>();
    const sent = new Map<string, DecisionCard[]>();
    const ledger: CardSettlingRow[] = [];
    for (const card of page.cards) {
      if (pickMade(card, page.state[card.id])) {
        continue;
      }
      const { member } = routes.get(card.id) as Routed;
      const sorted = sort(asker, page.row, card, member);
      if (sorted.ledger) {
        ledger.push(sorted.ledger);
      }
      if (sorted.state) {
        states.set(card.id, sorted.state);
      } else {
        sent.set(member.id, [...(sent.get(member.id) ?? []), card]);
      }
    }
    if (ledger.length > 0) {
      deps.db.putSettlings(ledger);
    }
    return { states, sent };
  };

  return {
    /**
     * The member of each of `cards` (those `asker` just wrote on page
     * `row`), by card id, as a line after its link; nothing when no card on
     * the page carries a kind. A card whose member can be reached and isn't
     * on it yet is sent to it; one whose member can't comes to the person,
     * signed with why.
     */
    routed: async (
      asker: InstanceRow,
      row: ArtifactRow,
      cards: DecisionCard[],
      all: DecisionCard[],
      state: Record<string, ChoiceEntry>
    ): Promise<Record<string, string>> => {
      if (!all.some((card) => card.kind !== null) || cards.length === 0) {
        return {};
      }
      const fleet = deps.db.fleet();
      const routes = new Map<string, Routed>();
      let problems: string[] = [];
      for (const card of cards) {
        const read = await routeOf(fleet, row, card);
        routes.set(card.id, read);
        ({ problems } = read);
      }
      const page = { row, cards, all, state };
      const { states, sent } = sortAll(asker, page, routes);
      for (const [id, handed] of sent) {
        const member = memberOf(fleet, id) as Member;
        const one = { ...page, cards: handed };
        const went =
          member.type === "caw"
            ? await toCaw(fleet, asker, one)
            : await toAgent(fleet, member, asker, one);
        for (const card of handed) {
          states.set(card.id, went);
        }
      }
      const said =
        problems.length > 0
          ? ` ${decidesWords.fileProblems(problems.join(" "))}`
          : "";
      return Object.fromEntries(
        cards.map((card) => {
          const { member, where } = routes.get(card.id) as Routed;
          const link = decisionLink(row.id, card.id, card.question);
          const now = states.get(card.id);
          return [
            card.id,
            now
              ? `${link}: ${routeLine(kindName(fleet, card.kind), member.name, where, now)}${said}`
              : `${link}: decided already.`,
          ];
        })
      );
    },

    /**
     * The member `settler` settles card `card` of page `row` for, and how
     * it signs; refused in one sentence when it may not: a card the person
     * decides is his alone; the asker's is its writer's; Caw's is the
     * conversation's; an agent member's, its session's in the ledger.
     */
    settler: async (
      settler: InstanceRow,
      row: ArtifactRow,
      card: DecisionCard
    ): Promise<
      Pick<SettledBy, "by" | "name" | "runs"> & { member: Member }
    > => {
      const fleet = deps.db.fleet();
      const { member, where } = await routeOf(fleet, row, card);
      const name = kindName(fleet, card.kind);
      const kept = deps.db.settling(row.id, card.id);
      const signed = {
        member,
        by: member.id,
        name: member.name,
        runs: runsOf(member, settler, row.projectId),
      };
      if (member.type === "you" || kept?.route === "you") {
        throw new SettleRefusal(
          403,
          decidesWords.settleYours(name, decidesWords.here(where === "project"))
        );
      }
      if (member.type === "asker") {
        writerOnly(settler, row, name);
        return signed;
      }
      if (mayRun(settler, row, member, kept)) {
        return signed;
      }
      throw new SettleRefusal(
        403,
        decidesWords.settleMember(name, member.name)
      );
    },

    /** Card `card` of `row` was settled by `member`: the ledger stamps it, and he hears of it as the member says. */
    settled: (
      row: ArtifactRow,
      card: DecisionCard,
      member: Member,
      answer: { label: string; why: string }
    ): void => {
      deps.db.markSettled(row.id, card.id, new Date());
      if (member.hear === "each") {
        deps.heard({
          artifactId: row.id,
          card: card.id,
          member: member.name,
          projectId: row.projectId,
          question: card.question,
          label: answer.label,
          why: answer.why,
        });
      }
    },
  };
};
