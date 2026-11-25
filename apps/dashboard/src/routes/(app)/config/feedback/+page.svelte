<script lang="ts">
  import FeedbackSection from "#lib/cawco/config/feedback/FeedbackSection.svelte";
  import {
    chooseFeedback,
    feedbackStore,
  } from "#lib/cawco/stores/usability-feedback.svelte.js";
</script>

<FeedbackSection
  consent={feedbackStore.shown}
  fault={feedbackStore.fault}
  onchoose={chooseFeedback}
  phase={feedbackStore.phase}
  read={feedbackStore.read}
  signedIn={feedbackStore.signedIn}
  unread={feedbackStore.unread}
/>
