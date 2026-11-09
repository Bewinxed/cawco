import { HARNESSES } from "@cawco/core/harness/kinds";
import { t } from "elysia";

/**
 * A rule draft as the wire carries it — shared by create (POST, the hub mints
 * the id) and edit (PUT to an id that already exists). Validated loosely here
 * and strictly by `ruleProblem`, so the form and the hub refuse in the same
 * sentences.
 */
export const harnessSchema = t.UnionEnum(HARNESSES);
