/**
 * The design graph's room faces (Component Story Format 3, live
 * components): RoomFaces in the room's head (room-faces-frame), the fluid
 * track's compact switch of a glyph and a name per face, at the room beside
 * a 1440 stage and in the phone's drawer. The meta's args are every story's;
 * a story's own args are what it changes.
 */
import RoomFacesFrame from "./room-faces-frame.svelte";

export default {
  title: "Design graph/Room faces",
  component: RoomFacesFrame,
  args: { width: 400, chosen: "states" },
};

/** The room beside the stage, States shown: its switch's chosen face lifted in the groove. */
export const Faces = { parameters: { viewport: 1440 } };

/** With the Controls face, Map shown. */
export const WithDials = {
  args: { chosen: "map", dials: true },
  parameters: { viewport: 1440 },
};

/** The room in the phone's drawer at its head, States shown: the grabber over the faces and Close. */
export const Phone = {
  args: { width: 390, drawer: true },
  parameters: { viewport: 390 },
};

/** The drawer with the Controls face, Controls shown. */
export const DrawerDials = {
  args: { width: 390, drawer: true, dials: true, chosen: "dials" },
  parameters: { viewport: 390 },
};
