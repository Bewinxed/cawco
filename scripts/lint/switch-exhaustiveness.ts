/**
 * Every state is handled: a switch over a union names each member, and a
 * `default:` stands in for none. This is typescript-eslint's
 * switch-exhaustiveness-check with its default options, ported from
 * tsgolint's typescript-go port of it (oxc-project/tsgolint
 * internal/rules/switch_exhaustiveness_check): with those options it reports
 * only a switch that leaves a member of its union unmatched, with the same
 * message. golar.config.ts runs it, and scripts/switch-check.ts reads what
 * it reports.
 *
 * Golar reads a `.svelte` file through svelte2tsx, so a type that a Svelte
 * file exports keeps its members wherever it is imported.
 *
 * One rule is added: a switch over a value that has no type (`any`, or the
 * error type of something that never resolved) is a finding. None of its
 * cases can be checked, so the value gets a type where it is switched on.
 * A switch over a type that is not a union (`string`, `number`) has a type,
 * and is left alone, as the rule leaves it.
 *
 * Golar 0.1.11's rule API is worked around in three places, each to go when
 * Golar does it itself:
 * - it reads a report's range as UTF-8 bytes, while nodes carry UTF-16
 *   offsets ({@link bytesTo});
 * - a type parameter's decoded type has no constraint, so the rule reads
 *   the `extends` clause from the declaration ({@link constrained});
 * - its file list is globs (golar.config.ts escapes each path).
 */
import { defineRule, type Program } from "golar/unstable";
import {
  isCaseClause,
  isSwitchStatement,
  isTypeParameterDeclaration,
  type Node,
  type SourceFile,
  type SwitchStatement,
  type Type,
  TypeFlags,
} from "golar/unstable-tsgo";

/** Whether `type` carries any of `flags`. */
const is = (type: Type, ...flags: TypeFlags[]): boolean =>
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeFlags is a bit set
  flags.some((flag) => (type.flags & flag) !== 0);

/** The types the rule names a case for: a literal, `undefined`, `null` or a unique symbol. */
const LITERAL_LIKE = [
  TypeFlags.Literal,
  TypeFlags.Undefined,
  TypeFlags.Null,
  TypeFlags.UniqueESSymbol,
];

const encoder = new TextEncoder();
/** The UTF-8 byte offset of `at`, a UTF-16 offset into `text`. */
const bytesTo = (text: string, at: number): number =>
  encoder.encode(text.slice(0, at)).length;

/** The `extends` clause of the type parameter `name` in scope at `at`, if it has one. */
const constraintAt = (name: string, at: Node): Node | undefined => {
  for (let node: Node | undefined = at; node; node = node.parent) {
    const { typeParameters } = node as { typeParameters?: readonly Node[] };
    const declaration = typeParameters?.find(
      (parameter) =>
        isTypeParameterDeclaration(parameter) && parameter.name.text === name
    );
    if (declaration && isTypeParameterDeclaration(declaration)) {
      return declaration.constraint;
    }
  }
  return undefined;
};

/**
 * `type`, or the constraint of the type parameter it is, at any depth:
 * tsgolint's GetConstrainedTypeAtLocation, which takes the checker's base
 * constraint. Golar decodes no constraint of a type parameter, so it is the
 * type of the `extends` clause of the declaration in scope at `at`.
 */
const constrained = (
  program: Program,
  type: Type | undefined,
  at: Node
): Type | undefined => {
  let found = type;
  let scope = at;
  // A circular constraint is a type error; the walk stops at its first repeat.
  const seen = new Set<number>();
  while (
    found?.symbol &&
    is(found, TypeFlags.TypeParameter) &&
    !seen.has(found.id)
  ) {
    seen.add(found.id);
    const constraint = constraintAt(found.symbol.name, scope);
    if (!constraint) {
      break;
    }
    found = program.getTypeAtLocation(constraint);
    scope = constraint;
  }
  return found;
};

/** How a missing case reads in the message: the checker's typeToString of a literal type. */
const caseText = (type: Type): string => {
  if (is(type, TypeFlags.ESSymbolLike)) {
    return `typeof ${type.symbol?.name}`;
  }
  if (is(type, TypeFlags.EnumLiteral) && type.symbol?.parent) {
    return `${type.symbol.parent.name}.${type.symbol.name}`;
  }
  if (is(type, TypeFlags.StringLiteral)) {
    return JSON.stringify(type.value);
  }
  if (is(type, TypeFlags.BigIntLiteral)) {
    return `${type.value}n`;
  }
  if (is(type, TypeFlags.NumberLiteral, TypeFlags.BooleanLiteral)) {
    return String(type.value);
  }
  return type.intrinsicName ?? "unknown";
};

/** What is wrong with `node`, or null when it names every member of its union. */
const verdict = (program: Program, node: SwitchStatement): string | null => {
  const typeOf = (expression: Node, at: Node) =>
    constrained(program, program.getTypeAtLocation(expression), at);
  const switched = typeOf(node.expression, node);
  if (!switched || is(switched, TypeFlags.Any)) {
    return `Switch over an untyped value (${switched?.intrinsicName ?? "no type"}): none of its cases can be checked. Give the value it switches on a type.`;
  }
  const matched = new Set<number>();
  let matchesUndefined = false;
  for (const clause of node.caseBlock.clauses) {
    const type = isCaseClause(clause)
      ? typeOf(clause.expression, clause)
      : undefined;
    if (type) {
      matched.add(type.id);
      matchesUndefined ||= is(type, TypeFlags.Undefined);
    }
  }
  const missing: Type[] = [];
  // tsgolint's TypeRecurser: every member of a union or intersection, at any depth.
  const collect = (type: Type | undefined): void => {
    if (!type) {
      return;
    }
    if (is(type, TypeFlags.UnionOrIntersection)) {
      for (const part of type.types ?? []) {
        collect(constrained(program, part, node));
      }
      return;
    }
    // "missing", "optional" and "undefined" are different types that a
    // `case undefined` matches alike (tsgolint).
    const unmatched =
      is(type, ...LITERAL_LIKE) &&
      !matched.has(type.id) &&
      !(matchesUndefined && is(type, TypeFlags.Undefined));
    if (unmatched) {
      missing.push(type);
    }
  };
  collect(switched);
  return missing.length > 0
    ? `Switch is not exhaustive. Cases not matched: ${missing.map(caseText).join(" | ")}`
    : null;
};

export const switchExhaustiveness = defineRule({
  // Its name in Golar's report, the one typescript-eslint gives it.
  name: "switch-exhaustiveness-check",
  setup(context) {
    const { program } = context;
    const file: SourceFile = context.sourceFile;
    const visit = (node: Node): void => {
      if (isSwitchStatement(node)) {
        const message = verdict(program, node);
        if (message) {
          // Where typescript-eslint reports it: the switched-on expression.
          context.report({
            message,
            range: {
              begin: bytesTo(file.text, node.expression.getStart(file)),
              end: bytesTo(file.text, node.expression.end),
            },
          });
        }
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
