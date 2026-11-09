// What house/resize-delivery-first must refuse (expected.txt): a client
// entry whose first module read is not the frame observer. The type-only
// import above it reads nothing and is passed over.
import type { SourceFile } from "golar/unstable-tsgo";
import { fetchHub } from "../../../packages/core/src/hub-request";

export const entry = (file: SourceFile) => [file, fetchHub];
