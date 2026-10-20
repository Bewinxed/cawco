/**
 * A new project's setup (Projects spec §5.6, §5.8): what Caw is woken with
 * when New project (or an accepted project offer) makes a project with Caw.
 * He shows the person one decision page, `decisions/setup/`, and on their
 * picks writes the project's files; the hub applies the fleet's choices and
 * adds the place they picked when they send ({@link applySetupPicks}).
 *
 * The page's cards, by their ids:
 * - `fleet-delegates`, `fleet-todos`: the fleet's two choices, asked once,
 *   while nobody has set them (`supervisor_config.choices_set_at`).
 * - `fleet-upstream`: whether agents may post to other people's
 *   repositories (core upstream-guard.ts), asked once, while nobody has
 *   answered it (`upstream_settings`).
 * - `fleet-relay`: the fleet's stream relay (fleet-choices.ts `relayCard`),
 *   Set up or Later, offered once, while the fleet has none and nobody has
 *   answered it.
 * - `stages`: the template's stages, names editable (`cawco.set`).
 * - `delegates`: delegate types the template suggests beyond the ones its
 *   stages run (already written with it), several picks; none, no card.
 * - `place`: the machine and folder its work happens in (`cawco.pickPlace`,
 *   stored as `{ machineId, label, path }`).
 */
import type { ChoiceEntry } from "@cawco/core";
import {
  UPSTREAM_POSTS,
  UPSTREAM_WORDS,
  type UpstreamPosts,
} from "@cawco/core/upstream-guard";
import { relayCard, relayPickOf } from "./fleet-choices";
import { type StagesTemplate, templateText } from "./stages";
import { templateTypes } from "./template-types";

/**
 * The delegate types a template's work suggests beyond the ones it supplies
 * (its stages run them, or its skills file tasks with them): those are
 * written with the template (template-types.ts), never picked.
 */
export const TEMPLATE_DELEGATES: Record<StagesTemplate, readonly string[]> = {
  code: ["implementer", "reviewer"],
  launch: [],
  seo: [],
  brand: [],
  design: [],
  social: [],
  outreach: ["outreach"],
};

/** The decision page's name, and its folder in the project's. */
export const SETUP_PAGE = "setup";

/** What a sent setup page changes beyond the project's files, which Caw writes. */
export interface SetupApply {
  /** Sets the fleet's choices named (fleet-choices.ts `setFleetChoices`). */
  fleet: (choices: {
    delegates?: boolean;
    todos?: boolean;
    upstream?: UpstreamPosts;
  }) => void;
  /** Adds the place picked as the project's checkout; a refusal throws. */
  place: (
    projectId: string,
    place: { machineId: string; path: string }
  ) => Promise<void>;
  /**
   * The relay card's answer: Set up opens the relay's journey (its row
   * stands in Needs you), Later answers the card. Never refuses the page.
   */
  relay: (pick: "set-up" | "later") => void;
}

const onOff = (
  state: Record<string, ChoiceEntry>,
  id: string
): boolean | undefined => {
  const [option] = state[id]?.options ?? [];
  if (option === "on") {
    return true;
  }
  return option === "off" ? false : undefined;
};

const placeOf = (
  state: Record<string, ChoiceEntry>
): { machineId: string; path: string } | undefined => {
  const entry: ChoiceEntry | undefined = state.place;
  const value = entry?.value as
    { machineId?: unknown; path?: unknown } | null | undefined;
  return typeof value?.machineId === "string" &&
    typeof value.path === "string" &&
    value.path.startsWith("/")
    ? { machineId: value.machineId, path: value.path }
    : undefined;
};

/**
 * When the person sends a project's setup page, by any path (the page's own
 * `cawco.send`, the panel's Send): the fleet's choices (`fleet-delegates`,
 * `fleet-todos`, `on` or `off`) and the place picked (`place`, from
 * `cawco.pickPlace`, added as the project's checkout) are applied before
 * Caw hears the picks, so he writes only the project's files. Any other
 * artifact is left alone.
 */
export const applySetupPicks = async (
  artifact: { kind: string; name: string },
  projectId: string | null | undefined,
  state: Record<string, ChoiceEntry>,
  apply: SetupApply
): Promise<void> => {
  if (!projectId || artifact.kind !== "page" || artifact.name !== SETUP_PAGE) {
    return;
  }
  const delegates = onOff(state, "fleet-delegates");
  const todos = onOff(state, "fleet-todos");
  const asked: ChoiceEntry | undefined = state["fleet-upstream"];
  const [picked] = asked?.options ?? [];
  const upstream = UPSTREAM_POSTS.find((answer) => answer === picked);
  if (
    delegates !== undefined ||
    todos !== undefined ||
    upstream !== undefined
  ) {
    apply.fleet({
      ...(delegates === undefined ? {} : { delegates }),
      ...(todos === undefined ? {} : { todos }),
      ...(upstream === undefined ? {} : { upstream }),
    });
  }
  const relay = relayPickOf(state);
  if (relay) {
    apply.relay(relay);
  }
  const place = placeOf(state);
  if (place) {
    await apply.place(projectId, place);
  }
};

/** The relay card as it is offered: the domain the person last reached CawCo through, which makes Set up the recommended option. */
export interface RelayOffer {
  domain: string | null;
}

/**
 * The answered parts of a setup the person can ask to change when they ask
 * Caw to set the project up again (caw.ts `project_setup`): each is asked
 * again though it was answered. `fleet` is the two fleet choices.
 */
export const SETUP_PARTS = ["fleet", "upstream", "relay", "place"] as const;
export type SetupPart = (typeof SETUP_PARTS)[number];

export interface SetupAsk {
  /** Whether the fleet's two choices were never set, so the page asks for them. */
  askFleet: boolean;
  /** Whether the fleet's upstream choice was never answered, so the page asks it. */
  askUpstream: boolean;
  /**
   * Why it is set up: New project's prompt, a session's offer, or the
   * person's ask in a thread of a project that has one (`project_setup`).
   */
  from: "prompt" | "offer" | "ask";
  /** It has its checkout already (made from a folder): no card asks for its place. */
  placed: boolean;
  projectName: string;
  /** The relay card, while it is to be asked; null when it is not. */
  relay: RelayOffer | null;
  /**
   * The project's stages.md as it stands, set up again on the person's ask:
   * the stages card starts from it rather than from a template.
   */
  stages?: string;
  /** The template it was made from; the code template stands in when none. */
  template: StagesTemplate | null;
  threadId: string;
}

/** The opening paragraph: why Caw is setting the project up, and from what. */
const openingOf = (ask: SetupAsk): string => {
  if (ask.from === "ask") {
    return `Setup: the person asked you to set the project “${ask.projectName}” up in thread ${ask.threadId}. ${ask.stages ? "Its stages.md as it stands is below." : "It has no stages.md yet."} Set the project up with them in that thread.`;
  }
  return `Event setup: the person just made the project “${ask.projectName}”${
    ask.from === "prompt"
      ? ", and their words are the first message of the Setup thread"
      : " from a session's offer, noted in the Setup thread"
  } (thread ${ask.threadId}). ${ask.template ? `They picked the ${ask.template} template.` : "They picked no template; start from the code template unless their words say otherwise."} Set the project up with them.`;
};

const fleetCards = `- \`fleet-delegates\`: "Delegates instead of subagents" — sessions hand work to CawCo's delegates rather than their harness's own subagents. Options \`on\` labelled "Use delegates" (recommended) and \`off\` labelled "Keep subagents".
- \`fleet-todos\`: "CawCo's to-dos instead of each harness's list" — sessions keep their plan in CawCo rather than their harness's own list and plan mode. Options \`on\` labelled "Use CawCo's to-dos" (recommended) and \`off\` labelled "Keep each harness's list".
These two are the fleet's, asked once: say so on the cards.`;

/** The onboarding step's words, the dashboard's own step and this card alike (WORDS.md `upstream`). */
const upstreamCard = `- \`fleet-upstream\`: "Other people's repositories" — ${UPSTREAM_WORDS.risk} Options \`off\` labelled "${UPSTREAM_WORDS.keepOff}" (recommended), \`ask\` labelled "${UPSTREAM_WORDS.ask}" (each post waits for the person's approval) and \`on\` labelled "${UPSTREAM_WORDS.allow}". It is the fleet's, asked once, and each project can change it in its settings: say so on the card.`;

/**
 * What Caw reads to set a project up: woken with it when a project is made
 * for him, or answered it by `project_setup` when the person asks.
 */
export const setupEvent = (ask: SetupAsk): string => {
  const template = ask.template ?? "code";
  const stagesFrom = ask.stages
    ? "from its stages.md below"
    : `from the ${template} template below`;
  const stagesText = ask.stages
    ? `Its stages.md:\n\n\`\`\`\n${ask.stages.trimEnd()}\n\`\`\``
    : `The ${template} template's stages.md:\n\n\`\`\`\n${templateText(template)}\`\`\``;
  const types = TEMPLATE_DELEGATES[template];
  const own = templateTypes(template).map((type) => `\`${type}\``);
  const picked =
    types.length > 0
      ? " Write delegates/<type>.md for each type they picked (front matter: harness, model, effort, role, lands; the body is the type's brief, from their words; each goes to them as a proposal and is committed once they approve it)."
      : "";
  const kept =
    own.length > 0
      ? ` The template's own types (${own.join(", ")}) are in delegates/ already, written as the project was made: its stages and skills run them by those names, so keep the names, and rewrite a type's brief (the body under its front matter) with folder_write only where their words change the work; the rewrite goes to them as a proposal too.`
      : "";
  return [
    openingOf(ask),
    `1. Load the decision-page skill and build one decision page named "${SETUP_PAGE}" as HTML, the skill's form for picks that are not options: the stage names the person edits and the place they pick with \`cawco.pickPlace\`. The page lives in the project's folder on the hub, which your own edit tools do not write: write decisions/${SETUP_PAGE}/page.html there with folder_write (start from the skill's kit/page.html; read it with your Read tool), then call artifact_create({ kind: "page", name: "${SETUP_PAGE}", does: "pick", ask: "Pick how this project is set up" }). Its cards, with exactly these ids:`,
    [
      ...(ask.askFleet ? [fleetCards] : []),
      ...(ask.askUpstream ? [upstreamCard] : []),
      ...(ask.relay ? [relayCard(ask.relay.domain)] : []),
      `- \`stages\`: the project's stages, ${stagesFrom}, adjusted to their words. Show each stage's name in an editable text field and store the list with \`cawco.set("stages", [{ "name": …, "kind": … }, …])\` on every edit (kinds stay as the template has them; show each kind in words: to do, active, waiting, you, done, dropped).`,
      ...(types.length > 0
        ? [
            `- \`delegates\`: the delegate types to set up, several picks (\`data-cawco-multiple\`), each option a type with one line on the work it takes: ${types.map((type) => `\`${type}\``).join(", ")}${types.length > 1 ? ", all recommended" : ", recommended"}; add one only when their words call for it.`,
          ]
        : []),
      ...(ask.placed
        ? []
        : [
            `- \`place\`: where its work happens — a machine and a folder. One button that calls \`cawco.pickPlace()\`: CawCo asks the person for the machine and folder and stores the pick under \`place\` as \`{ machineId, label, path }\`, \`label\` being the name CawCo shows the machine by. Once picked, the card reads "<label> — <path>", from \`cawco.on("picks", …)\` (\`picks.place.value\`).`,
          ]),
      ask.placed
        ? "It was made from a folder, which is its place already: no card asks where its work happens. No routines, webhook relays or other cards."
        : "No routines, webhook relays or other cards.",
      'Write the page in CawCo\'s voice (WORDS.md): sentence case, no "I", options named for what they do (never Yes or No), no folder paths inside sentences.',
    ].join("\n"),
    stagesText,
    `2. End your turn. When the person sends their picks you hear that the page has new responses; artifact_read() has them in full. CawCo has then already applied the fleet's choices and added the place they picked; do not write those. Write, with folder_write: stages.md (${ask.stages ? "its block" : "the template's block"} with the stage names they kept; it must read cleanly, or folder_write refuses it with the reason).${picked}${kept} AGENTS.md is the person's, so propose it with memory_propose({ path: "AGENTS.md", content, why, ask: true }): what the project is and how its work is done, from their words, in CawCo's voice, no folder or file paths inside its sentences. They approve it from Needs you.`,
    `3. Answer in thread ${ask.threadId} with thread_reply: one or two sentences on what you set up, naming no paths (the files are shown from \`files\`), with every file you wrote in \`files\`, and that AGENTS.md waits for their approval. The person opens the board from there.`,
  ].join("\n\n");
};
