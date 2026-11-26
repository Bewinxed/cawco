import { andList } from "@cawco/providers/names";

/**
 * What a picture is refused with where it enters (the composer's attach, the
 * hub's send, continuation and move routes, the Claude harness's send): one
 * of a type no provider takes (core `IMAGE_MEDIA_TYPES`), or one the
 * session's harness does not take (its traits' `pictureTypes`).
 */
export const pictureWords = {
  /** A picture of `type` (its media type; empty when it named none) sent to a `harness` session, which takes `takes`. */
  typeRefused: (type: string, harness: string, takes: readonly string[]) =>
    `${type ? `A ${type} picture` : "This picture"} can't be sent to ${harness}: it takes ${andList(takes)} pictures.`,
  /** A picture of `type` no session's provider takes. */
  noProviderTakes: (type: string) =>
    `${type ? `A ${type} picture` : "This picture"} can't be sent: pictures go as JPEG, PNG, GIF, WebP, HEIC or HEIF.`,
};
