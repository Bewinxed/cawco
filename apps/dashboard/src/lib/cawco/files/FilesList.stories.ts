/**
 * A session's Files (FilesList) in the states the person meets its
 * artifacts, through its seam (files-list-live), each story's session's
 * reads answered by files-fixture.
 */
import { hubAs } from "../hub-stand-in";
import { SESSIONS } from "./files-fixture";
import FilesListLive from "./files-list-live.svelte";

export default {
  title: "Files/Files",
  component: FilesListLive,
  args: { session: SESSIONS.one },
  decorators: [hubAs("connected")],
  parameters: { viewport: 400 },
};

/** The session made one preview two hours ago, and nothing was attached. */
export const OnePreview = {};

/** The same one preview, as a list. */
export const OnePreviewList = { args: { view: "list" } };

/** Several things made, one waiting on my answers. */
export const Several = {
  args: { session: SESSIONS.mixed },
};

/** Several things made, as a list, one waiting on my answers. */
export const SeveralList = {
  args: { session: SESSIONS.mixed, view: "list" },
};

/** On my phone, the drawer's one list at a time. */
export const OnPhone = {
  args: { session: SESSIONS.mixed, segmented: true },
  parameters: { viewport: "phone" },
};
