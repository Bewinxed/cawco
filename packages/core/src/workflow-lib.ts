/**
 * Where a workflow's typecheck reads TypeScript's lib files from: the
 * product's own value, the one place it is written. Beside the compiler in
 * the dev tree; in the binary, the published copy of the compiler's lib
 * folder (scripts/build-binary.ts `workflow/lib`). A scratch fleet's hub runs
 * the probe kit's stand-in in this module's place
 * (scripts/stand-ins/workflow-lib.ts); no installed hub can.
 */
import { dirname, join } from "node:path";
import ts from "typescript";
import { runtimeTree, standalone } from "./runtime";

export const WORKFLOW_LIB_LOCATION = standalone
  ? join(runtimeTree("workflow"), "lib")
  : dirname(ts.getDefaultLibFilePath({}));
