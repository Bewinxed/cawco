import type { PermissionResult, PermissionUpdate } from "@cawco/core";

/** The answers a permission card offers — the keyboard has one key for each. */
export type PermissionAnswer = "allow" | "deny" | "always";

/**
 * What an answer means on the wire. `always` hands the SDK's own suggestions
 * back as `updatedPermissions`: they are what stops the next identical call
 * from asking again, and the SDK is the only one that knows how to phrase them.
 */
export function permissionAnswer(
  request: { input: Record<string, unknown>; suggestions?: PermissionUpdate[] },
  answer: PermissionAnswer
): PermissionResult {
  if (answer === "deny") {
    return { behavior: "deny", message: "User denied permission" };
  }
  return {
    behavior: "allow",
    updatedInput: request.input,
    ...(answer === "always" && { updatedPermissions: request.suggestions }),
  };
}
