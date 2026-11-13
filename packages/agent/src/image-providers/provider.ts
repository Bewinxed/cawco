import type {
  ImageProviderId,
  ImageQuality,
} from "@cawco/core/image-generation";
import type { AgentPorts } from "../agent-ports";

/** One reference image, admitted through the workspace's gate and read. */
export interface ReferenceImage {
  bytes: Buffer;
  /** Its sniffed type: image/png, image/jpeg, image/webp or image/gif. */
  mime: string;
}

/** What a provider is asked to make, every argument already checked by the orchestration. */
export interface ImageJob {
  /** One of the provider's models (core `IMAGE_PROVIDER_MODELS`). */
  model: string;
  prompt: string;
  quality: ImageQuality;
  /** At most the provider's {@link ImageProvider.references}. */
  references: ReferenceImage[];
  /** `auto`, or `WIDTHxHEIGHT` within the size rules. */
  size: string;
}

/** A provider's image: its bytes as it made them, and what it says of the run. */
export interface MadeImage {
  bytes: Buffer;
  /** Facts of the run the caller should know, in words (core words/image-generation.ts). */
  notes: string[];
}

/**
 * A provider's pre-flight answer. Ready: the run goes on, with `generate`
 * bound to the sign-in the check found; `notes` are said in the result. Not
 * ready: `reason` says, in words, what stops it and the fix; nothing was
 * uploaded or requested.
 */
type Readiness =
  | {
      generate: (job: ImageJob, signal: AbortSignal) => Promise<MadeImage>;
      notes: string[];
      ready: true;
    }
  | { ready: false; reason: string };

/**
 * One way a machine makes an image, on the owner's own sign-in there. The
 * orchestration (image-generation.ts) checks the call against what it
 * `accepts`, asks its {@link readiness} before any reference is read or any
 * request goes out, and keeps what it makes; the provider holds everything
 * that is its own (its sign-in, its request, its refusals in words).
 */
export interface ImageProvider {
  id: ImageProviderId;
  /** Spends nothing: whether this machine can make an image here now, and if not, why. */
  readiness: (ports: Pick<AgentPorts, "borrowAsk">) => Promise<Readiness>;
  /** The most reference images it takes; 0 takes none. */
  references: number;
}
