/**
 * A view's checks (Projects spec §5.2): a project's view is an A2UI v0.9.1
 * document over CawCo's catalog, and nothing else.
 *
 * - Every component is one of the catalog's ({@link CAWCO_COMPONENT_NAMES});
 *   one that is not is refused by name, never invented.
 * - It cannot run code or reach the network: a URL anywhere, a script-like
 *   field, or markup in a string is refused.
 * - Every message validates against the spec's own `server_to_client.json`
 *   (vendored, `a2ui-spec/`) with CawCo's catalog in place of `catalog.json`,
 *   which the spec prescribes for a client catalog. Ajv (already the hub's)
 *   runs the spec's draft 2020-12 schemas; ajv-formats its `format`s, as the
 *   spec's own runner does.
 * - It is a surface over CawCo's catalog and its components, bound to the
 *   hub's data: a `createSurface` naming {@link CAWCO_CATALOG_ID}, then
 *   `updateComponents` for that surface, with a `root` and every child it
 *   names; no data of its own and no deletes.
 */
import {
  CAWCO_CATALOG_ID,
  CAWCO_COMPONENT_NAMES,
  CAWCO_COMPONENTS,
  CAWCO_FUNCTIONS,
  type CatalogComponent,
  type ViewSpec,
} from "@cawco/core";
import type { ErrorObject, ValidateFunction } from "ajv";
import Ajv2020 from "ajv/dist/2020";
import addFormats from "ajv-formats";
import basicCatalog from "./a2ui-spec/v0_9_1/catalogs/basic/catalog.json";
import clientToServer from "./a2ui-spec/v0_9_1/json/client_to_server.json";
import commonTypes from "./a2ui-spec/v0_9_1/json/common_types.json";
import serverToClient from "./a2ui-spec/v0_9_1/json/server_to_client.json";
import { FolderRefusal } from "./project-folder";

/** Where `server_to_client.json` and `common_types.json` look for the catalog: `catalog.json` beside them. */
const CATALOG_ALIAS = "https://a2ui.org/specification/v0_9/catalog.json";
const COMMON = "https://a2ui.org/specification/v0_9/common_types.json#/$defs/";

type Schema = Record<string, unknown>;

const basic = basicCatalog as unknown as {
  $defs: Record<string, Schema>;
  functions: Record<string, Schema>;
};

/** A catalog's components as the spec's catalogs write them: common fields, then the component's own props. */
const componentSchema = (
  name: string,
  { props, required }: CatalogComponent
): Schema => ({
  type: "object",
  allOf: [
    { $ref: `${COMMON}ComponentCommon` },
    { $ref: "#/$defs/CatalogComponentCommon" },
    {
      type: "object",
      properties: {
        component: { const: name },
        ...Object.fromEntries(
          Object.entries(props).map(([prop, { schema, description }]) => [
            prop,
            { ...schema, description },
          ])
        ),
      },
      required: ["component", ...required],
    },
  ],
  unevaluatedProperties: false,
});

/**
 * CawCo's catalog as the JSON Schema the spec's envelope reads: its
 * components, the basic catalog's own schemas for the pure formatters a view
 * may call, the basic catalog's `weight`, and no theme (a view carries
 * DESIGN.md through our components, never its own colours or images).
 */
const cawcoCatalog = (): Schema => ({
  $schema: "https://json-schema.org/draft/2020-12/schema",
  $id: CATALOG_ALIAS,
  title: "CawCo views",
  catalogId: CAWCO_CATALOG_ID,
  components: Object.fromEntries(
    Object.entries(CAWCO_COMPONENTS).map(([name, component]) => [
      name,
      componentSchema(name, component),
    ])
  ),
  functions: Object.fromEntries(
    CAWCO_FUNCTIONS.map((name) => [name, basic.functions[name]])
  ),
  $defs: {
    CatalogComponentCommon: basic.$defs.CatalogComponentCommon,
    theme: { type: "object", properties: {}, additionalProperties: false },
    anyComponent: {
      oneOf: CAWCO_COMPONENT_NAMES.map((name) => ({
        $ref: `#/components/${name}`,
      })),
      discriminator: { propertyName: "component" },
    },
    anyFunction: {
      oneOf: CAWCO_FUNCTIONS.map((name) => ({ $ref: `#/functions/${name}` })),
    },
  },
});

/**
 * The spec's schemas with `catalog` as `catalog.json`, compiled. `strict:
 * false` as the spec's runner sets it: catalogs carry keys JSON Schema does
 * not know (`catalogId`, `components`, `discriminator`).
 */
export const a2uiSchemas = (catalog: Schema) => {
  const ajv = new Ajv2020({ allErrors: true, strict: false });
  addFormats(ajv);
  ajv.addSchema(commonTypes as Schema);
  ajv.addSchema({ ...catalog, $id: CATALOG_ALIAS });
  ajv.addSchema(serverToClient as Schema);
  const envelope = ajv.getSchema(serverToClient.$id);
  if (!envelope) {
    throw new Error(`The A2UI schema ${serverToClient.$id} did not compile.`);
  }
  return {
    "server_to_client.json": envelope,
    // It names no `$id` and references nothing: compiled on its own.
    "client_to_server.json": ajv.compile(clientToServer as Schema),
  };
};

/** The spec's own basic catalog, for its fixtures (`scripts/a2ui-conformance.ts`). */
export const basicA2uiSchemas = () => a2uiSchemas(basicCatalog as Schema);

/** The spec's schemas over CawCo's catalog. */
export const cawcoA2uiSchemas = () => a2uiSchemas(cawcoCatalog());

let cawco: ValidateFunction | undefined;
/** `server_to_client.json` over CawCo's catalog, compiled once. */
const cawcoMessage = (): ValidateFunction => {
  cawco ??= cawcoA2uiSchemas()["server_to_client.json"];
  return cawco;
};

/** Refuses a view with every reason, as the folder refusal its route answers (422) and its tool call reads. */
const refuse = (problems: string[]): never => {
  throw new FolderRefusal(
    422,
    problems.length === 1
      ? (problems[0] ?? "")
      : `The view has ${problems.length} problems:\n- ${problems.join("\n- ")}`
  );
};

/** A string that points outside the view: a scheme with `//`, a data/script/mail scheme, or a bare `www.` host. */
const URL_LIKE =
  /[a-z][a-z0-9+.-]*:\/\/|(?:^|[\s"'(])(?:data|javascript|vbscript|mailto|blob|file|tel):|(?:^|[\s"'(/])www\.[a-z0-9-]+\./i;
/** Markup in a string: a view's text is plain. */
const MARKUP = /<\s*\/?\s*[a-z!][^>]*>/i;
/** A key that would carry code or markup to a renderer. */
const SCRIPT_KEY =
  /^(?:on[A-Z_].*|on|script|scripts|html|innerHTML|outerHTML|srcdoc|eval|code|function|handler|style|href|src|url|action|functionCall)$/;

const MAX_PROBLEMS = 8;

/** Every URL, script-like key and markup in `value`, by JSON Pointer. */
const unsafe = (value: unknown, at: string, found: string[]): void => {
  if (found.length >= MAX_PROBLEMS) {
    return;
  }
  if (typeof value === "string") {
    if (URL_LIKE.test(value)) {
      found.push(
        `${at || "/"} holds a URL (“${value.slice(0, 60)}”): a view cannot reach the network.`
      );
    } else if (MARKUP.test(value)) {
      found.push(
        `${at || "/"} holds markup (“${value.slice(0, 60)}”): a view's text is plain.`
      );
    }
    return;
  }
  if (Array.isArray(value)) {
    value.forEach((item, index) => {
      unsafe(item, `${at}/${index}`, found);
    });
    return;
  }
  if (typeof value === "object" && value !== null) {
    for (const [key, item] of Object.entries(value)) {
      if (SCRIPT_KEY.test(key)) {
        found.push(
          `${at}/${key} is a script-like field: a view cannot run code.`
        );
        continue;
      }
      unsafe(key, `${at}/${key}`, found);
      unsafe(item, `${at}/${key}`, found);
    }
  }
};

type Message = Record<string, unknown>;

const componentsOf = (
  message: Message
): { components: Message[]; surfaceId: unknown } | undefined => {
  const update = message.updateComponents as
    | { components?: unknown; surfaceId?: unknown }
    | undefined;
  return update && Array.isArray(update.components)
    ? {
        components: update.components.filter(
          (item): item is Message => typeof item === "object" && item !== null
        ),
        surfaceId: update.surfaceId,
      }
    : undefined;
};

/** Component names the catalog does not have, with where each is used. */
const unknownComponents = (messages: Message[]): string[] => {
  const known = new Set<string>(CAWCO_COMPONENT_NAMES);
  const missing = new Map<string, string>();
  messages.forEach((message, index) => {
    componentsOf(message)?.components.forEach((component, at) => {
      const name = component.component;
      if (typeof name === "string" && !known.has(name) && !missing.has(name)) {
        missing.set(name, `/${index}/updateComponents/components/${at}`);
      }
    });
  });
  return [...missing].map(
    ([name, at]) =>
      `${name} (${at}) is not a component of CawCo's catalog, which has ${CAWCO_COMPONENT_NAMES.join(", ")}.`
  );
};

/** Ajv's errors, the most specific first, as sentences; the `oneOf` umbrella lines are dropped. */
const schemaProblems = (index: number, errors: ErrorObject[]): string[] => {
  const specific = errors.filter(
    (error) => error.keyword !== "oneOf" && error.keyword !== "allOf"
  );
  const seen = new Set<string>();
  const lines: string[] = [];
  for (const error of specific.length ? specific : errors) {
    const extra =
      error.keyword === "unevaluatedProperties" ||
      error.keyword === "additionalProperties"
        ? ` (${String(
            (error.params as { unevaluatedProperty?: string })
              .unevaluatedProperty ??
              (error.params as { additionalProperty?: string })
                .additionalProperty
          )})`
        : "";
    const line = `/${index}${error.instancePath} ${error.message ?? "is invalid"}${extra}.`;
    if (!seen.has(line)) {
      seen.add(line);
      lines.push(line);
    }
  }
  return lines.slice(0, MAX_PROBLEMS);
};

/** A component's references to others: `child`, a ChildList's ids, a template's `componentId`. */
const referencesOf = (component: Message): string[] => {
  const { children } = component;
  if (Array.isArray(children)) {
    return children.filter((id): id is string => typeof id === "string");
  }
  if (typeof children === "object" && children !== null) {
    const { componentId } = children as { componentId?: unknown };
    return typeof componentId === "string" ? [componentId] : [];
  }
  return [];
};

/** The shape a view must have beyond the schema: one surface over CawCo's catalog, its tree whole. */
const structureProblems = (messages: Message[]): string[] => {
  const problems: string[] = [];
  const [first] = messages;
  const surface = first?.createSurface as
    | { catalogId?: unknown; surfaceId?: unknown }
    | undefined;
  if (!surface) {
    return [
      `The view's first message must be createSurface with catalogId "${CAWCO_CATALOG_ID}".`,
    ];
  }
  if (surface.catalogId !== CAWCO_CATALOG_ID) {
    problems.push(
      `/0/createSurface/catalogId is “${String(surface.catalogId)}”; a view is over CawCo's catalog, "${CAWCO_CATALOG_ID}".`
    );
  }
  const ids = new Map<string, Message>();
  messages.slice(1).forEach((message, offset) => {
    const at = `/${offset + 1}`;
    if (!("updateComponents" in message)) {
      const kind = Object.keys(message).find((key) => key !== "version");
      problems.push(
        kind === "updateDataModel"
          ? `${at} is updateDataModel: a view carries no data of its own; it binds to the hub's (/tasks, /stages, /counts, /project).`
          : `${at} is ${kind ?? "empty"}: after createSurface a view is updateComponents only.`
      );
      return;
    }
    const update = componentsOf(message);
    if (update && update.surfaceId !== surface.surfaceId) {
      problems.push(
        `${at}/updateComponents/surfaceId is “${String(update.surfaceId)}”, not the view's surface “${String(surface.surfaceId)}”.`
      );
    }
    for (const component of update?.components ?? []) {
      if (typeof component.id === "string") {
        ids.set(component.id, component);
      }
    }
  });
  if (!ids.has("root")) {
    problems.push(
      'No component has the id "root": the view draws from it (A2UI v0.9.1, "UI composition").'
    );
  }
  for (const [id, component] of ids) {
    for (const ref of referencesOf(component)) {
      if (!ids.has(ref)) {
        problems.push(
          `${id} names the child “${ref}”, which no component of the view is.`
        );
      }
    }
  }
  return problems.slice(0, MAX_PROBLEMS);
};

/**
 * `spec` as a view, or a 422 {@link FolderRefusal} with every reason: the
 * catalog's names first, then URLs and code, then the spec's schema, then
 * the view's own shape.
 */
export const checkView = (spec: unknown): ViewSpec => {
  if (!Array.isArray(spec) || spec.length === 0) {
    refuse([
      "A view is a list of A2UI v0.9.1 messages: createSurface, then updateComponents.",
    ]);
  }
  const messages = spec as unknown[];
  const notObject = messages.findIndex(
    (message) =>
      typeof message !== "object" || message === null || Array.isArray(message)
  );
  if (notObject !== -1) {
    refuse([`/${notObject} is not a message object.`]);
  }
  const objects = messages as Message[];
  const missing = unknownComponents(objects);
  if (missing.length) {
    refuse(missing);
  }
  const found: string[] = [];
  unsafe(objects, "", found);
  if (found.length) {
    refuse(found);
  }
  const validate = cawcoMessage();
  const invalid = objects.flatMap((message, index) =>
    validate(message) ? [] : schemaProblems(index, validate.errors ?? [])
  );
  if (invalid.length) {
    refuse(invalid.slice(0, MAX_PROBLEMS));
  }
  const shape = structureProblems(objects);
  if (shape.length) {
    refuse(shape);
  }
  return objects as unknown as ViewSpec;
};
