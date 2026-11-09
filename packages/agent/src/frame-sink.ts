import type {
  DaemonPermissionRequestFrame,
  FramePayload,
} from "@cawco/core/frames";
import type { DeliveryMark } from "@cawco/core/protocol";
import type { FrameProvenance } from "@cawco/core/stream";

/**
 * The frames an agent has to send. The hub's own registry news is not one.
 *
 * A frame read off a sessiond ring additionally carries the line it came from
 * ({@link FrameProvenance}, design §7), which the daemon's socket writer
 * passes through untouched. It is the hub's only
 * way to tell a replayed line it already has from one it does not.
 */
export type FrameSink = (
  frame: (
    | Exclude<
        FramePayload,
        { kind: "instances" | "instances_delta" | "permission_request" }
      >
    | DaemonPermissionRequestFrame
  ) &
    Partial<FrameProvenance> & {
      processGeneration?: string;
      sent?: DeliveryMark;
    }
) => boolean;
