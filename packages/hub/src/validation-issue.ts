/** The first issue an Elysia validation error reports, in the fields its error handlers read. */
import type { ValidationError } from "elysia";
import { z } from "zod";

/** One issue as Elysia's `ValidationError.all` builds it (typed `any[]` there): its path in dots, its words, and TypeBox's params. */
const ValidationIssues = z.array(
  z.object({
    message: z.string(),
    params: z
      .object({ requiredProperties: z.array(z.string()).optional() })
      .optional(),
    path: z.string(),
  })
);

export const firstValidationIssue = (error: ValidationError) =>
  ValidationIssues.parse(error.all)[0];
