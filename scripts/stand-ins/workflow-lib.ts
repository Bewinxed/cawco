/**
 * packages/core/src/workflow-lib.ts as a scratch fleet's services have it
 * (preload.ts puts it in that module's place): the lib folder the spec set on
 * the fleet's stand-ins (index.ts), else the product's own. It exports every
 * name that module does.
 */
import { dirname, join } from "node:path";
import ts from "typescript";
import { runtimeTree, standalone } from "../../packages/core/src/runtime";
import { standIns } from "./index";

const ownLibLocation = () =>
  standalone
    ? join(runtimeTree("workflow"), "lib")
    : dirname(ts.getDefaultLibFilePath({}));

export const WORKFLOW_LIB_LOCATION = standIns().workflowLib ?? ownLibLocation();
