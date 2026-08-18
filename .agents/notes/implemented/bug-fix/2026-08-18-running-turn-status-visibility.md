# Agent Note: Running-turn status visibility and ellipsis copy

Status: implemented

English | [中文](2026-08-18-running-turn-status-visibility.zh.md)

## Problem

The turn-level waiting indicator — the rotating "埋头苦干中 / 脑袋冒烟中 / 小宇宙爆发 / 挖呀挖呀挖" carousel next to the elapsed clock — rendered only while the session `running` bit was true. That bit rides the live `host/session-status` frame, which the host emits only on an agent status *transition*; a missed or raced frame (a mid-turn reload, a dropped or reordered frame while a task is already underway) left the bit false for the whole task, so the waiting content silently never appeared. The four phrases also carried no ellipsis.

## Decision

The status now renders when the conversation window holds an open turn **or** the running bit is set: `running || <an open turn in the event-log timeline>`. The open-turn boundary (a `turn/start` whose `turn/end` has not arrived) is derived from the durable session log by `ConversationLocationIndex`, so it cannot be lost the way a live status frame can, and it doubles as the elapsed-clock anchor. All four carousel phrases gained a trailing ellipsis (`…`). Fixtures whose terminal states (turn error, max-tokens notice) previously left their turn open in the test timeline now close it with a `turnEnds` entry, mirroring the real `turn/end` that ends those turns, so the error and truncation notices still render without the waiting status.

## Alternatives considered

**Emit a corrective `host/session-status running:true` from the host on every `turn/start`.** Rejected: the agent-status relay is already the authoritative running signal, and a second emitter would create two sources of truth that can disagree; deriving the UI condition from the log keeps one authoritative signal on the client.

**Keep the running bit as the sole gate and rely on the session-list baseline for mid-turn reloads.** Rejected: the baseline covers reloads but not a frame dropped or reordered while the task is already running, which is the reported failure.

## Consequences

The waiting status stays visible whenever a turn is genuinely open, closing the "sometimes missing during a task" failure; the trade-off is that a turn whose `turn/end` was never logged (for example a killed process) keeps the status visible until a boundary arrives, which is more honest than hiding it. Normal completion still hides the status at `turn/end`. The ellipsis makes the copy read as an ongoing action rather than a finished state.
