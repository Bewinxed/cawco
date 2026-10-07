/**
 * A new project's setup (Projects spec §5.6, §5.8): what Caw is woken with
 * when New project (or an accepted project offer) makes a project with Caw.
 * He shows the person one decision page, `decisions/setup/`, and on their
 * picks writes the project's files; the dashboard applies the fleet's
 * choices and adds the place they picked when they send.
 *
 * The page's cards, by their ids:
 * - `fleet-delegates`, `fleet-todos`: the fleet's two choices, asked once,
 *   while nobody has set them (`supervisor_config.choices_set_at`).
 * - `stages`: the template's stages, names editable (`cawco.set`).
 * - `delegates`: delegate types suggested for the template, several picks.
 * - `place`: the machine and folder its work happens in (`cawco.pickPlace`).
 */
import { type StagesTemplate, templateText } from "./stages";

/** The delegate types a template's work suggests, the ones its stages run first. */
export const TEMPLATE_DELEGATES: Record<StagesTemplate, readonly string[]> = {
  code: ["implementer", "reviewer"],
  launch: ["writer", "designer"],
  seo: ["seo", "writer"],
  brand: ["brand"],
  design: ["explorer", "builder"],
  social: ["writer"],
  outreach: ["outreach"],
};

/** The decision page's name, and its folder in the project's. */
export const SETUP_PAGE = "setup";

export interface SetupAsk {
  /** Whether the fleet's two choices were never set, so the page asks for them. */
  askFleet: boolean;
  /** Where the project came from: New project's prompt, or a session's offer. */
  from: "prompt" | "offer";
  projectName: string;
  /** The template it was made from; the code template stands in when none. */
  template: StagesTemplate | null;
  threadId: string;
}

const fleetCards = `- \`fleet-delegates\`: "Delegates instead of subagents" — sessions hand work to CawCo's delegates rather than their harness's own subagents. Options \`on\` (recommended) and \`off\`.
- \`fleet-todos\`: "CawCo's to-dos instead of each harness's list" — sessions keep their plan in CawCo rather than their harness's own list and plan mode. Options \`on\` (recommended) and \`off\`.
These two are the fleet's, asked once: say so on the cards.`;

/** What Caw reads when a project is made for him to set up. */
export const setupEvent = (ask: SetupAsk): string => {
  const template = ask.template ?? "code";
  const types = TEMPLATE_DELEGATES[template];
  return [
    `Event setup: the person just made the project “${ask.projectName}”${
      ask.from === "prompt"
        ? ", and their words are the first message of the Setup thread"
        : " from a session's offer, noted in the Setup thread"
    } (thread ${ask.threadId}). ${ask.template ? `They picked the ${ask.template} template.` : "They picked no template; start from the code template unless their words say otherwise."} Set the project up with them.`,
    `1. Load the decision-page skill and build one decision page named "${SETUP_PAGE}". You have no shell or file tools: write decisions/${SETUP_PAGE}/page.html into the project's folder with folder_write (start from the skill's kit/page.html; read it with your Read tool), then call page_show({ page: "${SETUP_PAGE}" }). Its cards, with exactly these ids:`,
    [
      ...(ask.askFleet ? [fleetCards] : []),
      `- \`stages\`: the project's stages, from the ${template} template below, adjusted to their words. Show each stage's name in an editable text field and store the list with \`cawco.set("stages", [{ "name": …, "kind": … }, …])\` on every edit (kinds stay as the template has them).`,
      `- \`delegates\`: the delegate types to set up, several picks (\`data-cawco-multiple\`), each option a type: ${types.map((type) => `\`${type}\``).join(", ")}${types.length > 1 ? ", all recommended" : ", recommended"}; add one only when their words call for it.`,
      `- \`place\`: where its work happens — a machine and a folder. One button that calls \`cawco.pickPlace()\`: CawCo asks the person for the machine and folder and stores the pick under \`place\`. Show the picked folder from \`cawco.on("picks", …)\`.`,
      "No routines, relays or other cards.",
    ].join("\n"),
    `The ${template} template's stages.md:\n\n\`\`\`\n${templateText(template)}\`\`\``,
    `2. End your turn. When the person sends their picks you get one message; page_choices({ page: "${SETUP_PAGE}" }) has them in full. CawCo has then already applied the fleet's choices and added the place they picked; do not write those. Write, with folder_write: stages.md (the template's block with the stage names they kept; it must read cleanly, or folder_write refuses it with the reason), delegates/<type>.md for each type they picked (front matter: harness, model, effort, role, lands; the body is the type's brief, from their words), and AGENTS.md (what the project is and how its work is done, from their words).`,
    `3. Answer in thread ${ask.threadId} with thread_reply: one or two sentences on what you set up, with every file you wrote in \`files\`. The person opens the board from there.`,
  ].join("\n\n");
};
