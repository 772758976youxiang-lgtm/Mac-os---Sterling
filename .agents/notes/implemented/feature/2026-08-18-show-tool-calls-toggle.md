# Agent Note: Show tool calls transcript toggle

Status: implemented

English | [中文](2026-08-18-show-tool-calls-toggle.zh.md)

## Problem

The General Settings panel controlled transcript display of injected-context records but had no equivalent for tool calls. Sessions that run many tools (MCP integrations in particular) produced long transcripts dominated by tool-call rows, with no way to hide them without hiding the assistant replies that follow.

## Decision

A new persisted `showToolCalls` preference in the `ui-conversation` settings section (default `true`) drives a "显示工具调用 / Show tool calls" switch row in General Settings, directly below the context-injection row. `ChatNodeSeat` skips `tool-call` nodes when the preference is off, so the tool rows (and their result content) disappear while user messages and assistant replies stay; the preference is presentation-only, exactly like `showContextInjections`, and never changes what the model receives. Generated images are the exception: a tool result whose metadata carries images still renders as a bare gallery when the preference is off, because the produced image is the user-facing answer and must not be hidden by the transcript chrome switch. The setting lives in the same `ConversationDisplaySettings` store and Host settings scope as the context-injection preference, so it persists across reloads and applies live.

## Alternatives considered

**Filter tool rows by tool name prefix (hide only MCP tools).** Rejected: the user asked for a session-wide tool-call display switch, and a name-based filter would silently hide some tools while showing others; the presentation-only switch keeps the mental model uniform with the context-injection one.

**Hide the tool rows in the reducer/snapshot layer.** Rejected: display preferences belong to the view; the log and snapshot stay complete so the trajectory view and any future surface can still read the calls.

## Consequences

Turning the switch off yields a cleaner transcript at the cost of losing the in-chat record of which tools ran (the trajectory/detail views remain available for that). The assistant's reply remains visible, so the flow of the answer is preserved, and generated images stay visible as galleries because they are the answer itself. The preference is durable, defaults to visible, and follows the established context-injection pattern for storage, wiring, and tests.
