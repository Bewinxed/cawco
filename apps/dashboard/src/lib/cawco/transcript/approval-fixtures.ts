/**
 * The asks the approval card's states file draws (ApprovalCard.stories.ts),
 * each a call a Claude Code session in cockpit really makes, presented as the
 * hub presents it (core presentPermission) against the fleet as it stands:
 * an MCP server it changes, a file it writes, a command it runs, and a
 * command that throws work away.
 */
import { presentPermission } from "@cawco/core/permission-presentation";
import type { PendingPermission } from "../client.svelte";

export type ApprovalAsk = "mcp" | "write" | "shell" | "destructive";

/** The asking session, by its board title, and the words before its ask (the hub's `said`, ask-intent.ts). */
export interface ApprovalScene {
  /** The agent's last words before it asked. */
  said: string;
  /** The session's title on the board. */
  session: string;
}

const PROJECT = "cockpit";
const CHECKOUT = "/home/bewinxed/cockpit";

/** mobbin-web as the fleet keeps it now (hub `admin_mcp_servers_read`). */
const MOBBIN_NOW = {
  config: {
    command: "npx",
    args: ["-y", "mobbin-mcp"],
    env: { MOBBIN_TOKEN: "mbn_live_4f2c9a1e7b" },
  },
  enabled: true,
  projectId: null,
};

const TRAY_CHIP = `<script lang="ts">
  /**
   * A tray chip's label: its words clip with an ellipsis at the chip's
   * width, never under its count, which keeps its own room.
   */
  let { label, count }: { label: string; count?: number } = $props();
</script>

<span
  data-slot="tray-chip-label"
  class="flex min-w-0 items-center gap-space-1"
>
  <span class="min-w-0 overflow-clip text-ellipsis whitespace-nowrap"
    >{label}</span
  >
  {#if count !== undefined}
    <span class="flex-none tabular-nums text-ink-muted">{count}</span>
  {/if}
</span>
`;

const ASKS: Record<
  ApprovalAsk,
  { input: Record<string, unknown>; scene: ApprovalScene; toolName: string }
> = {
  mcp: {
    toolName: "mcp__cawco__admin_mcp_servers_write",
    input: {
      action: "put",
      name: "mobbin-web",
      config: {
        command: "bunx",
        args: ["mobbin-mcp@2.1", "--read-only"],
        env: { MOBBIN_TOKEN: "mbn_live_9d03b7c2e5" },
      },
      reason:
        "Pin mobbin-web to 2.1 and make it read-only, so the design delegates can search screens without saving to your collections.",
    },
    scene: {
      session: "Give the design delegates Mobbin search",
      said: "The design delegates can't reach Mobbin's screen search on 1.x. I'll move mobbin-web to 2.1 in its read-only mode, with the new token.",
    },
  },
  write: {
    toolName: "Write",
    input: {
      file_path: `${CHECKOUT}/apps/dashboard/src/lib/cawco/transcript/TrayChipLabel.svelte`,
      content: TRAY_CHIP,
    },
    scene: {
      session: "Fix the tray chip overflow on phones",
      said: "The label and its count share one flex row with no minimum width, so on a 390px screen the count gets pushed past the chip's edge. I'll move the label into its own component that clips before the count does.",
    },
  },
  shell: {
    toolName: "Bash",
    input: {
      command:
        "bun run --cwd apps/dashboard check && bun run --cwd apps/dashboard build",
      description:
        "Type-check and build the dashboard to confirm the tray chip fix compiles",
    },
    scene: {
      session: "Fix the tray chip overflow on phones",
      said: "TrayChipLabel is in place and the tray uses it. Checking that the dashboard still compiles.",
    },
  },
  destructive: {
    toolName: "Bash",
    input: {
      command: "git reset --hard origin/main && git clean -fd",
      description:
        "Drop the half-applied patch and start the tray fix again from main",
    },
    scene: {
      session: "Fix the tray chip overflow on phones",
      said: "The patch applied to two of the three files and left the tray half-changed. I'd rather start clean from main than unpick it.",
    },
  },
};

/** The ask as the client holds it parked (its PendingPermission), and its scene. */
export function approvalAsk(ask: ApprovalAsk): {
  request: PendingPermission;
  scene: ApprovalScene;
} {
  const { input, scene, toolName } = ASKS[ask];
  return {
    scene,
    request: {
      heard: 0,
      input,
      instanceId: `approval-${ask}`,
      presentation: presentPermission(toolName, input, {
        asker: scene.session,
        project: PROJECT,
        said: scene.said,
        current: (group, key) =>
          group === "mcp_servers" && key === "mobbin-web"
            ? MOBBIN_NOW
            : undefined,
        memory: () => undefined,
        projectName: (id) => (id === "cockpit" ? PROJECT : undefined),
      }),
      requestId: `approval-${ask}`,
      toolName,
    },
  };
}
