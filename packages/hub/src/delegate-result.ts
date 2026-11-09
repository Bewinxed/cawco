/**
 * A delegation's result (`POST /api/work-items`): started, its session and
 * the work item and workspace it runs in; or queued, waiting for files a
 * live item owns, with no session yet.
 */
export type DelegateResult =
  | {
      /** Its session. */
      instanceId: string;
      state: "started";
      text: string;
      title: string;
      workItemId: string;
      workspaceId: string;
      /** The workspace's scratch dir on its machine, the delegate's `TMPDIR`: where inputs for it are copied; absent when the machine named none. */
      workspaceTmp?: string;
    }
  | {
      /** The queued request's id. */
      queued: string;
      state: "queued";
      text: string;
      title: string;
    }
  | {
      /** A `delegate` naming its task, whose attempt waits for owned files (hub dispatch.ts): the task's start is queued. */
      projectId: string;
      state: "queued-task";
      task: string;
      text: string;
      title: string;
    };
