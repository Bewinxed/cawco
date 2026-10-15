/**
 * Real hub frames read with a shipped app's schema: what the release's stage
 * 1 captured from a running hub's dashboard socket (proof-stack.ts
 * frames.jsonl), against the openapi.json of every TestFlight build still
 * installable (shipped.ts). The wire check (wire-compat.ts) compares two
 * schemas; this reads what the hub actually sent, so a hub that sends
 * something its own schema does not declare, or leaves out what it says is
 * required, is caught where the app would meet it.
 *
 * Read as the app's generated Swift decoder reads (apple/swift-openapi-generator,
 * Codable): a required property must be there and, unless its schema admits
 * null, not null; an optional one may be absent or null; keys it does not
 * declare are ignored; a closed enum refuses a value it does not list (an
 * open one, the generator's typeOverrides, reads any); an undiscriminated
 * union reads a value one of its branches reads; a discriminated union reads
 * by its tag, and the app skips a kind it does not know (Inbound.read).
 * Swift itself does not run on the release host (obelisk has none), and
 * building the app's package per baseline on the Mac costs minutes of the
 * shared build slot, so the schema is read here by those rules.
 *
 *   bun wire-frames.ts <frames.jsonl>
 */
import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { installableTestFlight } from "./shipped";
import {
  APP_SCHEMA,
  GENERATOR_CONFIG,
  openEnumNames,
  wireProtocolAt,
} from "./wire-compat";

type Schema = Record<string, unknown>;
const COMPONENT = "#/components/schemas/";
const isObject = (value: unknown): value is Schema =>
  typeof value === "object" && value !== null && !Array.isArray(value);

/** The JSON kind of a value, as JSON Schema names them. */
const kindOf = (value: unknown): string => {
  if (value === null) {
    return "null";
  }
  if (Array.isArray(value)) {
    return "array";
  }
  if (typeof value === "number") {
    return Number.isInteger(value) ? "integer" : "number";
  }
  return typeof value;
};

class Reader {
  readonly problems: string[] = [];
  private readonly schemas: Record<string, Schema>;
  private readonly open: Set<string>;

  constructor(document: Schema, open: Set<string>) {
    const components = document.components as
      | { schemas?: Record<string, Schema> }
      | undefined;
    this.schemas = components?.schemas ?? {};
    this.open = open;
  }

  /** A schema with its refs followed, and the component it was reached by. */
  private resolve(schema: Schema): { name?: string; schema: Schema } {
    let current = schema;
    let name: string | undefined;
    for (
      let hops = 0;
      hops < 32 && typeof current.$ref === "string";
      hops += 1
    ) {
      name = current.$ref.slice(COMPONENT.length);
      current = this.schemas[name] ?? {};
    }
    return { name, schema: current };
  }

  /** Whether `value` reads as `schema`, with no problem said. */
  fits(value: unknown, schema: Schema): boolean {
    const before = this.problems.length;
    this.read(value, schema, "");
    const fits = this.problems.length === before;
    this.problems.length = before;
    return fits;
  }

  read(value: unknown, given: Schema, at: string): void {
    const { name, schema } = this.resolve(given);
    const here = name ?? at;
    if (Array.isArray(schema.allOf)) {
      for (const part of schema.allOf.filter(isObject)) {
        this.read(value, part, here);
      }
      return;
    }
    const branches = (schema.oneOf ?? schema.anyOf) as Schema[] | undefined;
    if (Array.isArray(branches)) {
      this.readUnion(value, schema, branches, here);
      return;
    }
    if (!this.readKind(value, schema, here)) {
      return;
    }
    this.readValue(value, schema, name, here);
    if (isObject(value)) {
      this.readObject(value, schema, here);
    }
    if (Array.isArray(value) && isObject(schema.items)) {
      for (const [index, item] of value.entries()) {
        this.read(item, schema.items, `${here}[${index}]`);
      }
    }
  }

  private readUnion(
    value: unknown,
    schema: Schema,
    branches: Schema[],
    at: string
  ): void {
    const discriminator = schema.discriminator as
      | { propertyName?: string }
      | undefined;
    const tag = discriminator?.propertyName;
    if (tag && isObject(value)) {
      const branch = branches.find((candidate) => {
        const property = (
          this.resolve(candidate).schema.properties as
            | Record<string, Schema>
            | undefined
        )?.[tag];
        const tagSchema = property ? this.resolve(property).schema : undefined;
        const values = (tagSchema?.enum as unknown[] | undefined) ?? [
          tagSchema?.const,
        ];
        return values.includes(value[tag]);
      });
      // A kind the app does not know is skipped where it stands.
      if (branch) {
        this.read(value, branch, at);
      }
      return;
    }
    if (
      value === null &&
      branches.some((b) => this.resolve(b).schema.type === "null")
    ) {
      return;
    }
    if (!branches.some((branch) => this.fits(value, branch))) {
      this.problems.push(
        `${at}: ${JSON.stringify(value).slice(0, 120)} reads as none of its ${branches.length} branches`
      );
    }
  }

  /** The value's JSON kind is one the schema admits; false when it is not, said once. */
  private readKind(value: unknown, schema: Schema, at: string): boolean {
    const { type } = schema;
    const kinds = (Array.isArray(type) ? type : [type])
      .filter((named) => named !== undefined)
      .map(String);
    const kind = kindOf(value);
    if (
      kinds.length === 0 ||
      kinds.includes(kind) ||
      (kind === "integer" && kinds.includes("number"))
    ) {
      return true;
    }
    this.problems.push(
      `${at}: is ${kind}, the app reads ${kinds.join(" or ")}`
    );
    return false;
  }

  private readValue(
    value: unknown,
    schema: Schema,
    name: string | undefined,
    at: string
  ): void {
    let values: unknown[] | undefined;
    if (Array.isArray(schema.enum)) {
      values = schema.enum;
    } else if (schema.const !== undefined) {
      values = [schema.const];
    }
    if (!values || values.includes(value) || (name && this.open.has(name))) {
      return;
    }
    this.problems.push(
      `${at}: ${JSON.stringify(value)} is not a value the app reads (${values.map((v) => JSON.stringify(v)).join(", ")})`
    );
  }

  private readObject(value: Schema, schema: Schema, at: string): void {
    const properties = (schema.properties ?? {}) as Record<string, Schema>;
    const required = new Set((schema.required as string[] | undefined) ?? []);
    for (const property of required) {
      if (!(property in value)) {
        this.problems.push(
          `${at}.${property}: the app requires it, and the hub left it out`
        );
      }
    }
    for (const [property, item] of Object.entries(value)) {
      const declared = properties[property];
      if (!declared) {
        if (isObject(schema.additionalProperties)) {
          this.read(item, schema.additionalProperties, `${at}[${property}]`);
        }
        continue;
      }
      // An optional property sent as null reads as absent.
      if (item === null && !required.has(property)) {
        continue;
      }
      this.read(item, declared, `${at}.${property}`);
    }
  }
}

/** Each frame by the schema the app reads it with: a stream message by its `type`, an envelope's frames by `FramePayload`. */
export const frameProblems = (
  document: Schema,
  open: Set<string>,
  frames: unknown[]
): { problems: string[]; read: number } => {
  const reader = new Reader(document, open);
  let read = 0;
  const problems: string[] = [];
  for (const [index, frame] of frames.entries()) {
    if (!isObject(frame)) {
      problems.push(`frame ${index + 1}: not a JSON object`);
      continue;
    }
    if (typeof frame.type === "string") {
      reader.read(
        frame,
        { $ref: `${COMPONENT}StreamServerMessage` },
        "message"
      );
      read += 1;
    } else if (frame.verb === "frames") {
      reader.read(
        frame.payload,
        { $ref: `${COMPONENT}FramePayload` },
        "payload"
      );
      read += 1;
    }
    problems.push(
      ...reader.problems.splice(0).map((line) => `frame ${index + 1}, ${line}`)
    );
  }
  return { problems, read };
};

if (import.meta.main) {
  const started = performance.now();
  const [, , file] = process.argv;
  if (!file) {
    throw new Error("Usage: wire-frames.ts <frames.jsonl>");
  }
  const repo = resolve(import.meta.dir, "../../..");
  const show = (commit: string, path: string): string => {
    const run = Bun.spawnSync(["git", "show", `${commit}:${path}`], {
      cwd: repo,
    });
    if (run.exitCode !== 0) {
      throw new Error(`git show ${commit}:${path}: ${run.stderr.toString()}`);
    }
    return run.stdout.toString();
  };
  const frames = readFileSync(file, "utf8")
    .split("\n")
    .filter(Boolean)
    .map((line) => JSON.parse(line) as unknown);
  const hubProtocol = wireProtocolAt((path) =>
    readFileSync(resolve(repo, path), "utf8")
  );
  let failed = false;
  const baselines = installableTestFlight(repo);
  for (const base of baselines) {
    const appProtocol = wireProtocolAt((path) => show(base.commit, path));
    if (hubProtocol > appProtocol) {
      // The hub speaks that app's older wire to it, not the one captured.
      console.log(
        `${base.label}: on WIRE_PROTOCOL ${appProtocol}, below this hub's ${hubProtocol}; the captured frames are not what it is sent`
      );
      continue;
    }
    const { problems, read } = frameProblems(
      JSON.parse(show(base.commit, APP_SCHEMA)) as Schema,
      openEnumNames(show(base.commit, GENERATOR_CONFIG)),
      frames
    );
    if (problems.length) {
      failed = true;
      console.error(
        `${base.label} cannot read ${problems.length} place${problems.length === 1 ? "" : "s"} of the hub's frames:\n${problems.map((line) => `  ${line}`).join("\n")}`
      );
    } else {
      console.log(`${base.label} reads all ${read} of the hub's frames`);
    }
  }
  if (baselines.length === 0) {
    console.log(
      "No TestFlight build is installable: no app to read the frames"
    );
  }
  console.log(
    `wire-frames: ${((performance.now() - started) / 1000).toFixed(1)} s`
  );
  process.exit(failed ? 1 : 0);
}
