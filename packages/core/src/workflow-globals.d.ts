/**
 * The ambient surface a workflow program is written against: `Workflow` and
 * friends without an import, because zod is the only module a program may
 * import (proposal §13.1).
 */

import type { ZodType } from "zod";
import type {
  AskAnswer,
  AskSpec,
  StepHandle as Handle,
  JevAnswer,
  JevQuestion,
  JevResult,
  JevSpec,
  Workflow as Runtime,
  WorkflowState as State,
  StepSpec,
} from "./workflow-program";

declare global {
  type WorkflowJevQuestion = JevQuestion;
  type WorkflowJevSpec<
    Questions extends Readonly<Record<string, JevQuestion>> = Readonly<
      Record<string, JevQuestion>
    >,
  > = JevSpec<Questions>;
  type WorkflowJevResult<
    Questions extends Readonly<Record<string, JevQuestion>> = Readonly<
      Record<string, JevQuestion>
    >,
  > = JevResult<Questions>;
  type WorkflowJevAnswer = JevAnswer;
  type Workflow<Inputs extends ZodType = ZodType> = Runtime<Inputs>;
  type StepHandle<Output extends ZodType = ZodType> = Handle<Output>;
  type WorkflowState<Schema extends ZodType> = State<Schema>;
  type WorkflowStepSpec<Output extends ZodType = ZodType> = StepSpec<Output>;
  type WorkflowAskSpec = AskSpec;
  type WorkflowAskAnswer = AskAnswer;
}
