# Agent Note: Plugins 设置中的 MCP 能力管理

Status: implemented

[English](2026-08-16-mcp-capability-management.md) | 中文

## Problem

MCP 客户端可以发现并注册有用的工具，但运维者无法在 Web 的“插件”设置中查看已配置的服务，也无法确认当前可用的能力。

## Decision

`@deepseek-ai/dsh-host-plugin-inventory` 在 Loader 清单之外暴露 `pluginInventory/mcp`。它投影每个已配置的 `@deepseek-ai/dsh-mcp-client` 条目，包括命名空间、安全的传输类型、Loader 生命周期状态，以及来自 `ctx.tools` 的当前 `mcp__<serverName>__*` 工具 schema。接口 URL、命令、请求头、环境变量与重连内部信息均不会通过 Remote。

`@deepseek-ai/dsh-client-ui-settings-plugin-inventory` 会在插件列表前贡献一个 MCP 管理标签页。该标签页按需读取快照，支持刷新和能力搜索，展开服务行后显示每个公开工具名称及其声明描述。

## Alternatives considered

**从通用插件列表渲染 MCP 行。** 该列表只报告 Loader 标识与生命周期，无法显示已发现的能力，也无法区分已配置但当前未注册工具的服务。

**暴露完整 MCP 客户端配置。** 连接配置可能包含令牌、文件系统路径、命令参数与内部接口信息。管理视图需要的是运行可用性，而非这些敏感详情。

**第一版加入服务修改控件。** 新建、修改、重启或删除服务需要配置校验、密钥处理与重载语义。在拥有相应的 Host API 之前，已交付的视图保持只读。

## Consequences

- 运维者无需向 agent 提问即可直接在设置中确认 MCP 发现结果。
- 能力列表跟随全局工具注册表，因此成功的 MCP 重新同步会在刷新后出现，不可用工具会消失。
- 页面只展示工具能力元数据。MCP 服务生命周期仍由 Cordis 组合负责管理。
