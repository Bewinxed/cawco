import { redirect } from "@sveltejs/kit";

// The session index is the front door; the root exists only to point at it.
export function load() {
  redirect(307, "/session");
}
