import { redirect } from "@sveltejs/kit";
import type { PageServerLoad } from "./$types";

// The session index is the front door; the root exists only to point at it.
// What a link asked for comes along (`?spawn=` opens New session): the query
// as sent, and the fragment, which never reaches a server, is kept by the
// browser across a redirect whose Location names none.
export const load: PageServerLoad = ({ url }) => {
  redirect(307, `/session${url.search}`);
};
