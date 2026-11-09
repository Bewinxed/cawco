/**
 * The order openapi.ts writes a schema's properties and a union's members
 * in: the order the code writes them.
 *
 * The checker lists an interface's, a type literal's and an object
 * literal's properties as they are written, a spread's or an intersection's
 * part by part. Two things it orders by its types' ids instead, which move
 * with which module the program happened to read first:
 *
 * - a mapped type's properties (`Pick`, `Omit`, `Partial`, `Record`,
 *   Drizzle's row types). They take the order of what they are mapped from:
 *   a homomorphic or `Pick`-shaped type's source (TypeScript links each
 *   property to the one it maps), one that renames its keys
 *   (`[K in keyof X as …]`) the type X its keys come from, and one over a
 *   union of keys (`Record<"a" | "b", …>`) that union as it is written.
 *   Each mapped type's properties keep the places the checker gave that
 *   group among the rest.
 * - a union's members. They take the order the union is written in: its
 *   alias's declaration (`type FramePayload = A | B`, through the aliases
 *   it is made from: `Exclude<Member, "you">` reads `Member`, and
 *   `(typeof MEMBERS)[number]` the array as written), else the declared
 *   type of the property it is read for (`stage?: A | B`,
 *   `items: (A | B)[]`). A union written nowhere (a handler's several
 *   returns, read as one type) keeps the checker's order, which for returns
 *   is the order they are written in; keys of a union written nowhere go
 *   by name.
 *
 * Reads what the checker records of a mapped property (`links`) and of an
 * instantiated mapped type (`mapper`, `modifiersType`), and steps in where
 * the generator reads a property and a union: none of these is published,
 * so this reads the generator's pinned TypeScript and typescript-json-schema
 * as they are, and fails when the generator's steps are gone.
 */
import type { ts as TS } from "typescript-json-schema";

type Ts = typeof TS;

/** What the checker records of a property a mapped type made. */
interface MappedLinks {
  /** The literal type of the key it was made for. */
  keyType?: TS.Type;
  mappedType?: MappedType;
  /** The source type's property it maps, when the mapped type has a source. */
  syntheticOrigin?: TS.Symbol;
}
interface Mapper {
  func?: (type: TS.Type) => TS.Type;
  kind: number;
  mapper1?: Mapper;
  mapper2?: Mapper;
  source?: TS.Type;
  sources?: TS.Type[];
  target?: TS.Type;
  targets?: (TS.Type | (() => TS.Type))[];
}
interface MappedType extends TS.Type {
  declaration: TS.MappedTypeNode;
  mapper?: Mapper;
  modifiersType?: TS.Type;
}
/** The checker's kinds of mapper, by name (`ts.TypeMapKind`, unpublished). */
type MapperKinds = Record<"Array" | "Deferred" | "Function" | "Simple", number>;

/** The schema generator's private steps a property and a union are read in. */
interface GeneratorSteps {
  getDefinitionForProperty: (property: TS.Symbol, node: TS.Node) => unknown;
  getUnionDefinition: (
    union: TS.UnionType,
    modifier: string,
    definition: object
  ) => object;
}

/** How many aliases deep a written union is looked for. */
const ALIAS_DEPTH = 4;

const linksOf = (symbol: TS.Symbol): MappedLinks =>
  (symbol as TS.Symbol & { links?: MappedLinks }).links ?? {};

/** Whether a flag set holds a flag. */
const has = (flags: number, flag: number): boolean =>
  // biome-ignore lint/suspicious/noBitwiseOperators: TypeScript's flags are bit sets
  (flags & flag) !== 0;

/** Where `member` is in a written list: a literal by its value, as an array's elements are fresh. */
const indexIn = (written: TS.Type[], member: TS.Type): number =>
  written.findIndex(
    (one) =>
      one === member ||
      (one.isLiteral() &&
        member.isLiteral() &&
        one.flags === member.flags &&
        one.value === member.value)
  );

/** Places by a written list's order, those it does not hold last, by name. */
const byPlace = <T>(
  items: T[],
  place: (item: T) => number,
  name: (item: T) => string
): T[] => {
  const rank = (item: T): [number, string] => {
    const at = place(item);
    return [at < 0 ? Number.POSITIVE_INFINITY : at, name(item)];
  };
  return items
    .map((item) => ({ item, rank: rank(item) }))
    .toSorted((a, b) => {
      if (a.rank[0] !== b.rank[0]) {
        return a.rank[0] < b.rank[0] ? -1 : 1;
      }
      return a.rank[1] < b.rank[1] ? -1 : Number(a.rank[1] > b.rank[1]);
    })
    .map(({ item }) => item);
};

/** What a type parameter is in an instantiation, by the checker's mapper. */
const through = (
  kinds: MapperKinds,
  mapper: Mapper | undefined,
  type: TS.Type
): TS.Type => {
  if (!mapper) {
    return type;
  }
  if (mapper.kind === kinds.Simple) {
    return mapper.source === type ? (mapper.target ?? type) : type;
  }
  if (mapper.kind === kinds.Array || mapper.kind === kinds.Deferred) {
    const target = mapper.targets?.[mapper.sources?.indexOf(type) ?? -1];
    if (target === undefined) {
      return type;
    }
    return typeof target === "function" ? target() : target;
  }
  if (mapper.kind === kinds.Function) {
    return mapper.func ? mapper.func(type) : type;
  }
  return through(kinds, mapper.mapper2, through(kinds, mapper.mapper1, type));
};

/** The first `keyof X` written under a node: its X. */
const keyofOperand = (ts: Ts, node: TS.Node): TS.TypeNode | undefined => {
  if (
    ts.isTypeOperatorNode(node) &&
    node.operator === ts.SyntaxKind.KeyOfKeyword
  ) {
    return node.type;
  }
  return ts.forEachChild(node, (child) => keyofOperand(ts, child));
};

/**
 * `checker`: the program's checker listing properties in written order, for
 * the generator to be built on. `readThrough`: steps into the built
 * generator, so each union it writes is in written order and each property
 * it reads is where the unions and keys under it are looked for.
 */
export const writtenOrder = (
  ts: Ts,
  checker: TS.TypeChecker
): { checker: TS.TypeChecker; readThrough: (generator: unknown) => void } => {
  const kinds = (ts as unknown as { TypeMapKind: MapperKinds }).TypeMapKind;
  /** The declared types of the properties being read, innermost last. */
  const reading: TS.Node[] = [];

  /** The alias a type reference names, followed through imports. */
  const aliasAt = (node: TS.TypeReferenceNode): TS.Node | undefined => {
    let symbol = checker.getSymbolAtLocation(node.typeName);
    if (symbol && has(symbol.flags, ts.SymbolFlags.Alias)) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const declared = symbol?.declarations?.[0];
    return declared && ts.isTypeAliasDeclaration(declared)
      ? declared.type
      : undefined;
  };
  /** The elements of the array a `typeof X` names (`(typeof KINDS)[number]`), as written. */
  const elementsOf = (node: TS.TypeQueryNode): TS.Type[] | undefined => {
    let symbol = checker.getSymbolAtLocation(node.exprName);
    if (symbol && has(symbol.flags, ts.SymbolFlags.Alias)) {
      symbol = checker.getAliasedSymbol(symbol);
    }
    const declared = symbol?.valueDeclaration;
    let value =
      declared && ts.isVariableDeclaration(declared)
        ? declared.initializer
        : undefined;
    while (
      value &&
      (ts.isAsExpression(value) ||
        ts.isSatisfiesExpression(value) ||
        ts.isParenthesizedExpression(value))
    ) {
      value = value.expression;
    }
    return value && ts.isArrayLiteralExpression(value)
      ? value.elements.map((element) => checker.getTypeAtLocation(element))
      : undefined;
  };
  /** What a node writes as a list of members: a union's, or a `typeof` array's elements. */
  const listedAt = (node: TS.Node): TS.Type[] | undefined => {
    if (ts.isUnionTypeNode(node)) {
      return node.types.flatMap((member) => {
        const type = checker.getTypeFromTypeNode(member);
        return type.isUnion() ? type.types : [type];
      });
    }
    return ts.isTypeQueryNode(node) ? elementsOf(node) : undefined;
  };
  /**
   * The members of the first union written under `nodes` (and the aliases
   * they name) that holds every one of `members` but undefined.
   */
  const writtenFor = (
    members: readonly TS.Type[],
    nodes: TS.Node[]
  ): TS.Type[] | undefined => {
    const seen = new Set<TS.Node>();
    const holdsAll = (written: TS.Type[]): boolean =>
      members.every(
        (member) =>
          indexIn(written, member) >= 0 ||
          has(member.flags, ts.TypeFlags.Undefined)
      );
    const visit = (at: TS.Node, depth: number): TS.Type[] | undefined => {
      if (seen.has(at)) {
        return undefined;
      }
      seen.add(at);
      const written = listedAt(at);
      if (written && holdsAll(written)) {
        return written;
      }
      const alias =
        ts.isTypeReferenceNode(at) && depth < ALIAS_DEPTH
          ? aliasAt(at)
          : undefined;
      return (
        (alias && visit(alias, depth + 1)) ||
        ts.forEachChild(at, (child) => visit(child, depth))
      );
    };
    for (const node of nodes) {
      const found = visit(node, 0);
      if (found) {
        return found;
      }
    }
    return undefined;
  };
  /** Where a union is written: its alias's declaration, then the property being read. */
  const whereWritten = (type: TS.Type): TS.Node[] => {
    const alias = type.aliasSymbol?.declarations?.[0];
    return [
      ...(alias && ts.isTypeAliasDeclaration(alias) ? [alias.type] : []),
      ...reading.slice(-1),
    ];
  };

  const orders = new Map<TS.Type, TS.Symbol[]>();
  /** Where a renamed key's source (`[K in keyof X as …]`) puts it, or its key union as written. */
  const keyPlace = (
    mappedType: MappedType,
    keyType: TS.Type | undefined,
    name: string
  ): number => {
    const { constraint } = mappedType.declaration.typeParameter;
    if (!constraint) {
      return -1;
    }
    const operand = keyofOperand(ts, constraint);
    const source = through(
      kinds,
      mappedType.mapper,
      checker.getTypeAtLocation(operand ?? constraint)
    );
    if (has(source.flags, ts.TypeFlags.TypeParameter)) {
      return -1;
    }
    if (operand) {
      const key = keyType?.isStringLiteral() ? keyType.value : name;
      return ordered(source).findIndex((one) => one.name === key);
    }
    const keys = source.isUnion() ? source.types : [source];
    const written = writtenFor(keys, whereWritten(source));
    return keyType && written ? indexIn(written, keyType) : -1;
  };
  /** Where a mapped property's source puts it; -1 when it has none. */
  const place = (property: TS.Symbol): number => {
    const { keyType, mappedType, syntheticOrigin } = linksOf(property);
    if (!mappedType) {
      return -1;
    }
    if (!syntheticOrigin) {
      return keyPlace(mappedType, keyType, property.name);
    }
    const { modifiersType } = mappedType;
    return modifiersType ? ordered(modifiersType).indexOf(syntheticOrigin) : -1;
  };
  /** A type's properties: each mapped type's group in its source's order, in the places the checker gave the group. */
  const ordered = (type: TS.Type): TS.Symbol[] => {
    const known = orders.get(type);
    if (known) {
      return known;
    }
    const properties = checker.getPropertiesOfType(type);
    // Held while its groups are ranked: a type mapped from itself reads the checker's order.
    orders.set(type, properties);
    const groups = Map.groupBy(
      properties.filter((property) => linksOf(property).mappedType),
      (property) => linksOf(property).mappedType
    );
    const queues = new Map(
      [...groups].map(([mappedType, members]) => [
        mappedType,
        byPlace(members, place, (property) => property.name),
      ])
    );
    const result = properties.map((property) => {
      const { mappedType } = linksOf(property);
      return (mappedType && queues.get(mappedType)?.shift()) ?? property;
    });
    orders.set(type, result);
    return result;
  };

  const readThrough = (generator: unknown): void => {
    const steps = generator as GeneratorSteps;
    if (
      typeof steps.getUnionDefinition !== "function" ||
      typeof steps.getDefinitionForProperty !== "function"
    ) {
      throw new Error(
        "typescript-json-schema no longer reads properties and unions in the steps written-order.ts steps into: read its new generator before upgrading"
      );
    }
    const property = steps.getDefinitionForProperty.bind(generator);
    steps.getDefinitionForProperty = (symbol, node) => {
      const declared = symbol.declarations?.[0];
      const type =
        declared && "type" in declared
          ? (declared.type as TS.Node | undefined)
          : undefined;
      if (type) {
        reading.push(type);
      }
      try {
        return property(symbol, node);
      } finally {
        if (type) {
          reading.pop();
        }
      }
    };
    const union = steps.getUnionDefinition.bind(generator);
    steps.getUnionDefinition = (type, modifier, definition) => {
      const written = writtenFor(type.types, whereWritten(type));
      if (!written) {
        return union(type, modifier, definition);
      }
      const types = byPlace(
        type.types,
        (member) => indexIn(written, member),
        () => ""
      );
      return union(
        Object.create(type, { types: { value: types } }) as TS.UnionType,
        modifier,
        definition
      );
    };
  };

  return {
    checker: { ...checker, getPropertiesOfType: ordered },
    readThrough,
  };
};
