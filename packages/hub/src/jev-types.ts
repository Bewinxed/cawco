/**
 * TypeSafe's Jev (https://docs.typesafe.ai/api.md): the questions the hub
 * asks it and the answers it gives back (hub jev.ts).
 */

/** `instructions` and every criterion may be text or structured data. */
export type JevText =
  string | Readonly<Record<string, unknown>> | readonly unknown[];

/** One question to Jev. */
export type JevQuestion =
  | {
      readonly type: "noul";
      readonly instructions: JevText;
      /**
       * What a yes and a no mean, when the instructions leave it open. Both or
       * neither: the API refuses one without the other.
       */
      readonly criteria?: { readonly true: string; readonly false: string };
    }
  | {
      readonly type: "choice";
      readonly instructions: JevText;
      /** Option name → what it means; up to 255 options. */
      readonly criteria: Readonly<Record<string, JevText | null>>;
    }
  | {
      readonly type: "score";
      readonly instructions: JevText;
      /** 2–10 ordered levels, lowest first. */
      readonly criteria: readonly JevText[];
    };

interface JevNoulAnswer {
  /** The calibrated probability that the answer is yes. */
  noul: number;
  type: "noul";
}
export interface JevChoiceAnswer<Option extends string = string> {
  choice: Option;
  confidence: number;
  probabilities: Record<Option, number>;
  type: "choice";
}
interface JevScoreAnswer {
  confidence: number;
  /** Level index → the level as it was given. */
  legend: Record<string, JevText>;
  probabilities: Record<string, number>;
  score: number;
  type: "score";
}
export type JevAnswer = JevNoulAnswer | JevChoiceAnswer | JevScoreAnswer;
/** The answer a question of this shape comes back as. */
type JevAnswerOf<Question> = Question extends { type: "noul" }
  ? JevNoulAnswer
  : Question extends { type: "choice"; criteria: infer Criteria }
    ? JevChoiceAnswer<Extract<keyof Criteria, string>>
    : Question extends { type: "score" }
      ? JevScoreAnswer
      : never;

export interface JevResult<
  Questions extends Readonly<Record<string, JevQuestion>> = Readonly<
    Record<string, JevQuestion>
  >,
> {
  answers: { [Id in keyof Questions]: JevAnswerOf<Questions[Id]> };
  /** The model version that answered, e.g. `typesafe/jev-1.13-20260917`. */
  model: string;
  usage: { costUsd: number; inputTokens: number; outputTokens: number };
}
