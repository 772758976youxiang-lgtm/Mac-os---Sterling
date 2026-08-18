# Agent Note: Image generation card in plugin configuration

Status: implemented

English | [中文](2026-08-18-image-generation-config-card.zh.md)

## Problem

The image-generation route (`mcp__image__generate_image`) was configured only through the settings file or the Models page, while its sibling visual-recognition route gained a dedicated collapsible card in Settings > Plugins > Plugin configuration. There was no GUI surface for choosing the image model, pinning a provider route, or adjusting the request timeout.

## Decision

A new "图像生成 / Image generation" card registers into `settings.plugin.item` (order 35, directly above the vision card) in `ui-settings-plugins`. It is the image-generation counterpart of the vision card: a full hand-declared provider form (Provider ID, display name, endpoint, protocol, model ID, write-only API key through the credential store), with the same staged draft/save/discard flow. The protocol selector mirrors the vision card's four protocols — `openai-completions`, `openai-responses`, `anthropic-messages`, `openai-image-generations` — and the host dispatches each: the Image API path (`/images/generations` + `/images/edits`, headers, b64/URL parsing) is **delegated to llm-pi-ai's `generateOpenAIImages`** so the wire protocol stays owned by the protocol layer and is never duplicated in the bridge, while the other three call their native endpoints (`/chat/completions`, `/responses`, `/messages`) and tolerantly read images from `data[]`, `choices[].message` content blocks, `output[]` items, or a top-level `content` list (those three reject reference-image edits). The model-chosen controls (`size`, `quality`, and `n` where the protocol has it) are forwarded on every protocol as top-level request fields, so a chat-capable image gateway receives the same knobs the Image API path sends. The provider id is a dispatch label, not a route key, so any non-empty id is accepted. The host `mcp__image__generate_image` tool reads the live settings on every call (`current()`): when an endpoint is configured it calls the custom provider directly, and otherwise falls back to the configured llm image route. Previously the tool was locked to its mount-time config, which is why the default `gpt-image-2` appeared hard-coded; the custom dispatch initially missed the `content-type` header, which made gateways answer 502.

## Alternatives considered

**Extend the vision card to edit both route families.** Rejected: the two routes are separate features with separate fields and defaults; one card would conflate image generation with image understanding.

**A route-based selector limited to models the configured llm routes advertise.** Rejected: the user wants the same full custom-provider surface the vision card has, so the image card mirrors it and the tool dispatches to the custom endpoint directly.

## Consequences

Users can configure a custom image-generation provider entirely from the GUI, next to the vision card, with the same save/discard semantics and credential handling, and the MCP tool follows the change immediately without a restart. The route-based path remains as the fallback for deployments that keep configuring the image route through the Models page.
