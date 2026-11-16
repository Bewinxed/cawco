/**
 * A machine's fleet config as items, each with its own id and content hash:
 * what the hub's deltas carry and what a machine acknowledges holding
 * (core fleet.ts `FleetDelta`). The hub builds the machine's config whole
 * (`MachineFleetConfig`), splits it here, and sends only the items whose
 * hash moved since the machine last acknowledged; the machine joins the
 * items it holds back into the config its harnesses converge. Server-only:
 * hashing runs on Bun.
 *
 * An item's hash leaves out `force`: a person's Overwrite rides on an item
 * the machine already holds (hub fleet-sync.ts `force`), and the same
 * content forced is not a change of content.
 */

import { z } from "zod";
import type {
  FleetMemory,
  FleetMemoryDoc,
  FleetProjectRows,
  MachineFleetConfig,
} from "./fleet";
import type { FleetHarnessConfig } from "./harness-config";
import {
  FleetHarnessConfigSchema,
  FleetHookSchema,
  FleetMarketplaceSchema,
  FleetMcpServerSchema,
  FleetMemoryDocSchema,
  FleetMemorySchema,
  FleetPlacedMemoryDocSchema,
  FleetPluginPayloadSchema,
  FleetPluginSchema,
  FleetSkillPayloadSchema,
} from "./stored-shapes";
import { unhandled } from "./unhandled";

/**
 * What a machine's harnesses converge an item into, one converge pass each.
 * A project's rows are kinds of their own (`project:<id>/<kind>:<key>`,
 * {@link projectItemOf}): the machine places each at every place of the
 * project it has.
 */
export const FLEET_ITEM_KINDS = [
  "policy",
  "mcp",
  "skill",
  "marketplace",
  "plugin",
  "pluginPayload",
  "hubOnly",
  "memory",
  "memoryDoc",
  "hook",
  "harnessConfig",
  "projectCheckout",
  "projectSkill",
  "projectMcp",
  "projectMemory",
  "projectHook",
  "projectHarnessConfig",
] as const;
export type FleetItemKind = (typeof FLEET_ITEM_KINDS)[number];

/** One item: its id (`<kind>:<key>`, or the kind alone for a singular one) and its value. */
export type FleetItems = Map<string, unknown>;

/** What follows `project:<id>/` in a project item's id, by the kind it names. */
const PROJECT_KINDS = {
  checkout: "projectCheckout",
  skill: "projectSkill",
  mcp: "projectMcp",
  memory: "projectMemory",
  hook: "projectHook",
  harnessConfig: "projectHarnessConfig",
} as const satisfies Record<string, FleetItemKind>;

/** A project item's part: what follows `project:<id>/`, before its key. */
export type ProjectPart = keyof typeof PROJECT_KINDS;

/** Whether `part` names one of a project's parts ({@link PROJECT_KINDS}). */
const isProjectPart = (part: string): part is ProjectPart =>
  Object.hasOwn(PROJECT_KINDS, part);

const PROJECT = "project:";

/** A project item's id: `project:<project id>/<part>:<key>`. */
const projectItem = (projectId: string, part: ProjectPart, key: string) =>
  `${PROJECT}${projectId}/${part}:${key}`;

/**
 * A project item's id apart: its project, its part (`skill`, `mcp`,
 * `memory`, `hook`, `harnessConfig`, `checkout`) and the key after it; none
 * for an id that names no project.
 */
export const projectItemOf = (
  id: string
): { key: string; part: ProjectPart; projectId: string } | undefined => {
  if (!id.startsWith(PROJECT)) {
    return;
  }
  const slash = id.indexOf("/", PROJECT.length);
  const colon = id.indexOf(":", slash);
  if (slash < 0 || colon < 0) {
    return;
  }
  const part = id.slice(slash + 1, colon);
  return isProjectPart(part)
    ? {
        projectId: id.slice(PROJECT.length, slash),
        part,
        key: id.slice(colon + 1),
      }
    : undefined;
};

/** A project's rows with none of either kind yet. */
export const noProjectRows = (): FleetProjectRows => ({
  checkouts: {},
  harnessConfig: [],
  hooks: [],
  mcp: [],
  memory: [],
  skills: [],
});

/** The item ids and values of a machine's config, in a stable order. */
export const fleetItemsOf = (config: MachineFleetConfig): FleetItems => {
  const items: FleetItems = new Map();
  items.set("policy", { deniedTools: config.deniedTools });
  items.set("hubOnly", config.hubOnlyMarketplaces);
  for (const row of config.mcp) {
    items.set(`mcp:${row.name}`, row);
  }
  for (const skill of config.skills) {
    items.set(`skill:${skill.name}`, skill);
  }
  for (const market of config.marketplaces) {
    items.set(`marketplace:${market.name}`, market);
  }
  for (const plugin of config.plugins) {
    items.set(`plugin:${plugin.id}`, plugin);
  }
  for (const payload of config.pluginPayloads) {
    items.set(`pluginPayload:${payload.name}@${payload.marketplace}`, payload);
  }
  if (config.memory) {
    const { docs, ...main } = config.memory;
    items.set("memory", main);
    for (const doc of docs) {
      items.set(`memoryDoc:${doc.path}`, doc);
    }
  }
  for (const hook of config.hooks) {
    items.set(`hook:${hook.id}`, hook);
  }
  for (const row of config.harnessConfig) {
    items.set(`harnessConfig:${harnessConfigKey(row)}`, row);
  }
  for (const [projectId, rows] of Object.entries(config.projects)) {
    projectItemsOf(items, projectId, rows);
  }
  return items;
};

/** One project's rows into `items`, each once, under `project:<id>/`. */
const projectItemsOf = (
  items: FleetItems,
  projectId: string,
  rows: FleetProjectRows
): void => {
  for (const [placeId, path] of Object.entries(rows.checkouts)) {
    items.set(projectItem(projectId, "checkout", placeId), { path });
  }
  for (const skill of rows.skills) {
    items.set(projectItem(projectId, "skill", skill.name), skill);
  }
  for (const row of rows.mcp) {
    items.set(projectItem(projectId, "mcp", row.name), row);
  }
  for (const doc of rows.memory) {
    items.set(projectItem(projectId, "memory", doc.path), doc);
  }
  for (const hook of rows.hooks) {
    items.set(projectItem(projectId, "hook", hook.id), hook);
  }
  for (const row of rows.harnessConfig) {
    items.set(
      projectItem(projectId, "harnessConfig", harnessConfigKey(row)),
      row
    );
  }
};

/**
 * A harness config row's report key: `<kind>:<name>`, and a placed copy's
 * `@<place id>` after it (core harness-config.ts).
 */
export const harnessConfigKey = (
  row: Pick<FleetHarnessConfig, "kind" | "name" | "placeId">
): string => `${row.kind}:${row.name}${row.placeId ? `@${row.placeId}` : ""}`;

/** The kind an item id names; undefined for one this build does not know (a newer build's). */
export const itemKindOf = (id: string): FleetItemKind | undefined => {
  const project = projectItemOf(id);
  if (project) {
    return PROJECT_KINDS[project.part];
  }
  const colon = id.indexOf(":");
  const named = colon < 0 ? id : id.slice(0, colon);
  return FLEET_ITEM_KINDS.find((one) => one === named);
};

/** The kind an item id names, for a reader that acts on it: one this build does not know throws, naming the item. */
export const itemKind = (id: string): FleetItemKind => {
  const kind = itemKindOf(id);
  if (kind === undefined) {
    throw new Error(`fleet item ${id} is of a kind this build does not know`);
  }
  return kind;
};

/**
 * The key a machine's report names an item under (its server, skill,
 * plugin, document, hook or setting; a project row's in the report's
 * `placed`, per place), or none for one no report names.
 */
export const reportKeyOf = (id: string): string | undefined => {
  const kind = itemKind(id);
  switch (kind) {
    case "mcp":
    case "skill":
    case "marketplace":
    case "plugin":
    case "memoryDoc":
    case "hook":
    case "harnessConfig":
      return id.slice(id.indexOf(":") + 1);
    case "projectSkill":
    case "projectMcp":
    case "projectMemory":
    case "projectHook":
    case "projectHarnessConfig":
      return projectItemOf(id)?.key;
    case "memory":
      return "";
    case "policy":
    case "hubOnly":
    case "pluginPayload":
    case "projectCheckout":
      return;
    default:
      unhandled("kind", kind);
  }
};

/** The project rows `config.projects` holds for `projectId`, made when it holds none yet. */
const rowsOf = (
  config: MachineFleetConfig,
  projectId: string
): FleetProjectRows => {
  config.projects[projectId] ??= noProjectRows();
  return config.projects[projectId];
};

/**
 * Each item kind's content as its type. An item is checked against it and
 * converged whole, as held: every key its type does not declare, at any
 * depth, is kept (`force`, which a machine sets on a forced item, and any a
 * newer hub sends).
 */
const ITEMS = {
  policy: z.object({ deniedTools: z.array(z.string()) }),
  mcp: FleetMcpServerSchema,
  skill: FleetSkillPayloadSchema,
  marketplace: FleetMarketplaceSchema,
  plugin: FleetPluginSchema,
  pluginPayload: FleetPluginPayloadSchema,
  memory: FleetMemorySchema.omit({ docs: true }),
  memoryDoc: FleetMemoryDocSchema,
  hook: FleetHookSchema,
  harnessConfig: FleetHarnessConfigSchema,
  projectCheckout: z.object({ path: z.string() }),
  placedMemoryDoc: FleetPlacedMemoryDocSchema,
};

/**
 * The hub-only marketplaces' names. A machine that holds the item forced
 * spreads the list into an object beside `force` (agent fleet-desired.ts
 * `config`): read back as the list it was, in its order.
 */
const HUB_ONLY = z.union([
  z.array(z.string()),
  z
    .looseObject({ force: z.literal(true) })
    .transform((forced) =>
      Object.entries(forced).flatMap(([key, name]) =>
        key !== "force" && typeof name === "string" ? [name] : []
      )
    ),
]);

/** Why item `id` is not its kind's content, thrown: a converge of the rest would take away what the item holds. */
const notItsContent = (id: string, error: z.ZodError): Error =>
  new Error(
    `fleet item ${id} is not its kind's content: ${z.prettifyError(error)}`
  );

/**
 * Item `id`'s content, checked as `schema`'s type and given back whole
 * ({@link ITEMS}); one that is not its type is thrown ({@link notItsContent}).
 */
const itemAs = <T>(id: string, schema: z.ZodType<T>, value: unknown): T => {
  const checked = schema.safeParse(value);
  if (!checked.success) {
    throw notItsContent(id, checked.error);
  }
  return z.custom<T>((held) => schema.safeParse(held).success).parse(value);
};

/** The hub-only marketplaces item's names ({@link HUB_ONLY}); one that is not is thrown ({@link notItsContent}). */
const hubOnlyOf = (id: string, value: unknown): string[] => {
  const read = HUB_ONLY.safeParse(value);
  if (!read.success) {
    throw notItsContent(id, read.error);
  }
  return read.data;
};

/** The config whole again, from the items a machine holds. */
export const fleetConfigOf = (items: FleetItems): MachineFleetConfig => {
  const config: MachineFleetConfig = {
    deniedTools: [],
    harnessConfig: [],
    hooks: [],
    marketplaces: [],
    mcp: [],
    memory: null,
    pluginPayloads: [],
    plugins: [],
    skills: [],
    hubOnlyMarketplaces: [],
    projects: {},
  };
  const docs: FleetMemoryDoc[] = [];
  let main: Omit<FleetMemory, "docs"> | undefined;
  for (const [id, value] of items) {
    const kind = itemKind(id);
    const projectId = projectItemOf(id)?.projectId ?? "";
    switch (kind) {
      case "policy":
        config.deniedTools = itemAs(id, ITEMS.policy, value).deniedTools;
        break;
      case "hubOnly":
        config.hubOnlyMarketplaces = hubOnlyOf(id, value);
        break;
      case "mcp":
        config.mcp.push(itemAs(id, ITEMS.mcp, value));
        break;
      case "skill":
        config.skills.push(itemAs(id, ITEMS.skill, value));
        break;
      case "marketplace":
        config.marketplaces.push(itemAs(id, ITEMS.marketplace, value));
        break;
      case "plugin":
        config.plugins.push(itemAs(id, ITEMS.plugin, value));
        break;
      case "pluginPayload":
        config.pluginPayloads.push(itemAs(id, ITEMS.pluginPayload, value));
        break;
      case "memory":
        main = itemAs(id, ITEMS.memory, value);
        break;
      case "memoryDoc":
        docs.push(itemAs(id, ITEMS.memoryDoc, value));
        break;
      case "hook":
        config.hooks.push(itemAs(id, ITEMS.hook, value));
        break;
      case "harnessConfig":
        config.harnessConfig.push(itemAs(id, ITEMS.harnessConfig, value));
        break;
      case "projectCheckout":
        rowsOf(config, projectId).checkouts[projectItemOf(id)?.key ?? ""] =
          itemAs(id, ITEMS.projectCheckout, value).path;
        break;
      case "projectSkill":
        rowsOf(config, projectId).skills.push(itemAs(id, ITEMS.skill, value));
        break;
      case "projectMcp":
        rowsOf(config, projectId).mcp.push(itemAs(id, ITEMS.mcp, value));
        break;
      case "projectMemory":
        rowsOf(config, projectId).memory.push(
          itemAs(id, ITEMS.placedMemoryDoc, value)
        );
        break;
      case "projectHook":
        rowsOf(config, projectId).hooks.push(itemAs(id, ITEMS.hook, value));
        break;
      case "projectHarnessConfig":
        rowsOf(config, projectId).harnessConfig.push(
          itemAs(id, ITEMS.harnessConfig, value)
        );
        break;
      default:
        unhandled("kind", kind);
    }
  }
  config.memory = main ? { ...main, docs } : null;
  return config;
};

/** JSON with every object's keys sorted: the same value hashes the same however it was built. */
const stable = (value: unknown): string =>
  JSON.stringify(value, (_, inner: unknown) =>
    inner && typeof inner === "object" && !Array.isArray(inner)
      ? Object.fromEntries(
          Object.entries(inner)
            .filter(([key]) => key !== "force")
            .sort(([a], [b]) => (a < b ? -1 : 1))
        )
      : inner
  );

/** An item's content hash: sha256 of its value, `force` left out. */
export const itemHash = (value: unknown): string =>
  new Bun.CryptoHasher("sha256").update(stable(value)).digest("hex");
