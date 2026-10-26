/**
 * Who decides, at the hub (PRD §5.8, core decides.ts): each card a session
 * writes is routed by the project's table (decides-file.ts), the route said
 * back to it with the tool's answer, one line per card ({@link
 * Settling.routed}). A card routed to an advisor or to common practice is
 * handed to a delegate the hub starts for it: the advisor's type from the
 * table, or `research` for common practice, run `lands: none` under the
 * session that wrote the card, through the same work item start dispatch
 * uses (work-items.ts `start`). The cards of one page routed the same way
 * go as one run.
 *
 * Who may `settle` a card ({@link Settling.settler}): on a route to the
 * agent, the session that wrote it; on a route to an advisor or common
 * practice, only the delegate the hub started for it (`card_settlings`);
 * on a route to the person, no one. The pick itself is written by
 * artifacts/service.ts `settle`, into the page's doc, as the person's is.
 */
import type { InstanceRow } from "@cawco/core";
import type { ChoiceEntry } from "@cawco/core/choices";
import {
  DECISION_KIND_WORDS,
  type DecidesRoute,
  type DecisionKind,
  PRACTICE_TYPE,
  routeLine,
  settleYours,
} from "@cawco/core/decides";
import { type DecisionCard, pickMade } from "@cawco/core/decisions";
import { decisionLink, sessionLink } from "@cawco/core/references";
import type { ArtifactRow } from "./db/artifacts";
import type { DecidesDb } from "./db/decides";
import { decidesTable, SettleRefusal } from "./decides-file";
import { sessionLabel } from "./labels";
import {
  SESSION_TITLE_MAX,
  type WorkItemRequest,
  type WorkItemStart,
} from "./work-items";

/** What settling reads and starts through. */
export interface SettlingDeps {
  readonly db: DecidesDb;
  readonly instance: (id: string) => InstanceRow | undefined;
  /** Whether work item `id` is still starting or running. */
  readonly live: (workItemId: string) => boolean;
  /** Files and spawns a work item (work-items.ts `start`): what dispatch starts an attempt through. */
  readonly start: (request: WorkItemRequest) => Promise<WorkItemStart>;
}

/** A card's route on its page, and where the route came from. */
interface Routed {
  route: DecidesRoute;
  where: "project" | "fleet";
}

/** A route a delegate settles. */
type Handed = Extract<DecidesRoute, "advisor" | "practice">;

const kindName = (kind: DecisionKind | null): string =>
  kind ? DECISION_KIND_WORDS[kind].name : "A card with no kind";

/** One option of a card, as the delegate reads it. */
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

/**
 * The delegate's brief: the cards it settles (question, why, options with
 * Gets, Costs and Builds), the page's other cards for context, and how it
 * settles each.
 */
const briefOf = (
  route: Handed,
  row: ArtifactRow,
  asker: InstanceRow,
  cards: DecisionCard[],
  all: DecisionCard[],
  state: Record<string, ChoiceEntry>
): string => {
  const who = route === "advisor" ? "an advisor" : "common practice";
  const others = all.filter((card) => !cards.includes(card));
  return [
    `You settle ${cards.length === 1 ? "a decision card" : `${cards.length} decision cards`} on the page “${row.name}” for ${sessionLink(asker.id, sessionLabel(asker).name)}, which wrote ${cards.length === 1 ? "it" : "them"}. The project's Who decides sends ${[...new Set(cards.map((card) => kindName(card.kind)))].join(" and ")} to ${who}: you pick for the person, who can pick again later.`,
    ...cards.map((card) =>
      [
        `## ${card.question}`,
        `Settle with card: "${row.id}#${card.id}"`,
        card.kind
          ? `Kind: ${kindName(card.kind)} (${DECISION_KIND_WORDS[card.kind].example}).`
          : "",
        card.why ? `The writer's why: ${card.why}` : "",
        "Options:",
        ...optionLines(card),
      ]
        .filter(Boolean)
        .join("\n")
    ),
    ...(others.length > 0
      ? [
          `## The page's other cards, for context\n${others
            .map(
              (card) =>
                `- ${card.question}: ${pickMade(card, state[card.id]) ? `picked ${state[card.id]?.options.join(", ")}` : "open"}`
            )
            .join("\n")}`,
        ]
      : []),
    [
      "## How",
      route === "practice"
        ? "Find what well-run projects and the tools' own docs do for each question, from current sources on the web, and pick the option that matches it."
        : "Read what each question needs (the code, the docs, the brief's facts) and pick the option that best serves the person's product.",
      `Call settle once per card: { card, option, why, sources }. why is one sentence naming the fact that decides it. sources are the links or repository paths it rests on${route === "practice" ? "; common practice names at least one https link" : ""}.`,
      "Change no file: your work lands nothing. Then call finish_item with each card's pick and why.",
    ].join("\n"),
  ].join("\n\n");
};

export const createSettling = (deps: SettlingDeps) => {
  /** Card `card`'s route on page `row`. */
  const routeOf = async (
    row: ArtifactRow,
    card: DecisionCard
  ): Promise<Routed & { advisor: string; problems: string[] }> => {
    const table = await decidesTable(row.projectId, deps.db.fleet());
    return {
      route: card.kind ? table.routes[card.kind] : "you",
      where: row.projectId ? "project" : "fleet",
      advisor: table.advisor,
      problems: table.problems,
    };
  };

  /** Whether the hub's delegate for card `card` of `row` is still on it. */
  const onIt = (row: ArtifactRow, card: string): boolean => {
    const kept = deps.db.settling(row.id, card);
    return !!kept && deps.live(kept.workItemId);
  };

  /** One run for `cards`, routed `route`: started under `asker`, its cards kept as its. */
  const handOff = async (
    route: Handed,
    advisor: string,
    asker: InstanceRow,
    row: ArtifactRow,
    cards: DecisionCard[],
    all: DecisionCard[],
    state: Record<string, ChoiceEntry>
  ): Promise<{ failed: string } | "started"> => {
    const first = cards[0]?.question ?? row.name;
    const title = `Settle: ${first}`;
    try {
      const started = await deps.start({
        parentInstanceId: asker.id,
        prompt: briefOf(route, row, asker, cards, all, state),
        title:
          title.length > SESSION_TITLE_MAX
            ? `${title.slice(0, SESSION_TITLE_MAX - 1)}…`
            : title,
        type: route === "advisor" ? advisor : PRACTICE_TYPE,
        lands: "none",
        settlesCards: true,
      });
      const { instanceId } = started.item;
      if (!instanceId) {
        return { failed: "the hub started no session for it." };
      }
      deps.db.putSettlings(
        cards.map((card) => ({
          artifactId: row.id,
          card: card.id,
          route,
          instanceId,
          workItemId: started.item.id,
          askedBy: asker.id,
          createdAt: new Date(),
        }))
      );
      console.log(
        `[settling] ${row.name}: ${cards.map((card) => card.id).join(", ")} to ${route} (${started.item.type ?? "default"}), item ${started.item.id} under ${asker.id}`
      );
      return "started";
    } catch (error) {
      const said = error instanceof Error ? error.message : String(error);
      console.warn(`[settling] ${row.name}: ${route} did not start: ${said}`);
      return { failed: said.endsWith(".") ? said : `${said}.` };
    }
  };

  return {
    /**
     * The route of each of `cards` (those `asker` just wrote on page `row`),
     * by card id, as a line after its link; nothing when no card on the page
     * carries a kind. A card routed to an advisor or common practice, open
     * and with no delegate on it, is handed to one: one run per route.
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
      const routes = new Map<string, Routed>();
      let advisor = "";
      let problems: string[] = [];
      for (const card of cards) {
        const read = await routeOf(row, card);
        routes.set(card.id, read);
        ({ advisor, problems } = read);
      }
      const runs = new Map<Handed, DecisionCard[]>();
      for (const card of cards) {
        const route = routes.get(card.id)?.route;
        if (
          (route === "advisor" || route === "practice") &&
          !pickMade(card, state[card.id]) &&
          !onIt(row, card.id)
        ) {
          runs.set(route, [...(runs.get(route) ?? []), card]);
        }
      }
      const started = new Map<Handed, { failed: string } | "started">();
      for (const [route, handed] of runs) {
        started.set(
          route,
          await handOff(route, advisor, asker, row, handed, all, state)
        );
      }
      const said =
        problems.length > 0
          ? ` decides.md doesn't read: ${problems.join(" ")}`
          : "";
      return Object.fromEntries(
        cards.map((card) => {
          const { route, where } = routes.get(card.id) as Routed;
          const link = decisionLink(row.id, card.id, card.question);
          if (pickMade(card, state[card.id])) {
            return [card.id, `${link}: decided already.`];
          }
          const run =
            route === "advisor" || route === "practice"
              ? (started.get(route) ?? "running")
              : null;
          return [
            card.id,
            `${link}: ${routeLine(card.kind, route, where, run)}${said}`,
          ];
        })
      );
    },

    /**
     * The route `settler` settles card `card` of page `row` on; refused in
     * one sentence when it may not: a card routed to the person is his
     * alone; one routed to the agent is its writer's; one routed to an
     * advisor or common practice, the hub's delegate's for it.
     */
    settler: async (
      settler: InstanceRow,
      row: ArtifactRow,
      card: DecisionCard
    ): Promise<Exclude<DecidesRoute, "you">> => {
      const { route, where } = await routeOf(row, card);
      const name = kindName(card.kind);
      if (route === "you") {
        throw new SettleRefusal(403, settleYours(card.kind, where));
      }
      if (route === "agent") {
        if (settler.id === row.instanceId || settler.id === row.madeBy) {
          return route;
        }
        const writerId = row.madeBy ?? row.instanceId;
        const writer = writerId ? deps.instance(writerId) : undefined;
        throw new SettleRefusal(
          403,
          `${name} is the agent's to decide here, and only the session that wrote the card settles it${writer ? `: ${sessionLink(writer.id, sessionLabel(writer).name)}` : ""}.`
        );
      }
      const kept = deps.db.settling(row.id, card.id);
      if (kept?.instanceId === settler.id && kept.route === route) {
        return route;
      }
      throw new SettleRefusal(
        403,
        `${name} goes to ${route === "advisor" ? "an advisor" : "common practice"} here: only the delegate the hub started for this card settles it; wait on the card.`
      );
    },
  };
};

type Settling = ReturnType<typeof createSettling>;
