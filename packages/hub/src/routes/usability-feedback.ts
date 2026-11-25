/**
 * Usability feedback's consent (usability-feedback.ts): whether agents may
 * file trouble with CawCo's own tools as issues on CawCo's repository. Read
 * by the first run and Configure › Feedback to CawCo, each of which writes
 * it. While no machine is known to
 * sign in to GitHub, which the tool needs, the read asks the connected ones
 * again, so a `gh auth login` since they connected is found.
 */
import type { FeedbackState } from "@cawco/core/usability-feedback";
import { Elysia, t } from "elysia";
import type { HubContext } from "../hub-context";

export const usabilityFeedbackRoutes = ({
  usabilityFeedback,
}: Pick<HubContext, "usabilityFeedback">) =>
  new Elysia()
    .get("/api/usability-feedback", async (): Promise<FeedbackState> => {
      if (!usabilityFeedback.state().signedIn) {
        await usabilityFeedback.readAll();
      }
      return usabilityFeedback.state();
    })
    .put(
      "/api/usability-feedback",
      { body: t.Object({ consent: t.Boolean() }) },
      ({ body }): FeedbackState => {
        usabilityFeedback.setConsent(body.consent);
        return usabilityFeedback.state();
      }
    );
