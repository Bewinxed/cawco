import { unhandled } from "../unhandled";
import { configurePage } from "./configure";

/**
 * What `generate_image` (agent image-generation.ts) says when no ChatGPT
 * login on the machine can make an image: before any image request, each
 * login with what stops it and the fix; and a refusal only the request
 * itself could meet.
 */

/** How a ChatGPT login comes to be held by a CawCo account. */
const SIGN_IN = `Run \`opencode auth login\` and choose OpenAI → ChatGPT (CawCo moves that login into a ChatGPT account), or add a ChatGPT account in ${configurePage("accounts")}.`;

/** Where a ChatGPT plan is changed. */
const PLANS = "https://chatgpt.com/pricing";

/** Why one held ChatGPT login cannot make an image, said before any request. */
type ImageBlock =
  | { kind: "free" }
  | { kind: "renew"; error: string }
  | { kind: "gone" }
  | { kind: "rejected" };

/** One held login that cannot make an image: who it is, its plan, and why. */
export interface BlockedLogin {
  block: ImageBlock;
  /** The login's email, or null when its token names none. */
  email: string | null;
  plan: string | null;
}

const why = (block: ImageBlock): string => {
  switch (block.kind) {
    case "free":
      return `the Free plan can't generate images. Upgrade it at ${PLANS}, or sign in with a paid ChatGPT account.`;
    case "renew":
      return `its login couldn't be renewed (${block.error}). Sign in to it again.`;
    case "gone":
      return "its sign-in is gone from this machine. Sign in to it again.";
    case "rejected":
      return "ChatGPT rejected its login (401). Sign in to it again.";
    default:
      return unhandled("block", block);
  }
};

export const imageGenerationWords = {
  /** No CawCo account on the machine holds a ChatGPT sign-in. */
  noLogin: () =>
    `No CawCo account on this machine holds a ChatGPT login, so no image request was sent. ${SIGN_IN} API keys are not accepted.`,
  /** Every held login is blocked: each named with its plan, what stops it and its fix. */
  noUsableLogin: (blocked: BlockedLogin[]) =>
    [
      "No ChatGPT login on this machine can generate images, so no image request was sent:",
      ...blocked.map(
        (one) =>
          `- ${one.email ?? "a login with no email"} (${one.plan ? `${one.plan} plan` : "plan unknown"}): ${why(one.block)}`
      ),
      SIGN_IN,
    ].join("\n"),
  /** The image request itself met a 401: the login was revoked after the check. */
  requestRejected: (detail: string) =>
    `ChatGPT rejected this machine's login (401: ${detail}). Sign in again: ${SIGN_IN} No image was saved and no API-key request was made.`,
  /** Any other refusal of the image request, in the server's words. */
  requestRefused: (status: number, detail: string) =>
    `ChatGPT image generation refused the request (${status}): ${detail} No image was saved, no API-key request was made and no retry was submitted.`,
};
