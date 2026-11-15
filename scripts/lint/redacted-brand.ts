/**
 * A `Redacted` value is made by packages/hub/src/redactor.ts alone: every
 * send to a client, broadcast, relay of an ask, report to a parent session
 * and push takes one, so a value the hub did not pass through the redactor
 * never reaches a browser, an app or another session. The compiler holds
 * most of it: the class's private field makes the type nominal (an object
 * literal, a spread or a cast from another type does not compile), and a
 * parameter that takes the brand is written `<F extends Redacted<X>>(value:
 * Typed<F>)`, which refuses a value of type `any` (redactor.ts `Typed`). At
 * run time a value the redactor did not make holds nothing to send, and its
 * send throws. This rule closes what the compiler lets through, outside
 * redactor.ts:
 *
 * - **Named only as a parameter's, a return's or a type parameter's type.**
 *   `Redacted` is written in a parameter's type, as the return type of a
 *   function with a body or of a signature (an interface's member, a
 *   callback's), or as the constraint of a function's type parameter.
 *   Anywhere else is a finding: a type alias, a variable's or a property's
 *   type, a cast (`as`), a type argument (`stamp<Redacted<…>>()`), a type
 *   guard or assertion (`v is Redacted<…>`, by any name for the brand), a
 *   declared function with no body (`declare function forge():
 *   Redacted<…>`).
 * - **Never `never`, never `any` handed back.** A cast to `never` (`x as
 *   never`, which passes for any type the brand included), and a `return`
 *   of a value of type `any` or `never` from a function whose return type
 *   names `Redacted`.
 * - **Never made by a cast or a call that names its answer.** A cast whose
 *   type is the brand (`as unknown as ReturnType<typeof redactedAsk>`), a
 *   call given its type arguments whose answer is the brand (a generic
 *   helper answering whatever it is asked for), and a call whose answer is
 *   the brand joined with something else (`Object.assign(redactedAsk(ask),
 *   { payload })`).
 *
 * Every check reads the file it lints alone (its nodes and their types),
 * never a declaration in another file, so a run over some files reports
 * what a run over all of them does. golar.config.ts runs it over the hub's
 * source and scripts/lint/fixtures/redacted-brand.ts, which holds what it
 * must report (expected.txt).
 */
import { defineRule, type Program } from "golar/unstable";
import {
  isArrowFunction,
  isAsExpression,
  isBlock,
  isCallExpression,
  isCallSignatureDeclaration,
  isFunctionDeclaration,
  isFunctionExpression,
  isFunctionTypeNode,
  isGetAccessorDeclaration,
  isIdentifier,
  isInterfaceDeclaration,
  isMethodDeclaration,
  isMethodSignatureDeclaration,
  isParameterDeclaration,
  isPropertySignatureDeclaration,
  isQualifiedName,
  isReturnStatement,
  isTypeLiteralNode,
  isTypeNode,
  isTypeParameterDeclaration,
  isTypePredicateNode,
  isTypeReferenceNode,
  type Node,
  type SourceFile,
  SyntaxKind,
  type Type,
  TypeFlags,
} from "golar/unstable-tsgo";

const BRAND = "Redacted";
const NEVER = SyntaxKind.NeverKeyword;
/** The one module that makes the brand. */
const MAKER = "packages/hub/src/redactor.ts";

const PLACE =
  "`Redacted` outside packages/hub/src/redactor.ts is named only as a parameter's, a return's or a type parameter's type: pass the value through redactor.ts (redactedFrame, redactedAsk, redacted, redactedWords), never alias, cast to, guard, declare or store the brand.";
const UNTYPED =
  "A value of type `any` or `never` where a `Redacted` value is taken: it was never through the redactor. Pass it through redactor.ts.";
const MADE =
  "A `Redacted` value made outside packages/hub/src/redactor.ts (a cast, a call told what it answers, or the brand joined with other content): pass the value through redactor.ts.";

/** Whether `type` carries `flag`, one bit of TypeFlags' set. */
const is = (type: Type, flag: TypeFlags): boolean =>
  Math.floor(type.flags / flag) % 2 === 1;

/** Whether `type` is the brand, or a union or intersection with it among its members. */
const isBrand = (type: Type | undefined, depth = 0): boolean => {
  if (!type || depth > 8) {
    return false;
  }
  if (type.types) {
    return type.types.some((member) => isBrand(member, depth + 1));
  }
  return (type.target ?? type).symbol?.name === BRAND;
};

/** Whether `type` is the brand joined with something else (`A & Redacted<B>`). */
const isJoinedBrand = (type: Type | undefined): boolean =>
  type !== undefined &&
  is(type, TypeFlags.Intersection) &&
  (type.types?.some((member) => isBrand(member)) ?? false);

const sameNode = (a: Node | undefined, b: Node): boolean =>
  a !== undefined && a.pos === b.pos && a.end === b.end;

/** Whether `node` is a reference to the brand by its name (`Redacted<…>`, `x.Redacted<…>`). */
const namesBrand = (node: Node): boolean => {
  if (!isTypeReferenceNode(node)) {
    return false;
  }
  const { typeName } = node;
  return (
    (isIdentifier(typeName) && typeName.text === BRAND) ||
    (isQualifiedName(typeName) && typeName.right.text === BRAND)
  );
};

/** Whether `node`, a type, names the brand anywhere inside it. */
const mentionsBrand = (node: Node | undefined): boolean => {
  if (!node) {
    return false;
  }
  if (namesBrand(node)) {
    return true;
  }
  let found = false;
  node.forEachChild((child) => {
    found ||= mentionsBrand(child);
    return found ? true : undefined;
  });
  return found;
};

/** A function with a body: its return type is a place the brand may be named. */
const hasBody = (node: Node): boolean =>
  (isFunctionDeclaration(node) ||
    isMethodDeclaration(node) ||
    isArrowFunction(node) ||
    isFunctionExpression(node) ||
    isGetAccessorDeclaration(node)) &&
  node.body !== undefined;

/** A signature with no body of its own: a function type, a method's, a call's. */
const isSignature = (node: Node): boolean =>
  isFunctionTypeNode(node) ||
  isMethodSignatureDeclaration(node) ||
  isCallSignatureDeclaration(node);

/** What `node` writes as its type (a parameter's, a return's), if it writes one. */
const typeOf = (node: Node): Node | undefined => (node as { type?: Node }).type;

/** What one step up from `node` to `parent` says of the brand named below it: it may stand, it may not, or the step above decides. */
type Step = "allowed" | "denied" | "up" | "returned";

/** Whether `node` is the type `parent` writes. */
const writtenAs = (parent: Node, node: Node): boolean =>
  sameNode(typeOf(parent), node);

/** A type parameter whose constraint is `node`, on a function or a signature. */
const constrainsFunction = (parent: Node, node: Node): boolean => {
  if (!isTypeParameterDeclaration(parent)) {
    return false;
  }
  const owner = parent.parent;
  return (
    sameNode(parent.constraint, node) &&
    owner !== undefined &&
    (hasBody(owner) || isSignature(owner))
  );
};

/** {@link allowedPlace}'s step from `node` to its `parent`. */
const stepUp = (node: Node, parent: Node, returned: boolean): Step => {
  if (isParameterDeclaration(parent) || hasBody(parent)) {
    return writtenAs(parent, node) ? "allowed" : "denied";
  }
  if (isTypeParameterDeclaration(parent)) {
    return constrainsFunction(parent, node) ? "allowed" : "denied";
  }
  if (isSignature(parent)) {
    return writtenAs(parent, node) ? "returned" : "denied";
  }
  if (isPropertySignatureDeclaration(parent)) {
    return writtenAs(parent, node) ? "up" : "denied";
  }
  if (isInterfaceDeclaration(parent)) {
    return returned ? "allowed" : "denied";
  }
  const typed =
    !isTypePredicateNode(parent) &&
    (isTypeNode(parent) || isTypeLiteralNode(parent));
  return typed ? "up" : "denied";
};

/**
 * Whether the brand named at `reference` stands where it may (module): in a
 * parameter's type, as a type parameter's constraint on a function or a
 * signature, or as the return type of a function with a body or of a
 * signature that itself stands in a parameter's type or an interface.
 */
const allowedPlace = (reference: Node): boolean => {
  let node = reference;
  let returned = false;
  for (let { parent } = node; parent; { parent } = parent) {
    const step = stepUp(node, parent, returned);
    if (step === "allowed" || step === "denied") {
      return step === "allowed";
    }
    returned ||= step === "returned";
    node = parent;
  }
  return false;
};

/** Whether `node`'s type is `any` or `never`. */
const untyped = (program: Program, node: Node): boolean => {
  const type = program.getTypeAtLocation(node);
  return (
    type !== undefined && (is(type, TypeFlags.Any) || is(type, TypeFlags.Never))
  );
};

/** The function a `return` at `node` returns from. */
const enclosingFunction = (node: Node): Node | undefined => {
  for (let { parent } = node; parent; { parent } = parent) {
    if (hasBody(parent)) {
      return parent;
    }
  }
};

/** What a `return` statement or an arrow's expression body hands back, and the function it hands it from. */
const handedBack = (node: Node): { from: Node; value: Node } | undefined => {
  if (isReturnStatement(node) && node.expression) {
    const from = enclosingFunction(node);
    return from ? { from, value: node.expression } : undefined;
  }
  if (isArrowFunction(node) && !isBlock(node.body)) {
    return { from: node, value: node.body };
  }
};

const isNeverCast = (node: Node): boolean =>
  isAsExpression(node) && node.type.kind === NEVER;

/** What `node` names of the brand where it may not stand, by name or by type (module: named only). */
const placeFinding = (node: Node): string | undefined =>
  namesBrand(node) && !allowedPlace(node) ? PLACE : undefined;

/** A cast or a call at `node` that makes the brand, or a cast to `never` (module). */
const madeFinding = (program: Program, node: Node): string | undefined => {
  // A guard or an assertion that answers the brand by another name.
  if (
    isTypePredicateNode(node) &&
    node.type &&
    !mentionsBrand(node.type) &&
    isBrand(program.getTypeAtLocation(node.type))
  ) {
    return PLACE;
  }
  if (isNeverCast(node)) {
    return UNTYPED;
  }
  if (isAsExpression(node)) {
    return isBrand(program.getTypeAtLocation(node)) ? MADE : undefined;
  }
  if (!isCallExpression(node)) {
    return;
  }
  const answer = program.getTypeAtLocation(node);
  return isJoinedBrand(answer) ||
    ((node.typeArguments?.length ?? 0) > 0 && isBrand(answer))
    ? MADE
    : undefined;
};

/** Whether `back` hands a value of type `any` or `never` back from a function that answers the brand; a cast to `never` is reported as the cast. */
const untypedBack = (
  program: Program,
  back: { from: Node; value: Node }
): boolean =>
  !isNeverCast(back.value) &&
  mentionsBrand(typeOf(back.from)) &&
  untyped(program, back.value);

export const redactedBrand = defineRule({
  name: "house/redacted-brand",
  setup(context) {
    const { program } = context;
    const file: SourceFile = context.sourceFile;
    if (file.fileName.endsWith(MAKER)) {
      return;
    }
    const report = (node: Node, message: string): void => {
      context.report({
        message,
        range: { begin: node.getStart(file), end: node.end },
      });
    };
    const visit = (node: Node): void => {
      const message = placeFinding(node) ?? madeFinding(program, node);
      if (message) {
        report(node, message);
      }
      const back = handedBack(node);
      if (back && untypedBack(program, back)) {
        report(back.value, UNTYPED);
      }
      node.forEachChild(visit);
    };
    file.forEachChild(visit);
  },
});
