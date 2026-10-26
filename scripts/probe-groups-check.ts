/**
 * Part of `bun run check`: every probe-kit spec names the group it stands
 * in (kit.ts `Spec.group`), and none stands in a group the owner cut
 * (scripts/probe-kit/groups.ts `CUT_GROUPS`, with when and where he cut
 * each). A spec named `ios-…` is the app's, a group he cut, whatever it
 * names. After 2026-10-16 the groups he cut whole filled up again, spec by
 * spec, because nothing refused one: this does.
 *
 *   bun scripts/probe-groups-check.ts
 */
import { readdirSync, readFileSync, statSync } from "node:fs";
import { join, relative } from "node:path";
import ts from "typescript";
import { CUT_GROUPS, KEPT_GROUPS } from "./probe-kit/groups";

const ROOT = join(import.meta.dir, "..");
const SPECS = join(ROOT, "scripts/probe-kit/specs");
const TS_FILE = /\.ts$/;
const APP = CUT_GROUPS.find((one) => one.group === "The iPhone and iPad app");

const specsUnder = (dir: string): string[] =>
  readdirSync(dir).flatMap((name) => {
    const path = join(dir, name);
    if (statSync(path).isDirectory()) {
      return specsUnder(path);
    }
    return path.endsWith(".ts") ? [path] : [];
  });

const unwrap = (node: ts.Expression): ts.Expression =>
  ts.isSatisfiesExpression(node) ||
  ts.isAsExpression(node) ||
  ts.isParenthesizedExpression(node)
    ? unwrap(node.expression)
    : node;

/** Each `const NAME = <value>` at the module's top. */
const constsOf = (source: ts.SourceFile): Map<string, ts.Expression> => {
  const consts = new Map<string, ts.Expression>();
  for (const statement of source.statements) {
    if (!ts.isVariableStatement(statement)) {
      continue;
    }
    for (const one of statement.declarationList.declarations) {
      if (ts.isIdentifier(one.name) && one.initializer) {
        consts.set(one.name.text, one.initializer);
      }
    }
  }
  return consts;
};

/** The object a spec module exports by default, followed through one `const spec = {…}`. */
const specObject = (
  source: ts.SourceFile
): ts.ObjectLiteralExpression | undefined => {
  const consts = constsOf(source);
  const exported = source.statements.find(ts.isExportAssignment);
  if (!exported) {
    return;
  }
  let value: ts.Expression | undefined = unwrap(exported.expression);
  if (ts.isIdentifier(value)) {
    const held = consts.get(value.text);
    value = held && unwrap(held);
  }
  return value && ts.isObjectLiteralExpression(value) ? value : undefined;
};

/** The group a spec's object names, when it names one by a string. */
const groupOf = (spec: ts.ObjectLiteralExpression): string | undefined => {
  for (const property of spec.properties) {
    if (
      ts.isPropertyAssignment(property) &&
      property.name.getText() === "group" &&
      ts.isStringLiteralLike(property.initializer)
    ) {
      return property.initializer.text;
    }
  }
};

/** Why `file` may not stand in the kit, or nothing. */
export const refusalOf = (file: string, text: string): string | undefined => {
  const name = relative(SPECS, file).replace(TS_FILE, "");
  const source = ts.createSourceFile(file, text, ts.ScriptTarget.Latest, true);
  const spec = specObject(source);
  if (!spec) {
    return;
  }
  const group = groupOf(spec);
  const cut =
    CUT_GROUPS.find((one) => one.group === group) ??
    (name.split("/").at(-1)?.startsWith("ios-") ? APP : undefined);
  if (cut) {
    return `stands in "${cut.group}", a group the owner cut on ${cut.cut} (${cut.by}). A spec there goes to him first, not into the kit.`;
  }
  if (!group) {
    return `names no group. Name the one it stands in: ${KEPT_GROUPS.join(", ")}.`;
  }
  if (!(KEPT_GROUPS as readonly string[]).includes(group)) {
    return `names "${group}", which is no group of the kit's: ${KEPT_GROUPS.join(", ")}.`;
  }
};

if (import.meta.main) {
  const files = specsUnder(SPECS);
  const refused = files.flatMap((file) => {
    const why = refusalOf(file, readFileSync(file, "utf8"));
    return why ? [`${relative(ROOT, file)}: ${why}`] : [];
  });
  if (refused.length > 0) {
    console.error(`probe-groups-check:\n${refused.join("\n")}`);
    process.exit(1);
  }
  console.log(
    `probe-groups-check: ${files.length} specs, each in a group the owner kept`
  );
}
