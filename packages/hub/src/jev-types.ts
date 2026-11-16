/**
 * What one ask of TypeSafe's Jev comes back as (hub jev.ts `askJev`). The
 * questions, the state and each answer are the AI SDK's own
 * (`Experimental_DecisionQuestion`, `Experimental_DecisionState`,
 * `Experimental_DecisionResult`, from `ai`); this adds what the hub reads
 * beside them.
 */
import type {
  Experimental_DecisionQuestion,
  Experimental_DecisionResult,
} from "ai";

export interface JevResult<
  Questions extends Readonly<Record<string, Experimental_DecisionQuestion>> =
    Readonly<Record<string, Experimental_DecisionQuestion>>,
> {
  answers: Experimental_DecisionResult<Questions>["answers"];
  /**
   * TypeSafe's confidence in each choice and score answer, by question id:
   * the provider's metadata (`providerMetadata.typesafe.confidence`), which
   * the AI SDK's answer types do not carry. A question it gave none for is
   * absent.
   */
  confidence: Readonly<Record<string, number>>;
  /** The model version that answered, e.g. `typesafe/jev-1.13-20260917`. */
  model: string;
  usage: {
    /** What the ask cost, from the house pricing table; absent when the table has no price for the model. */
    costUsd?: number;
    inputTokens: number | undefined;
    outputTokens: number | undefined;
  };
}
