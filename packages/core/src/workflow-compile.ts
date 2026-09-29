/**
 * The node editor's one-way map out to a program (proposal §13.4).
 *
 * `compileWorkflow` turns a `WorkflowGraph` into a TypeScript module the hub
 * executes: one emission rule per node kind, `w.trace(edgeId)` on every edge
 * traversal, cycle-closing edges as bounded `for` loops. The emission is
 * deterministic — the same graph always produces byte-identical source — and
 * carries a node → line map so a diagnostic pins back onto the node that
 * produced the line.
 */
import type {
  Problem,
  WorkflowEdge,
  WorkflowGraph,
  WorkflowInput,
  WorkflowNode,
  WorkflowSchema,
  WorkflowWhen,
} from "./workflow";
import { workflowPorts } from "./workflow";

export interface CompiledWorkflow {
  lines: Record<string, [number, number]>;
  problems: Problem[];
  program: string;
}

const TEMPLATE = /\{\{\s*([^{}]+?)\s*\}\}/g;
const IDENTIFIER = /^[A-Za-z_$][\w$]*$/;
const ARRAY_PATH = /\[(\d+|\*)\]/g;
const WILDCARD_LABEL = /^\{\{\s*([^{}]*\[\*\][^{}]*)\s*\}\}$/;
const NAME_PART = /[^A-Za-z0-9]+(.)?/g;
const NAME_HEAD = /^[^A-Za-z_$]+/;
const RESERVED = new Set([
  "await",
  "break",
  "case",
  "catch",
  "class",
  "const",
  "continue",
  "default",
  "delete",
  "do",
  "else",
  "enum",
  "export",
  "extends",
  "false",
  "finally",
  "for",
  "function",
  "if",
  "import",
  "in",
  "inputs",
  "instanceof",
  "let",
  "new",
  "null",
  "return",
  "super",
  "switch",
  "this",
  "throw",
  "true",
  "try",
  "typeof",
  "var",
  "void",
  "w",
  "while",
  "with",
  "z",
]);

const quote = (value: string) => JSON.stringify(value);
/** A member access that stays readable when the key is a plain identifier. */
const member = (base: string, key: string) =>
  IDENTIFIER.test(key) ? `${base}.${key}` : `${base}[${quote(key)}]`;

/**
 * JSON Schema → zod source (§13.6). Deliberately narrow: the shapes the
 * editor's schema builder produces. Anything else is a Problem naming the node
 * rather than a guess that would typecheck and then mis-validate a result.
 */
export function jsonSchemaToZod(
  schema: WorkflowSchema,
  refuse: (message: string) => void,
  path = "schema"
): string {
  if (Array.isArray(schema.enum)) {
    if (!schema.enum.every((value) => typeof value === "string")) {
      refuse(`${path}: only string enums are supported.`);
      return "z.unknown()";
    }
    return `z.enum([${(schema.enum as string[]).map(quote).join(", ")}])`;
  }
  const known = new Set([
    "type",
    "properties",
    "required",
    "items",
    "minItems",
    "enum",
    "description",
    "additionalProperties",
    "title",
  ]);
  for (const key of Object.keys(schema)) {
    if (!known.has(key)) {
      refuse(`${path}: unsupported JSON Schema keyword "${key}".`);
      return "z.unknown()";
    }
  }
  const describe = (source: string) =>
    typeof schema.description === "string" && schema.description
      ? `${source}.describe(${quote(schema.description)})`
      : source;
  switch (schema.type) {
    case "string":
      return describe("z.string()");
    case "boolean":
      return describe("z.boolean()");
    case "number":
      return describe("z.number()");
    case "integer":
      return describe("z.number().int()");
    case "array": {
      const items = schema.items as WorkflowSchema | undefined;
      const inner = items
        ? jsonSchemaToZod(items, refuse, `${path}.items`)
        : "z.unknown()";
      const min =
        typeof schema.minItems === "number" ? `.min(${schema.minItems})` : "";
      return describe(`z.array(${inner})${min}`);
    }
    case "object": {
      const properties = (schema.properties ?? {}) as Record<
        string,
        WorkflowSchema
      >;
      // No `required` list means the author wants every field back: the
      // editor's flat-field builder has no "optional" control, and a program
      // that reads `result.x` must know `x` is there.
      const required = new Set(
        Array.isArray(schema.required)
          ? (schema.required as string[])
          : Object.keys(properties)
      );
      const entries = Object.entries(properties).map(([key, value]) => {
        const inner = jsonSchemaToZod(value, refuse, `${path}.${key}`);
        return `${IDENTIFIER.test(key) ? key : quote(key)}: ${inner}${required.has(key) ? "" : ".optional()"}`;
      });
      if (!entries.length) {
        return describe("z.object({})");
      }
      return describe(`z.object({ ${entries.join(", ")} })`);
    }
    default:
      refuse(`${path}: unsupported JSON Schema type "${String(schema.type)}".`);
      return "z.unknown()";
  }
}

/** The zod source for a Start node's inputs — the program's `inputs` export. */
function inputsToZod(inputs: WorkflowInput[]): string {
  const entries = inputs.map((input) => {
    const base =
      input.type === "select" && input.options?.length
        ? `z.enum([${input.options.map(quote).join(", ")}])`
        : "z.string()";
    const described = `${base}.describe(${quote(input.label || input.name)})`;
    const optional = input.required ? described : `${described}.optional()`;
    return `  ${IDENTIFIER.test(input.name) ? input.name : quote(input.name)}: ${
      input.default === undefined
        ? optional
        : `${optional}.default(${quote(input.default)})`
    },`;
  });
  return `z.object({\n${entries.join("\n")}\n})`;
}

/** The inverse, for the launch dialog and the slash stubs (§13.6). */
export function inputsFromZodShape(shape: {
  [name: string]: {
    defaultValue?: string;
    description?: string;
    options?: string[];
    optional: boolean;
  };
}): WorkflowInput[] {
  return Object.entries(shape).map(([name, field]) => ({
    name,
    label: field.description ?? name,
    type: field.options?.length ? ("select" as const) : ("text" as const),
    required: !field.optional,
    ...(field.options?.length ? { options: field.options } : {}),
    ...(field.defaultValue === undefined
      ? {}
      : { default: field.defaultValue }),
  }));
}

interface Emitter {
  indent: number;
  lines: string[];
  push: (text: string) => void;
}

const makeEmitter = (): Emitter => {
  const state: Emitter = {
    lines: [],
    indent: 0,
    push(text: string) {
      state.lines.push(text ? `${"  ".repeat(state.indent)}${text}` : "");
    },
  };
  return state;
};

type StepNode = Extract<WorkflowNode, { kind: "step" }>;

interface OpenLoop {
  exit: string | undefined;
  header: string;
  label: string;
}

interface Context {
  /** Loop headers already open around this point, innermost last. */
  loops: OpenLoop[];
  /** Loop headers already open around this point. */
  open: Set<string>;
  /** The map body scope expression, or "root". */
  scope: string;
  /** Node ids whose emission belongs to an enclosing region, not this one. */
  stop: Set<string>;
}

export function compileWorkflow(graph: WorkflowGraph): CompiledWorkflow {
  const problems: Problem[] = [];
  const lines: Record<string, [number, number]> = {};
  const add = (message: string, nodeId?: string, edgeId?: string) => {
    problems.push({ message, nodeId, edgeId });
  };
  const emitter = makeEmitter();

  const compileGraph = (
    scopeGraph: WorkflowGraph,
    prefix: string
  ): {
    body: () => void;
    declarations: string[];
    schemas: string[];
    start: Extract<WorkflowNode, { kind: "start" }> | undefined;
  } => {
    const nodes = new Map(scopeGraph.nodes.map((node) => [node.id, node]));
    const start = scopeGraph.nodes.find((node) => node.kind === "start");
    const outgoing = (id: string) =>
      scopeGraph.edges.filter((edge) => edge.from.node === id);
    const plainReaches = (
      from: string,
      to: string,
      skip: Set<WorkflowEdge>,
      seen = new Set<string>()
    ): boolean => {
      if (from === to) {
        return true;
      }
      if (seen.has(from)) {
        return false;
      }
      seen.add(from);
      return outgoing(from).some(
        (edge) => !skip.has(edge) && plainReaches(edge.to.node, to, skip, seen)
      );
    };
    const bounded = new Set(
      scopeGraph.edges.filter((edge) => edge.maxIterations !== undefined)
    );
    const back = new Set(
      [...bounded].filter((edge) =>
        plainReaches(edge.to.node, edge.from.node, bounded)
      )
    );
    const forward = (id: string) =>
      outgoing(id).filter((edge) => !back.has(edge));
    const reachable = (from: string, stop: Set<string>): Set<string> => {
      const seen = new Set<string>();
      const walk = (id: string) => {
        if (seen.has(id)) {
          return;
        }
        seen.add(id);
        if (stop.has(id)) {
          return;
        }
        for (const edge of forward(id)) {
          walk(edge.to.node);
        }
      };
      walk(from);
      return seen;
    };
    const order: string[] = [];
    const seenOrder = new Set<string>();
    const topo = (id: string) => {
      if (seenOrder.has(id)) {
        return;
      }
      seenOrder.add(id);
      for (const edge of forward(id)) {
        topo(edge.to.node);
      }
      order.unshift(id);
    };
    if (start) {
      topo(start.id);
    }
    const rank = new Map(order.map((id, index) => [id, index]));

    // Readable, unique, reserved-word-safe variable names from node titles.
    const names = new Map<string, string>();
    const used = new Set(RESERVED);
    for (const node of scopeGraph.nodes) {
      const base =
        (node.title || node.id)
          .replace(NAME_PART, (_, next: string | undefined) =>
            next ? next.toUpperCase() : ""
          )
          .replace(NAME_HEAD, "") || "node";
      let name = `${prefix}${base}`;
      for (let suffix = 2; used.has(name); suffix += 1) {
        name = `${prefix}${base}${suffix}`;
      }
      used.add(name);
      names.set(node.id, name);
    }
    const nameOf = (id: string) => names.get(id) ?? id;

    const declarations: string[] = [];
    const schemas: string[] = [];
    const findingsVars = new Set<string>();

    /** Where a node's `steps.<id>.result` lives once the node has run. */
    const resultExpr = (id: string, seen = new Set<string>()): string => {
      const node = nodes.get(id);
      if (!node || seen.has(id)) {
        return "undefined";
      }
      seen.add(id);
      if (node.kind === "start") {
        return "w.inputs";
      }
      if (node.kind === "check" || node.kind === "branch") {
        const incoming = scopeGraph.edges.find(
          (edge) => edge.to.node === id && !back.has(edge)
        );
        return incoming ? resultExpr(incoming.from.node, seen) : "undefined";
      }
      return nameOf(id);
    };

    /** Applies a dotted path to an expression; `*` maps over an array. */
    const walk = (base: string, parts: string[]): string => {
      const star = parts.indexOf("*");
      if (star === -1) {
        return parts.reduce((acc, part) => member(acc, part), base);
      }
      const head = parts
        .slice(0, star)
        .reduce((acc, part) => member(acc, part), base);
      const tail = walk("entry", parts.slice(star + 1));
      return `${head}.map((entry) => ${tail})`;
    };

    /** `{{path}}` and `when.path` → a TypeScript expression. */
    const pathExpr = (
      path: string,
      node: WorkflowNode
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every template namespace resolves against the same node and edge tables
    ): string => {
      const parts = path.replace(ARRAY_PATH, ".$1").split(".");
      if (path === "attempt.gateFindings") {
        const name = `${nameOf(node.id)}Findings`;
        findingsVars.add(name);
        return `JSON.stringify(${name}, null, 2)`;
      }
      if (parts[0] === "map") {
        return parts[1] === "index" ? "index" : "item";
      }
      if (parts[0] === "inputs") {
        return member("w.inputs", parts[1]);
      }
      if (parts[0] === "result") {
        const incoming = scopeGraph.edges.find(
          (edge) => edge.to.node === node.id && !back.has(edge)
        );
        return walk(
          incoming ? resultExpr(incoming.from.node) : "undefined",
          parts.slice(1)
        );
      }
      if (parts[0] === "steps" && parts[2] === "result") {
        return walk(resultExpr(parts[1]), parts.slice(3));
      }
      add(
        `A program has no "${path}"; only inputs, step results, map item/index and attempt.gateFindings survive the compile.`,
        node.id
      );
      return "undefined";
    };

    /** A template becomes a template literal with the same visible text. */
    const templateExpr = (text: string, node: WorkflowNode): string => {
      const parts: string[] = [];
      let last = 0;
      for (const match of text.matchAll(TEMPLATE)) {
        parts.push(
          text
            .slice(last, match.index)
            .replaceAll("\\", "\\\\")
            .replaceAll("`", "\\`")
            .replaceAll("${", "\\${")
        );
        const path = match[1].trim();
        const expr = pathExpr(path, node);
        parts.push(
          `\${${path.endsWith(".result") || path === "attempt.gateFindings" ? expr : `String(${expr})`}}`
        );
        last = (match.index ?? 0) + match[0].length;
      }
      parts.push(
        text
          .slice(last)
          .replaceAll("\\", "\\\\")
          .replaceAll("`", "\\`")
          .replaceAll("${", "\\${")
      );
      return `\`${parts.join("")}\``;
    };

    const whenExpr = (
      when: WorkflowWhen | undefined,
      node: WorkflowNode
    ): string => {
      if (!when) {
        return "true";
      }
      const actual = pathExpr(
        when.path.startsWith("result") ? when.path : `result.${when.path}`,
        node
      );
      switch (when.op) {
        case "eq":
          return `JSON.stringify(${actual}) === ${quote(JSON.stringify(when.value))}`;
        case "neq":
          return `JSON.stringify(${actual}) !== ${quote(JSON.stringify(when.value))}`;
        case "gt":
          return `Number(${actual}) > ${JSON.stringify(when.value)}`;
        case "lt":
          return `Number(${actual}) < ${JSON.stringify(when.value)}`;
        case "contains":
          return `String(${actual}).includes(${quote(String(when.value))})`;
        case "matches":
          return `new RegExp(${quote(String(when.value))}).test(String(${actual}))`;
        case "truthy":
          return `Boolean(${actual})`;
        case "falsy":
          return `!${actual}`;
        default:
          add("Unknown edge condition operation.", node.id);
          return "false";
      }
    };

    const traceOf = (edge: WorkflowEdge, context: Context) =>
      `await w.trace(${quote(edge.id)}${context.scope === "root" ? "" : `, ${context.scope}`});`;

    const openLine = (nodeId: string) => {
      lines[nodeId] ??= [emitter.lines.length + 1, emitter.lines.length + 1];
    };
    const closeLine = (nodeId: string) => {
      const span = lines[nodeId];
      if (span) {
        span[1] = emitter.lines.length;
      }
    };

    const stepSpec = (node: StepNode, schemaName: string) => {
      const entries = [
        `title: ${quote(node.title)}`,
        `node: ${quote(node.id)}`,
        `harness: ${quote(node.harness)}`,
        `model: ${quote(node.model)}`,
        ...(node.effort ? [`effort: ${quote(node.effort)}`] : []),
        ...(node.skills?.length
          ? [`skills: [${node.skills.map(quote).join(", ")}]`]
          : []),
        ...(node.denyTools?.length
          ? [`denyTools: [${node.denyTools.map(quote).join(", ")}]`]
          : []),
        `prompt: ${templateExpr(node.prompt, node)}`,
        `output: ${schemaName}`,
        ...(node.retries === undefined ? [] : [`retries: ${node.retries}`]),
        ...(node.timeoutMinutes === undefined
          ? []
          : [`timeoutMinutes: ${node.timeoutMinutes}`]),
      ];
      return entries;
    };

    const emitCheckRules = (
      node: Extract<WorkflowNode, { kind: "check" }>,
      findings: string
    ) => {
      const input = resultExpr(node.id);
      emitter.push(`const ${findings}: string[] = [];`);
      for (const rule of node.rules) {
        if (rule.kind === "schema") {
          const source = jsonSchemaToZod(rule.schema, (message) =>
            add(message, node.id)
          );
          emitter.push("{");
          emitter.indent += 1;
          emitter.push(`const parsed = ${source}.safeParse(${input});`);
          emitter.push(
            `if (!parsed.success) { ${findings}.push(parsed.error.message); }`
          );
          emitter.indent -= 1;
          emitter.push("}");
        } else if (rule.kind === "regex") {
          const value = pathExpr(`result.${rule.path}`, node);
          emitter.push(
            `if (new RegExp(${quote(rule.pattern)}).test(String(${value})) !== ${rule.mustMatch}) {`
          );
          emitter.indent += 1;
          emitter.push(
            `${findings}.push(${quote(`Regex ${rule.pattern} failed at ${rule.path}.`)});`
          );
          emitter.indent -= 1;
          emitter.push("}");
        } else if (rule.kind === "forbidden-words") {
          const value = pathExpr(`result.${rule.path}`, node);
          emitter.push("{");
          emitter.indent += 1;
          emitter.push(`const text = String(${value}).toLowerCase();`);
          emitter.push(
            `const found = [${rule.words.map(quote).join(", ")}].filter((word) => text.includes(word.toLowerCase()));`
          );
          emitter.push(
            `if (found.length) { ${findings}.push(\`${`Forbidden words at ${rule.path}`}: \${found.join(", ")}\`); }`
          );
          emitter.indent -= 1;
          emitter.push("}");
        } else if (rule.kind === "file-exists") {
          emitter.push("{");
          emitter.indent += 1;
          emitter.push(`const target = ${templateExpr(rule.path, node)};`);
          emitter.push(
            `if (!(await w.exists(target))) { ${findings}.push(\`Missing \${target}.\`); }`
          );
          emitter.indent -= 1;
          emitter.push("}");
        } else {
          emitter.push("{");
          emitter.indent += 1;
          emitter.push(`const cmd = ${templateExpr(rule.cmd, node)};`);
          emitter.push("const gate = await w.exec(cmd);");
          emitter.push(
            `if (gate.code !== ${rule.expectExit}) { ${findings}.push(\`\${cmd}: exit \${gate.code}\\n\${gate.output}\`); }`
          );
          emitter.indent -= 1;
          emitter.push("}");
        }
      }
    };

    /** The nodes a loop header's body covers, and the one node it exits into. */
    const loopRegion = (header: string) => {
      const entries = scopeGraph.edges
        .filter((edge) => back.has(edge) && edge.to.node === header)
        .map((edge) => edge.from.node);
      const downstream = reachable(header, new Set());
      const region = new Set(
        [...downstream].filter((id) =>
          entries.some((source) => plainReaches(id, source, back))
        )
      );
      region.add(header);
      const exits = new Set<string>();
      for (const id of region) {
        for (const edge of forward(id)) {
          if (!region.has(edge.to.node)) {
            exits.add(edge.to.node);
          }
        }
      }
      return { region, exits: [...exits] };
    };

    /** Where two or more branches of `node` come back together. */
    const mergeOf = (
      targets: string[],
      context: Context
    ): string | undefined => {
      const sets = targets.map((target) => reachable(target, context.stop));
      const common = [...sets[0]].filter((id) =>
        sets.every((set) => set.has(id))
      );
      common.sort((a, b) => (rank.get(a) ?? 0) - (rank.get(b) ?? 0));
      return common[0];
    };

    const emitSeq = (
      from: string | undefined,
      context: Context
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: the walk owns loop opening, node emission and continuation in one pass
    ) => {
      let current = from;
      const guard = new Set<string>();
      while (current && !context.stop.has(current)) {
        if (guard.has(current)) {
          add("The compiler walked the same node twice.", current);
          return;
        }
        guard.add(current);
        const node = nodes.get(current);
        if (!node) {
          add(`Edge names a missing node ${current}.`);
          return;
        }
        const isHeader =
          scopeGraph.edges.some(
            (edge) => back.has(edge) && edge.to.node === node.id
          ) && !context.open.has(node.id);
        if (isHeader) {
          const { exits } = loopRegion(node.id);
          if (exits.length > 1) {
            add(
              `A bounded loop may leave by one edge only; this one leaves by ${exits.length}.`,
              node.id
            );
            return;
          }
          for (const edge of scopeGraph.edges.filter(
            (entry) => back.has(entry) && entry.to.node === node.id
          )) {
            emitter.push(`let ${nameOf(node.id)}${counterOf(edge)} = 0;`);
          }
          const label = `${nameOf(node.id)}Loop`;
          emitter.push(`${label}: for (;;) {`);
          emitter.indent += 1;
          emitSeq(node.id, {
            ...context,
            stop: new Set([...context.stop, ...exits]),
            open: new Set([...context.open, node.id]),
            loops: [
              ...context.loops,
              { header: node.id, label, exit: exits[0] },
            ],
          });
          emitter.indent -= 1;
          emitter.push("}");
          [current] = exits;
          continue;
        }
        openLine(node.id);
        emitNode(node);
        closeLine(node.id);
        current = emitRouting(node, context);
      }
    };

    const counterOf = (edge: WorkflowEdge) =>
      `Loop${[...back].indexOf(edge) + 1}`;

    const emitNode = (node: WorkflowNode) => {
      switch (node.kind) {
        case "start":
          break;
        case "step": {
          const schemaName = `${nameOf(node.id)}Schema`;
          schemas.push(
            `const ${schemaName} = ${jsonSchemaToZod(node.outputSchema, (message) => add(message, node.id))};`
          );
          declarations.push(
            `let ${nameOf(node.id)}!: z.infer<typeof ${schemaName}>;`
          );
          const entries = stepSpec(node, schemaName);
          emitter.push(`${nameOf(node.id)} = await w.run({`);
          emitter.indent += 1;
          for (const entry of entries) {
            emitter.push(`${entry},`);
          }
          emitter.indent -= 1;
          emitter.push("});");
          break;
        }
        case "check":
          emitCheckRules(node, `${nameOf(node.id)}Findings`);
          break;
        case "branch":
          break;
        case "ask": {
          declarations.push(
            `let ${nameOf(node.id)}!: { choice: string; note?: string };`
          );
          const options = node.options.map((option) => {
            const wildcard = option.label.match(WILDCARD_LABEL);
            if (wildcard) {
              return `...${pathExpr(wildcard[1].trim(), node)}.map((entry) => ({ label: String(entry) }))`;
            }
            return `{ label: ${templateExpr(option.label, node)}${option.description ? `, description: ${quote(option.description)}` : ""} }`;
          });
          emitter.push(`${nameOf(node.id)} = await w.ask({`);
          emitter.indent += 1;
          emitter.push(`question: ${templateExpr(node.question, node)},`);
          emitter.push(`options: [${options.join(", ")}],`);
          emitter.push(`allowOther: ${node.allowOther},`);
          if (node.answeredBy) {
            emitter.push(`answeredBy: ${quote(node.answeredBy)},`);
          }
          if (node.waitFor !== undefined) {
            emitter.push(`waitFor: ${node.waitFor},`);
          }
          emitter.indent -= 1;
          emitter.push("});");
          break;
        }
        case "workflow": {
          declarations.push(`let ${nameOf(node.id)}: unknown;`);
          const entries = Object.entries(node.inputs).map(
            ([key, value]) =>
              `${IDENTIFIER.test(key) ? key : quote(key)}: ${value.includes("{{") ? templateExpr(value, node) : pathExpr(value, node)}`
          );
          emitter.push(
            `${nameOf(node.id)} = await w.workflow(${quote(node.workflowId)}, { ${entries.join(", ")} });`
          );
          break;
        }
        case "map": {
          const body = compileGraph(node.body, `${nameOf(node.id)}Item`);
          schemas.push(...body.schemas);
          declarations.push(`let ${nameOf(node.id)}: { items: unknown[] };`);
          emitter.push(`${nameOf(node.id)} = { items: await Promise.all(`);
          emitter.indent += 1;
          emitter.push(
            `${pathExpr(node.over, node)}.map(async (item: unknown, index: number) => {`
          );
          emitter.indent += 1;
          body.body();
          for (const declaration of body.declarations) {
            emitter.push(declaration);
          }
          emitter.indent -= 1;
          emitter.push("})");
          emitter.indent -= 1;
          emitter.push(") };");
          break;
        }
        case "end": {
          const entries = Object.entries(node.outputs).map(
            ([key, path]) =>
              `${IDENTIFIER.test(key) ? key : quote(key)}: ${pathExpr(path, node)}`
          );
          emitter.push(`return { ${entries.join(", ")} };`);
          break;
        }
        default:
          add("Unknown node kind.", (node as WorkflowNode).id);
      }
    };

    /** Emits the node's outgoing edges; answers with the node to continue at. */
    /** The labels an Ask port stands for, as one `string[]` expression. */
    const askLabels = (node: WorkflowNode, labels: string[]) =>
      `[${labels
        .map((label) => {
          const wildcard = label.match(WILDCARD_LABEL);
          return wildcard
            ? `...${pathExpr(wildcard[1].trim(), node)}.map((entry) => String(entry))`
            : templateExpr(label, node);
        })
        .join(", ")}]`;

    /** The open loop a jump to `target` leaves, if any. */
    const leaves = (target: string, context: Context) =>
      [...context.loops].reverse().find((entry) => entry.exit === target);

    const emitRouting = (
      node: WorkflowNode,
      context: Context
      // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: every port shape — straight line, bounded cycle, branch merge and unwired failure — is one routing decision
    ): string | undefined => {
      const edges = outgoing(node.id);
      if (node.kind === "end") {
        return undefined;
      }
      const ports = workflowPorts(node);
      const unwired = ports.filter(
        (port) => !edges.some((edge) => edge.from.port === port)
      );
      const condOf = (
        edge: WorkflowEdge
        // biome-ignore lint/complexity/noExcessiveCognitiveComplexity: each node kind contributes its own port condition
      ): string => {
        const parts: string[] = [];
        if (node.kind === "check") {
          parts.push(
            edge.from.port === "pass"
              ? `${nameOf(node.id)}Findings.length === 0`
              : `${nameOf(node.id)}Findings.length > 0`
          );
        }
        if (node.kind === "branch") {
          const matched = node.cases.find(
            (entry) => entry.port === edge.from.port
          );
          if (matched?.when) {
            parts.push(whenExpr(matched.when, node));
          }
        }
        if (node.kind === "ask") {
          const labels = node.options.map((option) => option.label);
          if (edge.from.port === "other") {
            parts.push(
              `!${askLabels(node, labels)}.includes(${nameOf(node.id)}.choice)`
            );
          } else if (labels.includes(edge.from.port)) {
            parts.push(
              `${askLabels(node, [edge.from.port])}.includes(${nameOf(node.id)}.choice)`
            );
          }
        }
        if (edge.when) {
          parts.push(whenExpr(edge.when, node));
        }
        return parts.length ? parts.join(" && ") : "true";
      };
      const straight =
        edges.length === 1 &&
        !back.has(edges[0]) &&
        condOf(edges[0]) === "true";
      if (straight) {
        emitter.push(traceOf(edges[0], context));
        const left = leaves(edges[0].to.node, context);
        if (left) {
          emitter.push(`break ${left.label};`);
          return undefined;
        }
        return edges[0].to.node;
      }
      if (!edges.length) {
        emitter.push(`throw new Error(${quote(`unwired:${node.id}`)});`);
        return undefined;
      }
      const forwardEdges = edges.filter((edge) => !back.has(edge));
      const merge =
        forwardEdges.length > 1
          ? mergeOf(
              forwardEdges.map((edge) => edge.to.node),
              context
            )
          : forwardEdges[0]?.to.node;
      const inner: Context = {
        ...context,
        stop: merge ? new Set([...context.stop, merge]) : context.stop,
      };
      let opened = false;
      let closed = false;
      for (const edge of edges) {
        if (closed) {
          add(
            "An edge after the unconditional case can never fire.",
            node.id,
            edge.id
          );
          break;
        }
        const condition = condOf(edge);
        const last = edge === edges.at(-1) && !unwired.length;
        if ((condition === "true" || last) && opened) {
          emitter.push("} else {");
          closed = true;
        } else {
          emitter.push(`${opened ? "} else if" : "if"} (${condition}) {`);
          opened = true;
        }
        emitter.indent += 1;
        emitter.push(traceOf(edge, context));
        if (back.has(edge)) {
          const counter = `${nameOf(edge.to.node)}${counterOf(edge)}`;
          const loop = context.loops.find(
            (entry) => entry.header === edge.to.node
          );
          emitter.push(`${counter} += 1;`);
          emitter.push(
            `if (${counter} > ${edge.maxIterations}) { throw new Error(${quote(`loop-bound:${edge.id}`)}); }`
          );
          if (
            node.kind === "check" &&
            findingsVars.has(`${nameOf(edge.to.node)}Findings`)
          ) {
            emitter.push(
              `${nameOf(edge.to.node)}Findings = ${nameOf(node.id)}Findings;`
            );
          }
          emitter.push(`continue ${loop?.label ?? ""};`.replace(" ;", ";"));
        } else if (leaves(edge.to.node, context)) {
          emitter.push(
            `break ${leaves(edge.to.node, context)?.label ?? ""};`.replace(
              " ;",
              ";"
            )
          );
        } else if (edge.to.node !== merge) {
          emitSeq(edge.to.node, inner);
        }
        emitter.indent -= 1;
      }
      if (!closed) {
        emitter.push("} else {");
        emitter.indent += 1;
        emitter.push(`throw new Error(${quote(`unwired-port:${node.id}`)});`);
        emitter.indent -= 1;
      }
      emitter.push("}");
      return merge;
    };

    return {
      start: start?.kind === "start" ? start : undefined,
      declarations,
      schemas,
      body: () => {
        emitSeq(start?.id, {
          stop: new Set(),
          open: new Set(),
          scope: "root",
          loops: [],
        });
        for (const name of findingsVars) {
          declarations.push(`let ${name}: string[] = [];`);
        }
      },
    };
  };

  const root = compileGraph(graph, "");
  if (!root.start) {
    add("Exactly one Start is required.");
  }
  // The body is emitted first: it is what fills the declaration and schema
  // tables the header above it is built from.
  emitter.indent = 1;
  root.body();
  const preamble = [
    'import { z } from "zod";',
    "",
    `export const inputs = ${inputsToZod(root.start?.inputs ?? [])};`,
    "",
    ...root.schemas,
    ...(root.schemas.length ? [""] : []),
    "export default async function (w: Workflow<typeof inputs>) {",
    ...root.declarations.map((line) => `  ${line}`),
  ];
  for (const span of Object.values(lines)) {
    span[0] += preamble.length;
    span[1] += preamble.length;
  }
  return {
    program: [...preamble, ...emitter.lines, "}", ""].join("\n"),
    lines,
    problems,
  };
}
