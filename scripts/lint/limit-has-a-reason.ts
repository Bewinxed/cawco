/**
 * Every numeric bound in CawCo's code carries its reason: who asked for it,
 * what was measured, or the platform whose limit it is. A bound nobody asked
 * for and no measurement needed walls the owner in: `CANVAS_SPEC_LIMITS.files:
 * 24` (d769fdc658) capped a design graph at 24 stories and split his board in
 * two. The owner asked for this rule on 2026-11-26
 * (cawco:session/86084a4c-59de-486c-8b6a-bd7002ae2b7a).
 *
 * A bound is a fixed number (a literal, arithmetic of literals, or anything
 * the checker types as a number literal) set as:
 *
 * - `.max(N)` on a schema (zod's method, Valibot's and Effect Schema's
 *   `maxLength(N)`-style actions), and `.min(N)` or a `min…` action for N > 1;
 * - a JSON-schema or TypeBox option: `maxItems`, `maxLength`, `maximum`,
 *   `maxProperties`, `exclusiveMaximum`, and `minItems`, `minLength`, `minimum` for N > 1;
 * - `.slice(0, N)`, `.substring(0, N)`, `.splice(N)` for N > 0, and `.slice(-N)` for N > 1;
 * - `Math.min(x, N)`, or a call of a function named `clamp…` with a fixed bound;
 *   a bound of 0 or 1 is unit-interval arithmetic (`Math.min(t, 1)`,
 *   `clamp(t, 0, 1)`), no limit;
 * - a query's limit: Drizzle's `.limit(N)` and `LIMIT N` in SQL text, for N > 1;
 * - `take(N)` for N > 1;
 * - a length guard: `.length` or `.size` compared (`<`, `<=`, `>`, `>=`) with N > 1;
 * - a `const` named as a limit ({@link LIMIT_NAME}, {@link LIMIT_CAMEL}) whose
 *   value is a number, or an object of numbers, each numeric property its own bound;
 * - an object property or a default parameter named as a limit
 *   ({@link LIMIT_PROPERTY}: `limit`, `max…`, `…Limit`, `…Max`, `…Cap`, `…Most`)
 *   whose value is a number.
 *
 * A use of a limit-named constant is that constant's bound, reported where it
 * is declared; a use of another constant declared in the same file stands
 * when that declaration carries the tag. A selection of one thing
 * (`slice(-1)`, `take(1)`, `limit(1)`) bounds nothing.
 *
 * A bound stands with a comment directly above it, its property, or the
 * statement holding it, that carries `@limit asked: <cawco: link or URL>`,
 * `@limit measured: <what, where>` or `@limit external: <platform, citation>`.
 * A tag above something that holds more than one bound covers only the bounds
 * it names. In Svelte markup the tag is a JS comment inside the `{…}`,
 * before the bound (`{items.slice(0, /* @limit … *\/ 3)}`): Biome reads no
 * comment that opens the braces. There is no other way past it.
 *
 * golar.config.ts runs it over every TypeScript and Svelte file under
 * packages/, apps/ (not the paused apps/apple) and scripts/;
 * scripts/lint/fixtures/limit/ holds what it must report and what it must let stand.
 */
import { defineRule } from "golar/unstable";
import {
  type BinaryExpression,
  type CallExpression,
  isArrowFunction,
  isAsExpression,
  isBinaryExpression,
  isBindingElement,
  isCallExpression,
  isElementAccessExpression,
  isFunctionExpression,
  isIdentifier,
  isNonNullExpression,
  isNoSubstitutionTemplateLiteral,
  isNumericLiteral,
  isObjectLiteralExpression,
  isParameterDeclaration,
  isParenthesizedExpression,
  isPrefixUnaryExpression,
  isPropertyAccessExpression,
  isPropertyAssignment,
  isRelationalOperator,
  isSatisfiesExpression,
  isSourceFile,
  isSpreadElement,
  isStatement,
  isStringLiteral,
  isTemplateHead,
  isTemplateMiddle,
  isTemplateTail,
  isTypeAssertion,
  isVariableDeclaration,
  isVariableDeclarationList,
  type Node,
  type PropertyAssignment,
  type SourceFile,
  SyntaxKind,
  type VariableDeclaration,
} from "golar/unstable-tsgo";

const MESSAGE =
  "Is this a prison you built for yourself that no one asked for? Name who asked (`@limit asked: <link>`), the measured constraint (`@limit measured: …`) or the platform's own limit (`@limit external: …`), or remove it.";

/** A constant named as a limit: `PAGE_LIMIT`, `MAX_ROWS`, `CANVAS_SPEC_LIMITS`, `max`. */
const LIMIT_NAME = /(_|^)(LIMIT|LIMITS|MAX|CAP|MOST|BOUND)S?(_|$)/iu;
/** A camelCase constant named as a limit: `rowLimit`, `widthMax`, `retryCap`, `atMost`. */
const LIMIT_CAMEL = /[a-z0-9](Limit|Max|Cap|Most)s?$/u;
/** A tag that names its reason: who asked (a link), what was measured, or whose limit it is. */
const TAG =
  /@limit\s+(?:asked:\s*(?:cawco:\S+|https?:\/\/\S+)|measured:\s*\S[^\n]{3,}|external:\s*\S[^\n]{3,})/u;
/** What a name's text escapes to stand for itself in a regex. */
const REGEX_SPECIAL = /[.*+?^${}()|[\]\\]/gu;
/** A `const` declaration list's keyword, read off its text. */
const CONST_KEYWORD = /^const\b/u;
const CLAMP = /^clamp/iu;
/** A property or parameter named as a limit: `limit`, `maxWidth`, `rowLimit`, `retryCap`, `atMost`. */
const LIMIT_PROPERTY =
  /^(?:limit|max(?:[A-Z0-9_].*)?)$|[a-z0-9](?:Limit|Max|Cap|Most)$/u;
/** A literal `LIMIT N` in SQL text. */
const SQL_LIMIT = /\bLIMIT\s+(\d+)\b/gu;

/** The JSON-schema and TypeBox options that cap, and those that floor. */
const OPTION_MAX = new Set([
  "maxItems",
  "maxLength",
  "maximum",
  "maxProperties",
  "exclusiveMaximum",
]);
const OPTION_MIN = new Set(["minItems", "minLength", "minimum"]);
/** Valibot's and Effect Schema's actions that cap a schema, and those that floor one. */
const ACTION_MAX = new Set([
  "maxLength",
  "maxValue",
  "maxSize",
  "maxItems",
  "maxEntries",
  "maxBytes",
  "maxWords",
  "maxGraphemes",
]);
const ACTION_MIN = new Set([
  "minLength",
  "minValue",
  "minSize",
  "minItems",
  "minEntries",
  "minBytes",
  "minWords",
  "minGraphemes",
]);

/** The sign a prefix `-` or `+` gives a number. */
const SIGN: Partial<Record<SyntaxKind, number>> = {
  [SyntaxKind.MinusToken]: -1,
  [SyntaxKind.PlusToken]: 1,
};

const ARITHMETIC: Partial<
  Record<SyntaxKind, (a: number, b: number) => number>
> = {
  [SyntaxKind.PlusToken]: (a, b) => a + b,
  [SyntaxKind.MinusToken]: (a, b) => a - b,
  [SyntaxKind.AsteriskToken]: (a, b) => a * b,
  [SyntaxKind.SlashToken]: (a, b) => a / b,
  [SyntaxKind.PercentToken]: (a, b) => a % b,
  [SyntaxKind.AsteriskAsteriskToken]: (a, b) => a ** b,
};

export type BoundKind =
  | "schema max/min"
  | "schema option"
  | "slice/substring/splice"
  | "Math.min/clamp"
  | "query limit"
  | "take(N)"
  | "length guard"
  | "limit-named const"
  | "limit-named property/default";

interface Bound {
  /** Where it is reported, and where the walk for its tag starts. */
  at: Node;
  kind: BoundKind;
  /** How a tag above more than one bound names it. */
  leaf: string;
  name: string;
  /** A same-file constant the bound reads, whose declaration's tag covers it. */
  reads?: Node;
  value: string;
}

/** The name a bound's value reads (`PAGE`, `SHEET.rows`), when it reads one. */
interface Read {
  head: string;
  path: string[];
}

const unwrap = (node: Node): Node => {
  let at = node;
  while (
    isParenthesizedExpression(at) ||
    isAsExpression(at) ||
    isSatisfiesExpression(at) ||
    isNonNullExpression(at) ||
    isTypeAssertion(at)
  ) {
    at = at.expression;
  }
  return at;
};

/** The property's name as written, when it has one. */
const keyOf = (node: Node): string | undefined => {
  if (!isPropertyAssignment(node)) {
    return undefined;
  }
  const { name } = node;
  return isIdentifier(name) || isStringLiteral(name) || isNumericLiteral(name)
    ? name.text
    : undefined;
};

const named = (name: string): boolean =>
  LIMIT_NAME.test(name) || LIMIT_CAMEL.test(name);

const values = (numbers: number[]): string => numbers.join(" | ");

/** 0 or 1: the unit interval's ends, and a selection of one thing. */
const unit = (n: number): boolean => n === 0 || n === 1;

/** Whether some value bounds more than one thing. */
const many = (numbers: number[]): boolean => numbers.some((n) => n > 1);

/** Whether `node` can hold no number, so the checker need not be asked. */
const notNumeric = (node: Node): boolean =>
  isStringLiteral(node) ||
  isNoSubstitutionTemplateLiteral(node) ||
  isObjectLiteralExpression(node) ||
  isSpreadElement(node) ||
  isArrowFunction(node) ||
  isFunctionExpression(node);

const readName = (node: Node): Read | undefined => {
  let at = unwrap(node);
  const path: string[] = [];
  for (;;) {
    if (isIdentifier(at)) {
      return { head: at.text, path };
    }
    if (isPropertyAccessExpression(at)) {
      path.unshift(at.name.text);
      at = unwrap(at.expression);
    } else if (
      isElementAccessExpression(at) &&
      isStringLiteral(at.argumentExpression)
    ) {
      path.unshift(at.argumentExpression.text);
      at = unwrap(at.expression);
    } else {
      return undefined;
    }
  }
};

/** Whether the value reads a limit-named constant, reported where that constant is declared. */
const readsNamed = (node: Node): boolean => {
  const read = readName(node);
  return read !== undefined && [read.head, ...read.path].some(named);
};

/** The nearest property or variable a bound sits in, as its name. */
const holderOf = (node: Node): string | undefined => {
  for (let at: Node | undefined = node.parent; at; at = at.parent) {
    const key = keyOf(at);
    if (key !== undefined) {
      return key;
    }
    if (isVariableDeclaration(at) && isIdentifier(at.name)) {
      return at.name.text;
    }
    if (isStatement(at) || isSourceFile(at)) {
      return undefined;
    }
  }
  return undefined;
};

/** How many values a node of a declaration holds: its properties' and variables' that are no object. */
const leaves = (outer: Node): number => {
  let count = 0;
  const walk = (node: Node): void => {
    if (
      (isPropertyAssignment(node) || isVariableDeclaration(node)) &&
      node.initializer &&
      !isObjectLiteralExpression(unwrap(node.initializer))
    ) {
      count += 1;
    }
    node.forEachChild(walk);
  };
  walk(outer);
  return Math.max(count, 1);
};

/** A comment and the whitespace before it, read from where a node's trivia starts. */
const COMMENT = /(\s*)(\/\/[^\n]*|\/\*[\s\S]*?\*\/)/uy;
const NEWLINE = /\n/u;
const NEWLINE_NEXT = /^[ \t]*\r?\n/u;

/**
 * The comments in the trivia from `pos` to the next token: those on lines
 * above it and one on its line before it (`items.slice(0, /* @limit … *\/ 3)`,
 * as a Svelte expression carries its tag), but not one trailing the token
 * before, on that token's line.
 */
const commentsBefore = (text: string, pos: number): string[] => {
  const found: string[] = [];
  let at = pos;
  let crossedLine = pos === 0;
  for (;;) {
    COMMENT.lastIndex = at;
    const match = COMMENT.exec(text);
    if (!match) {
      return found;
    }
    const [whole, space = "", comment = ""] = match;
    crossedLine ||= NEWLINE.test(space);
    at += whole.length;
    const trailing = !crossedLine && NEWLINE_NEXT.test(text.slice(at));
    if (!trailing) {
      found.push(comment);
    }
  }
};

const names = (comment: string, leaf: string): boolean =>
  new RegExp(`\\b${leaf.replace(REGEX_SPECIAL, "\\$&")}\\b`, "u").test(comment);

/** What a call is, as the bound kinds read it. */
interface Callee {
  fn?: string;
  method?: string;
  receiver?: string;
}

const calleeOf = (call: CallExpression): Callee => {
  const callee = call.expression;
  if (isIdentifier(callee)) {
    return { fn: callee.text };
  }
  if (isPropertyAccessExpression(callee)) {
    return {
      fn: callee.name.text,
      method: callee.name.text,
      receiver: isIdentifier(callee.expression)
        ? callee.expression.text
        : undefined,
    };
  }
  return {};
};

export const limitHasAReason = defineRule({
  name: "house/limit-has-a-reason",
  setup(context) {
    const { program } = context;
    const file: SourceFile = context.sourceFile;
    const { text } = file;
    const bounds: Bound[] = [];
    /** `LIMIT N` in SQL text: a range inside its literal, not a node of its own. */
    const sqlLimits: {
      begin: number;
      count: number;
      end: number;
      node: Node;
    }[] = [];
    const declarations = new Map<string, VariableDeclaration>();

    /** The number the checker types `node` as, or the numbers of its union of number literals. */
    const typed = (node: Node): number[] | undefined => {
      const type = program.getTypeAtLocation(node);
      if (!type) {
        return undefined;
      }
      if (typeof type.value === "number") {
        return [type.value];
      }
      const numbers = (type.types ?? []).flatMap((member) =>
        typeof member.value === "number" ? [member.value] : []
      );
      return numbers.length > 0 && numbers.length === type.types?.length
        ? numbers
        : undefined;
    };

    /** The fixed numbers `node` can be, or undefined when it is not fixed. */
    const fixed = (node: Node): number[] | undefined => {
      const at = unwrap(node);
      if (isNumericLiteral(at)) {
        return [Number(at.text.replaceAll("_", ""))];
      }
      if (isPrefixUnaryExpression(at)) {
        const sign = SIGN[at.operator];
        return sign === undefined
          ? undefined
          : fixed(at.operand)?.map((n) => sign * n);
      }
      if (isBinaryExpression(at)) {
        return arithmetic(at);
      }
      return notNumeric(at) ? undefined : typed(at);
    };

    /** Arithmetic of two fixed numbers, folded. */
    const arithmetic = (at: BinaryExpression): number[] | undefined => {
      const op = ARITHMETIC[at.operatorToken.kind];
      const [left] = (op && fixed(at.left)) || [];
      const [right] = (op && fixed(at.right)) || [];
      return op && left !== undefined && right !== undefined
        ? [op(left, right)]
        : undefined;
    };

    const callBound = (
      kind: BoundKind,
      call: Node,
      argument: Node,
      value: string,
      label: string
    ): void => {
      if (readsNamed(argument)) {
        return;
      }
      const holder = holderOf(call);
      bounds.push({
        kind,
        at: argument,
        leaf: holder ?? label,
        name: holder ? `${holder} ${label}` : label,
        value,
        reads: readName(argument) ? argument : undefined,
      });
    };

    /** One bound for a `Math.min` or `clamp…` call, at its first fixed argument, naming every fixed one. */
    const clampBound = (
      call: Node,
      args: readonly Node[],
      label: string
    ): void => {
      const found = args.flatMap((argument) => {
        const numbers =
          isSpreadElement(argument) || readsNamed(argument)
            ? undefined
            : fixed(argument);
        // A bound of 0 or 1 is unit-interval arithmetic, no limit.
        return numbers && !numbers.every(unit) ? [{ argument, numbers }] : [];
      });
      const [head] = found;
      if (head) {
        callBound(
          "Math.min/clamp",
          call,
          head.argument,
          found.map((f) => values(f.numbers)).join(", "),
          label
        );
      }
    };

    /** A schema's cap, or its floor above 1, as its first argument sets it. */
    const schemaBound = (
      call: CallExpression,
      label: string,
      caps: boolean
    ): void => {
      const [first] = call.arguments;
      const numbers = first && fixed(first);
      if (first && numbers && (caps || numbers.some((n) => n > 1))) {
        callBound("schema max/min", call, first, values(numbers), label);
      }
    };

    /** `slice(0, N)` or `substring(0, N)` with N > 0: a count of 0 or less drops from the end and caps nothing. */
    const sliceBound = (call: CallExpression, method: string): void => {
      const [first, second] = call.arguments;
      if (method === "slice" && call.arguments.length === 1 && first) {
        tailBound(call, first);
        return;
      }
      if (call.arguments.length !== 2 || !first || !second) {
        return;
      }
      const [start] = fixed(first) ?? [];
      const numbers = start === 0 ? fixed(second) : undefined;
      if (numbers?.some((n) => n > 0)) {
        callBound(
          "slice/substring/splice",
          call,
          second,
          values(numbers),
          `.${method}(0, N)`
        );
      }
    };

    /** `slice(-N)` with N > 1: the last N kept; `slice(-1)` is the last one. */
    const tailBound = (call: CallExpression, first: Node): void => {
      const numbers = fixed(first);
      if (numbers?.some((n) => n < -1)) {
        callBound(
          "slice/substring/splice",
          call,
          first,
          values(numbers.map((n) => -n)),
          ".slice(-N)"
        );
      }
    };

    /** `.limit(N)` (Drizzle) or `take(N)` with N > 1: `limit(1)` and `take(1)` select one row. */
    const countBound = (
      call: CallExpression,
      kind: BoundKind,
      label: string
    ): void => {
      const [first] = call.arguments;
      const numbers = first && fixed(first);
      if (first && numbers && many(numbers)) {
        callBound(kind, call, first, values(numbers), label);
      }
    };

    /** `splice(N)` with N > 0: `splice(0)` empties the array and `splice(-N)` drops from the end. */
    const spliceBound = (call: CallExpression): void => {
      const [first] = call.arguments;
      const numbers =
        call.arguments.length === 1 && first ? fixed(first) : undefined;
      if (first && numbers?.some((n) => n > 0)) {
        callBound(
          "slice/substring/splice",
          call,
          first,
          values(numbers),
          ".splice(N)"
        );
      }
    };

    /** `Math.min(x, N)`: the one call on `Math` that caps. */
    const mathBound = (
      call: CallExpression,
      method: string | undefined
    ): void => {
      if (method === "min" && call.arguments.length >= 2) {
        clampBound(call, call.arguments, "Math.min");
      }
    };

    /** The bounds a method's name alone tells. */
    const byMethod: Record<string, (call: CallExpression) => void> = {
      slice: (call) => sliceBound(call, "slice"),
      substring: (call) => sliceBound(call, "substring"),
      splice: spliceBound,
      limit: (call) => countBound(call, "query limit", ".limit"),
    };

    const visitCall = (call: CallExpression): void => {
      const { fn, method, receiver } = calleeOf(call);
      const args = call.arguments;
      if (receiver === "Math") {
        mathBound(call, method);
      } else if (method === "max" || method === "min") {
        schemaBound(call, `.${method}`, method === "max");
      } else if (fn && (ACTION_MAX.has(fn) || ACTION_MIN.has(fn))) {
        schemaBound(call, fn, ACTION_MAX.has(fn));
      } else if (method && Object.hasOwn(byMethod, method)) {
        byMethod[method]?.(call);
      } else if (fn === "take") {
        countBound(call, "take(N)", "take");
      } else if (fn && CLAMP.test(fn)) {
        clampBound(call, args.slice(1), fn);
      }
    };

    const constBounds = (value: Node, path: string, leaf: string): void => {
      const at = unwrap(value);
      if (isObjectLiteralExpression(at)) {
        for (const property of at.properties) {
          const key = keyOf(property);
          if (key !== undefined && isPropertyAssignment(property)) {
            constBounds(property.initializer, `${path}.${key}`, key);
          }
        }
        return;
      }
      const numbers = fixed(at);
      const { parent } = value;
      if (numbers && parent) {
        bounds.push({
          kind: "limit-named const",
          at:
            isVariableDeclaration(parent) || isPropertyAssignment(parent)
              ? parent.name
              : value,
          leaf,
          name: path,
          value: values(numbers),
        });
      }
    };

    const visitDeclaration = (declaration: VariableDeclaration): void => {
      const { name, initializer, parent: list } = declaration;
      if (!(isIdentifier(name) && initializer)) {
        return;
      }
      declarations.set(name.text, declaration);
      if (
        list &&
        isVariableDeclarationList(list) &&
        CONST_KEYWORD.test(text.slice(list.getStart(file))) &&
        named(name.text)
      ) {
        constBounds(initializer, name.text, name.text);
      }
    };

    const visitOption = (property: PropertyAssignment): void => {
      const key = keyOf(property);
      if (key === undefined || !(OPTION_MAX.has(key) || OPTION_MIN.has(key))) {
        return;
      }
      const numbers = fixed(property.initializer);
      if (
        numbers &&
        (OPTION_MAX.has(key) || numbers.some((n) => n > 1)) &&
        !readsNamed(property.initializer)
      ) {
        bounds.push({
          kind: "schema option",
          at: property.name,
          leaf: key,
          name: key,
          value: values(numbers),
          reads: readName(property.initializer)
            ? property.initializer
            : undefined,
        });
      }
    };

    /** An object property or a default parameter named as a limit, holding a number. */
    const visitNamedValue = (
      name: Node | undefined,
      value: Node | undefined
    ): void => {
      const key =
        name && (isIdentifier(name) || isStringLiteral(name))
          ? name.text
          : undefined;
      if (
        key === undefined ||
        value === undefined ||
        !LIMIT_PROPERTY.test(key) ||
        OPTION_MAX.has(key) ||
        readsNamed(value)
      ) {
        return;
      }
      const numbers = fixed(value);
      if (name && numbers && !bounds.some((b) => b.at === name)) {
        bounds.push({
          kind: "limit-named property/default",
          at: name,
          leaf: key,
          name: key,
          value: values(numbers),
          reads: readName(value) ? value : undefined,
        });
      }
    };

    /** `.length` or `.size` compared with a fixed N > 1. */
    const visitGuard = (guard: BinaryExpression): void => {
      if (!isRelationalOperator(guard.operatorToken.kind)) {
        return;
      }
      const sized = (side: Node): string | undefined => {
        const at = unwrap(side);
        return isPropertyAccessExpression(at) &&
          (at.name.text === "length" || at.name.text === "size")
          ? at.name.text
          : undefined;
      };
      const pairs: [Node, Node][] = [
        [guard.left, guard.right],
        [guard.right, guard.left],
      ];
      for (const [measured, against] of pairs) {
        const what = sized(measured);
        const numbers =
          what && !readsNamed(against) ? fixed(against) : undefined;
        if (what && numbers && many(numbers)) {
          callBound(
            "length guard",
            guard,
            against,
            values(numbers),
            `.${what}`
          );
          return;
        }
      }
    };

    /** A literal `LIMIT N` in SQL text, N > 1, reported at its number. */
    const visitSql = (literal: Node): void => {
      const start = literal.getStart(file);
      const written = text.slice(start, literal.end);
      for (const match of written.matchAll(SQL_LIMIT)) {
        const count = Number(match[1]);
        if (count > 1) {
          const at =
            start + match.index + match[0].length - (match[1] ?? "").length;
          sqlLimits.push({
            node: literal,
            begin: at,
            end: at + (match[1] ?? "").length,
            count,
          });
        }
      }
    };

    const visit = (node: Node): void => {
      if (isVariableDeclaration(node)) {
        visitDeclaration(node);
      } else if (isPropertyAssignment(node)) {
        visitOption(node);
        visitNamedValue(node.name, node.initializer);
      } else if (isParameterDeclaration(node) || isBindingElement(node)) {
        visitNamedValue(node.name, node.initializer);
      } else if (isCallExpression(node)) {
        visitCall(node);
      } else if (isBinaryExpression(node)) {
        visitGuard(node);
      } else if (
        isStringLiteral(node) ||
        isNoSubstitutionTemplateLiteral(node) ||
        isTemplateHead(node) ||
        isTemplateMiddle(node) ||
        isTemplateTail(node)
      ) {
        visitSql(node);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);

    /** The comment carrying a valid tag directly before `pos`, if one does. */
    const tagAt = (pos: number): string | undefined =>
      commentsBefore(text, pos).find((comment) => TAG.test(comment));

    const within = (outer: Node): number =>
      bounds.filter((b) => b.at.pos >= outer.pos && b.at.end <= outer.end)
        .length;

    /** The tags on `at`: above it, and above a chained call's `.max(…)`. */
    const tagsOn = (at: Node): (string | undefined)[] =>
      isCallExpression(at) && isPropertyAccessExpression(at.expression)
        ? [tagAt(at.pos), tagAt(at.expression.expression.end)]
        : [tagAt(at.pos)];

    /** Whether a tag on `start` or a node holding it, up to its statement, covers `leaf`. */
    const tagged = (
      start: Node,
      leaf: string,
      count: (n: Node) => number
    ): boolean => {
      for (let at: Node | undefined = start; at; at = at.parent) {
        const holder = at;
        const covers = tagsOn(holder).some(
          (comment) =>
            comment !== undefined &&
            (count(holder) <= 1 || names(comment, leaf))
        );
        if (covers) {
          return true;
        }
        if (isStatement(at) || isSourceFile(at)) {
          return false;
        }
      }
      return false;
    };

    /** The value at `path` in a declaration's object literal. */
    const valueAt = (
      declaration: VariableDeclaration,
      path: string[]
    ): Node | undefined => {
      let at: Node | undefined = declaration.initializer;
      for (const step of path) {
        const object = at && unwrap(at);
        const property =
          object && isObjectLiteralExpression(object)
            ? object.properties.find((p) => keyOf(p) === step)
            : undefined;
        at =
          property && isPropertyAssignment(property)
            ? property.initializer
            : undefined;
      }
      return at;
    };

    /** Whether the same-file constant a bound reads carries the tag at its declaration. */
    const declaredTagged = (reads: Node): boolean => {
      const read = readName(reads);
      const declaration = read && declarations.get(read.head);
      const value = read && declaration && valueAt(declaration, read.path);
      return (
        read !== undefined &&
        value !== undefined &&
        tagged(value, read.path.at(-1) ?? read.head, leaves)
      );
    };

    const inside = (outer: Node): number =>
      within(outer) +
      sqlLimits.filter((l) => l.begin >= outer.pos && l.end <= outer.end)
        .length;
    for (const limit of sqlLimits) {
      if (!tagged(limit.node, "LIMIT", inside)) {
        context.report({
          message: `${MESSAGE} SQL LIMIT = ${limit.count}`,
          range: { begin: limit.begin, end: limit.end },
        });
      }
    }

    for (const bound of bounds) {
      const stands =
        tagged(bound.at, bound.leaf, inside) ||
        (bound.reads !== undefined && declaredTagged(bound.reads));
      if (!stands) {
        context.report({
          message: `${MESSAGE} ${bound.name} = ${bound.value}`,
          range: { begin: bound.at.getStart(file), end: bound.at.end },
        });
      }
    }
  },
});
