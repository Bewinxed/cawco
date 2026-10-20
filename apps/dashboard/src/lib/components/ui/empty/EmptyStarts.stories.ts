/**
 * The empty states The Empty Starts Work Rule (DESIGN.md) gave their one
 * action (Component Story Format 3, live components): each as its surface
 * draws it, through EmptyStarts' seam, with the words that surface uses.
 * A fleet ask names the New Session form's agent; a session's own, its own
 * agent; a project's, Caw. Where the work can't start, why stands in its
 * own line over the way by hand. Every action is words alone, the block's
 * mark its one glyph (DESIGN.md, Empty). The meta's args are every story's;
 * a story's own args are what it changes.
 */
import EmptyStarts from "./EmptyStarts.svelte";

/** A name three times the usual length, for the narrow frames. */
const LONG =
  "northwind-logistics-customer-onboarding-portal-quarterly-release-train";

export default {
  title: "Empty/Empty starts work",
  component: EmptyStarts,
  args: { site: "hooks", canStart: true },
};

/** Configure › Hooks, nothing yet: ask a new session for a hook. */
export const Hooks = { args: { site: "hooks" } };

/** Configure › Hooks with no machine online: the line offers the starters alone, and why no ask stands. */
export const HooksNoMachine = { args: { site: "hooks", canStart: false } };

/** Configure › Rules, nothing yet: ask a new session for a rule. */
export const Rules = { args: { site: "rules" } };

/** Configure › Rules with no machine online: the starters alone, and why. */
export const RulesNoMachine = { args: { site: "rules", canStart: false } };

/** Configure › Rules filtered to Waiting on an answer, none waiting: remove the filter. */
export const RulesNoneWaiting = { args: { site: "rules-waiting" } };

/** Configure › MCP servers, none yet: ask a new session for a server. */
export const McpServers = { args: { site: "mcp" } };

/** Configure › MCP servers with no machine online: why, and Add server by hand. */
export const McpServersNoMachine = { args: { site: "mcp", canStart: false } };

/** Configure › Memory files, a filter nothing matches: remove the filter. */
export const MemoryNoMatch = { args: { site: "memory-no-match" } };

/** Configure › Delegate types, the fleet's all deleted: ask a new session for some. */
export const DelegateTypes = { args: { site: "delegate-types" } };

/** Configure › Delegate types with no machine online: why, and New delegate type by hand. */
export const DelegateTypesNoMachine = {
  args: { site: "delegate-types", canStart: false },
};

/** Configure › Command-line tools, a hub with no catalog: why no session can fill it, and Updates. */
export const CliTools = { args: { site: "cli-tools" } };

/** A session nothing has been said in: its title, and the ask to its own agent alone. */
export const SessionBlank = { args: { site: "session-blank" } };

/** An OpenCode session nothing has been said in: the ask names OpenCode. */
export const SessionBlankOpenCode = {
  args: { site: "session-blank", harness: "opencode" },
};

/** A transcript with no messages: ask its own agent about its folder. */
export const TranscriptEmpty = { args: { site: "transcript-empty" } };

/** A project's Routines with Caw unable to start: what the page is for, then why, over Add machine. */
export const RoutinesCawAway = { args: { site: "routines-caw-away" } };

/** Event sources, none yet: ask Caw for one. */
export const EventSources = { args: { site: "sources" } };

/** Event sources with Caw unable to start: why, and Add machine by hand. */
export const EventSourcesCawAway = {
  args: { site: "sources", canStart: false },
};

/** A view link to a view the project doesn't have: ask Caw for it. */
export const ViewMissing = { args: { site: "view-missing" } };

/** The project's views couldn't be read: retry. */
export const ViewUnread = { args: { site: "view-unread" } };

/** On a phone, a view link with a long name: the line wraps, the action holds. */
export const ViewMissingPhone = {
  args: { site: "view-missing", view: LONG },
  parameters: { viewport: "phone" },
};

/** On a phone, a memory filter with a long name nothing matches. */
export const MemoryNoMatchPhone = {
  args: { site: "memory-no-match", filter: LONG },
  parameters: { viewport: "phone" },
};

/** On a phone, Delegate types with no machine online. */
export const DelegateTypesNoMachinePhone = {
  args: { site: "delegate-types", canStart: false },
  parameters: { viewport: "phone" },
};

/** On a phone, a project's Routines with a long name and Caw unable to start. */
export const RoutinesCawAwayPhone = {
  args: { site: "routines-caw-away", project: LONG },
  parameters: { viewport: "phone" },
};

/** On a phone, Event sources with Caw unable to start. */
export const EventSourcesCawAwayPhone = {
  args: { site: "sources", canStart: false },
  parameters: { viewport: "phone" },
};

/** At 1440, Configure › MCP servers, none yet. */
export const McpServersDesk = {
  args: { site: "mcp" },
  parameters: { viewport: "desk" },
};
