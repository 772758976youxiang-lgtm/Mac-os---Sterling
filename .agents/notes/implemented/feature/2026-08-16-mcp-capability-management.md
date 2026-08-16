# Agent Note: MCP capability management in Plugins settings

Status: implemented

English | [中文](2026-08-16-mcp-capability-management.zh.md)

## Problem

An MCP client can discover and register useful tools, but an operator cannot inspect the configured servers or confirm which capabilities are currently available from the Web Plugins settings.

## Decision

`@deepseek-ai/dsh-host-plugin-inventory` exposes `pluginInventory/mcp` beside its Loader inventory. It projects each configured `@deepseek-ai/dsh-mcp-client` entry with its namespace, safe transport kind, Loader lifecycle state, and the current `mcp__<serverName>__*` tool schemas from `ctx.tools`. Endpoint URLs, commands, headers, environment values, and reconnect internals do not cross the Remote.

`@deepseek-ai/dsh-client-ui-settings-plugin-inventory` contributes an MCP management tab before the plugin list. The tab lazily loads the snapshot, supports refresh and capability search, and expands a server row to show each public tool name and its advertised description.

## Alternatives considered

**Render MCP rows from the generic plugin list.** That list only reports Loader identity and lifecycle, so it cannot show discovered capabilities or distinguish a configured server with no currently registered tools.

**Expose the complete MCP client configuration.** Connection configuration can contain tokens, filesystem paths, command arguments, and internal endpoint information. The management view needs operational availability, not those sensitive details.

**Add server mutation controls in the first version.** Creating, changing, restarting, or deleting a server needs configuration validation, secret handling, and reload semantics. The shipped view remains read-only until that workflow has an owned Host API.

## Consequences

- Operators can verify MCP discovery directly from Settings without prompting the agent.
- The capability list follows the global tool registry, so successful MCP re-syncs appear after a refresh and unavailable tools disappear.
- The page shows only tool capability metadata. MCP server lifecycle remains managed by the Cordis composition.
