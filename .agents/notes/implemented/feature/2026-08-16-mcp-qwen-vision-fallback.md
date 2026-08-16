# Agent Note: MCP Qwen vision fallback

Status: implemented

English | [中文](2026-08-16-mcp-qwen-vision-fallback.zh.md)

## Problem

Text-only models can receive an image attachment in a user request but cannot inspect its pixels. The existing MCP management page listed discovered tools and the local image-generation bridge, but it offered no multimodal fallback or safe place to configure the fallback provider credential.

## Decision

The local MCP image bridge registers `mcp__vision__analyze_image` alongside `mcp__image__generate_image`. The vision tool selects the latest user message's durable image attachment, reads its verified bytes in the Host, and sends a text prompt plus `image_url` data to an OpenAI-compatible Qwen endpoint. The default model is `qwen3.7-flash` and the default endpoint is DashScope's compatible-mode base URL. Tool results remain textual so a text-only caller can continue its turn without receiving an image block.

The bridge registers the `mcp-image-generation` settings namespace with a write-only API-key role and a credential reference. The MCP management tab exposes the key and reference controls, writes the literal only through `credentials.set`, and shows the model and endpoint as status metadata. The Host never returns the key, and the browser never receives the secret in a settings snapshot.

## Alternatives considered

**Route vision through the active `ctx.llm` provider.** This would make the fallback depend on a model catalog that may itself be text-only and would couple a tool-level capability to unrelated route selection. A dedicated OpenAI-compatible request keeps Qwen credentials and endpoint behavior explicit.

**Require the text model to pass an attachment id in tool arguments.** Text-only models cannot reliably invent or recover opaque attachment metadata. Selecting the latest user image from the agent session makes the normal user flow automatic while retaining explicit image references for programmatic callers.

**Store the API key in the MCP settings document.** Settings descriptors are redacted, but a literal secret in the document still broadens persistence and sync exposure. A credential reference plus the write-only credentials API preserves the existing secret boundary.

**Return the analyzed image or a multimodal tool result.** The tool's purpose is to give a text-only model visual facts; returning the source bytes would add no capability and could make later text requests fail. The result is therefore a bounded textual answer.

## Consequences

Text-only models can inspect current user images through one ordinary MCP tool, with no model-router changes. Qwen requests are cancellable and use durable attachment bytes, while API keys remain Host-owned. The MCP management page now contains a small credential form in addition to the read-only capability catalog; deployments without the settings or connection services keep the catalog usable and hide the optional form.
