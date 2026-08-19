# Agent Note: Show thinking process transcript toggle

Status: implemented

English | [中文](2026-08-19-show-thinking-toggle.zh.md)

## Problem

General Settings could hide context-injection and tool-call rows from the transcript, but assistant reasoning blocks had no equivalent control. Sessions with a reasoning-capable model open with a "思考 / Think" disclosure per reasoning block, and users had no way to read only the answers without the thinking scaffolding.

## Decision

A new persisted `showThinking` preference in the `ui-conversation` settings section (default `true`) drives a "显示思考过程 / Show thinking process" switch row in General Settings, directly below the tool-call row. The preference is presentation-only, exactly like `showContextInjections` and `showToolCalls`, and never changes what the model receives. `ChatView` reads it from the shared `ConversationDisplaySettings` store, passes it through `ChatNodeSeat` as part of the chat-node owner currency, and `AssistantMarkdown` drops `reasoning` blocks before any visibility decision: an assistant node that is only hidden reasoning collapses entirely, while text answers stay visible. The setting lives in the same Host settings scope as the other visibility preferences, so it persists across reloads and applies live. A streaming turn whose partial is only reasoning shows nothing until text arrives; the turn-level running status remains visible.

## Alternatives considered

**Skip reasoning at the session-log/reducer layer.** Rejected: display preferences belong to the view; the log and snapshot stay complete so replay and any future surface can still read the reasoning.

**Reuse the tool-call row and hide thinking as a tool-call sub-kind.** Rejected: reasoning renders inside the assistant node (a block, not a `tool-call` chat node), so the tool-call node filter could not reach it; a separate presentation-only switch keeps the mental model uniform with the other two visibility rows.

## Consequences

Turning the switch off yields a cleaner transcript focused on answers, at the cost of hiding the model's visible reasoning trail in-chat (the session log still records the reasoning, and the turn-level running status still shows while a turn streams). The preference is durable, defaults to visible, and follows the established context-injection/tool-call pattern for storage, wiring, and tests.
