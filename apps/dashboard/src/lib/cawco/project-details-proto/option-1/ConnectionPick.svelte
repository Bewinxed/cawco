<script lang="ts">
  /**
   * Which connection serves a tie or a large-file address: every eligible
   * connection as a chip, the connections still being read, a failed read
   * with Try again, or, when none can serve, what kind is needed and where
   * to add one.
   */
  import {
    Alert,
    AlertAction,
    AlertDescription,
  } from "#lib/components/ui/alert/index.js";
  import { Button } from "#lib/components/ui/button/index.js";
  import {
    OptionGroup,
    OptionGroupItem,
  } from "#lib/components/ui/option-group/index.js";
  import { Skeleton } from "#lib/components/ui/skeleton/index.js";
  import { IconExternalLinear, IconWarningTriangle } from "#lib/icons.js";
  import type { ConnectionFact, GovernedRecord } from "./records";
  import { words } from "./words";

  let {
    label,
    connections,
    eligible,
    chosen,
    none,
    reachable,
    disabled,
    onpick,
    onreread,
  }: {
    /** What the chips choose, said above them. */
    label: string;
    connections: GovernedRecord["connections"];
    /** The connections that can serve here. */
    eligible: ConnectionFact[];
    /** The connection chosen, by name; empty for none. */
    chosen: string;
    /** What is needed when no connection can serve. */
    none: string;
    reachable: boolean;
    disabled: boolean;
    onpick: (name: string) => void;
    onreread: () => void;
  } = $props();
</script>

<div class="grid gap-space-1">
  <span class="type-meta text-ink-muted">{label}</span>
  {#if connections.state === "reading"}
    <Skeleton height="control-sm" radius="chip" width="title" />
  {:else if connections.state === "failed"}
    <Alert aria-live="assertive" layout="row" variant="destructive">
      <IconWarningTriangle aria-hidden="true" />
      <AlertDescription>
        {words.places.connectionsUnread(connections.reason)}
      </AlertDescription>
      <AlertAction>
        <Button
          disabled={!reachable}
          onclick={onreread}
          size="xs"
          variant="outline"
        >
          {words.hub.tryAgain}
        </Button>
      </AlertAction>
    </Alert>
  {:else if eligible.length === 0}
    <Alert>
      <IconWarningTriangle aria-hidden="true" />
      <AlertDescription>
        {none}
        <a
          class="mark-line ms-space-1 inline-flex items-center gap-space-1 font-medium underline underline-offset-3"
          href="#configure-connections"
        >
          <span>{words.places.configureConnections}</span>
          <IconExternalLinear aria-hidden="true" class="size-icon-sm" />
        </a>
      </AlertDescription>
    </Alert>
  {:else}
    <OptionGroup
      aria-label={label}
      {disabled}
      layout="chips"
      bind:value={
        () => (chosen ? [chosen] : []),
        ([next]) => {
          if (next) {
            onpick(next);
          }
        }
      }
    >
      {#each eligible as connection (connection.name)}
        <OptionGroupItem value={connection.name}>
          <span>{connection.name}</span>
          <span class="type-meta text-ink-muted">· {connection.account}</span>
        </OptionGroupItem>
      {/each}
    </OptionGroup>
  {/if}
</div>
