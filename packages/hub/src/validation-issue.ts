/** The first issue an Elysia validation error reports, in the fields its error handlers read. */
import type { ValidationError } from "elysia";

export const firstValidationIssue = (error: ValidationError) =>
  (
    error.all as {
      message: string;
      params?: { requiredProperties?: string[] };
      path: string;
    }[]
  )[0];
