/**
 * Every CawCo tool a session is listed, by name, and the arguments it takes,
 * read off the zod schemas the tools are defined with ({@link Takes}, on what
 * mcp-tool.ts's `tool` and `toolOn` return). A script calling the tool door
 * (`POST /api/delegation/call/:instanceId`) holds its call to them by a
 * type-only import; a tool's answer goes by no type here.
 */
import type { ReadonlyDeep } from "@cawco/core/sending";
import type { Actions } from "./actions";
import type { adminTools } from "./admin-tools";
import type { Asks } from "./asks";
import type { BrowserAsks } from "./browser-tools";
import type { Caw } from "./caw";
import type { ConnectAsks } from "./connect-asks";
import type { handoffTools } from "./delegation-tools";
import type { FleetWatch } from "./fleet-watch";
import type { createHubTools } from "./hub-tools";
import type { Ingress } from "./ingress";
import type { ResponseFormat, Takes } from "./mcp-tool";
import type { Memory } from "./memory";
import type { projectFromSessionTool } from "./project-offers";
import type { createProjectSettings } from "./project-settings";
import type { Relay } from "./relay";
import type { Routines } from "./routines";
import type { taskTools } from "./task-tools";

type Defined =
  | ReturnType<typeof handoffTools>[number]
  | ReturnType<typeof adminTools>[number]
  | ReturnType<typeof taskTools>[number]
  | ReturnType<typeof projectFromSessionTool>
  | ReturnType<typeof createProjectSettings>["definition"]
  | ReturnType<Caw["tools"]>[number]
  | ReturnType<Routines["tools"]>[number]
  | ReturnType<Ingress["tools"]>[number]
  | ReturnType<Actions["tools"]>[number]
  | ReturnType<Relay["tools"]>[number]
  | ReturnType<Memory["tools"]>[number]
  | ReturnType<FleetWatch["tools"]>[number]
  | ReturnType<ReturnType<typeof createHubTools>>[number]
  | ReturnType<BrowserAsks["tools"]>[number]
  | ReturnType<ConnectAsks["tools"]>[number]
  | ReturnType<Asks["tools"]>[number];

/** Every tool by its name, and the arguments it takes. A tool whose answer has a whole record takes `response_format` too. */
export type ToolInputs = {
  [
    D in Defined as D["name"] extends infer N extends string
      ? string extends N
        ? never
        : N
      : never
  ]: D extends Takes<infer A>
    ? A & { response_format?: ResponseFormat }
    : never;
};

/** A CawCo tool, by its name. */
export type ToolName = keyof ToolInputs & string;

/** The tools that need no argument, called with none. */
export type BareTool = {
  [N in ToolName]: Record<string, never> extends ToolInputs[N] ? N : never;
}[ToolName];

/** The arguments tool `N` takes, as a caller may send them. */
export type ToolArgs<N extends ToolName> = ReadonlyDeep<ToolInputs[N]>;
