import { t } from "elysia";

/**
 * What a put of a Claude Code settings row, an OpenCode plugin or a pi
 * extension takes (core harness-config.ts): each field optional, `null`
 * clearing it. The row's own check is `harnessConfigProblem`.
 */
export interface HarnessConfigBody {
  areaId?: string | null;
  enabled?: boolean;
  module?: string | null;
  package?: string | null;
  projectId?: string | null;
  settings?: Record<string, unknown> | null;
}

export const HARNESS_CONFIG_BODY = t.Object({
  enabled: t.Optional(t.Boolean()),
  settings: t.Optional(t.Nullable(t.Record(t.String(), t.Unknown()))),
  module: t.Optional(t.Nullable(t.String())),
  package: t.Optional(t.Nullable(t.String())),
  projectId: t.Optional(t.Nullable(t.String())),
  areaId: t.Optional(t.Nullable(t.String())),
});
