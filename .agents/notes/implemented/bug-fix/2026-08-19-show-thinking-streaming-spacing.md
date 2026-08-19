# Agent Note: Hidden thinking leaves a phantom gap above tool rows

Status: implemented

English | [中文](2026-08-19-show-thinking-streaming-spacing.zh.md)

## Problem

With the show-thinking preference off, the transcript occasionally shows uneven vertical spacing: a roughly doubled gap appears above a tool row, while the row below it (usually a context-injection row) sits at the normal 16px rhythm. The symptom was intermittent — it appeared while the agent was actively running a turn. The preference itself is recorded in [the show-thinking toggle feature note](../feature/2026-08-19-show-thinking-toggle.md).

## Root cause

Two independent defects let a filtered-out assistant step keep consuming the flow column's 16px gap:

1. `AssistantMarkdown`'s `hasVisible` treated `streaming` as an unconditional reason to paint the root shell, so a running step whose only blocks were filtered reasoning still rendered a zero-height `.root > .body` shell.
2. Even after the shell was dropped, the keyed slot outlet always wraps the renderer in a `display: contents` anchor (`SlotOutlet`), so a declined row is never an empty flex item and `ChatNodeSeat`'s `.flowItem:empty { display: none }` never fires. Every settled step whose blocks were only reasoning (and tool heads) therefore kept its flow row and its gap.

The tool row below the hidden step thus gained an extra 16px on top of the normal gap, reading as roughly 32px of space; spec `renderSlot` stubs returned the renderer directly, so the `.flowItem:empty` collapse worked in tests and the second defect went unnoticed.

## Decision

`AssistantMarkdown` now paints the shell only when a visible block actually remains after filtering (streaming alone is no longer a reason to paint), and `ChatNodeSeat` declines the assistant-step row entirely before rendering when the same visibility check fails, so a filtered step takes no flow row at all. The shared `assistantBlocksVisible` helper keeps both decisions in one place; the image-generation placeholder (streaming-only) and the interrupted marker keep their existing behavior. The same pass fixed a latent index mismatch in the image-grouping loop, which walked the original `blocks` array while iterating the filtered `visibleBlocks` and could duplicate an image when reasoning sat before a run of images with thinking hidden. Specs now reproduce the real outlet anchor wrapper so the empty-row handling is exercised, and a regression test asserts the collapsed step takes no flow row.

## Alternatives considered

**Keep streaming unconditional and collapse empty shells through CSS instead.** Not adopted: the empty shell is a real flex item, and a sibling-dependent CSS rule cannot know whether a slot outlet's contents rendered nothing.

## Consequences

A step whose blocks were all filtered (hidden reasoning, tool heads) no longer leaves a phantom gap above the following tool row, whether settled or still streaming, so the flow keeps a uniform 16px rhythm with thinking shown or hidden. Streaming text answers still render their shell and pulse; image-generation placeholders and interrupted markers are unaffected. Regression coverage asserts both the streaming collapse (`coverage-tails.client.spec.tsx`) and the absent flow row (`chat-view.client.spec.tsx`).
