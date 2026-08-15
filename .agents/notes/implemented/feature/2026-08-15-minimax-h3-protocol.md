# Agent Note: MiniMax H3 protocol label

Status: implemented

English | [中文](2026-08-15-minimax-h3-protocol.zh.md)

## Problem

The Models settings page exposed generic OpenAI-compatible protocols but had no explicit choice for a MiniMax H3 deployment. Selecting `openai-completions` worked only by losing the deployment identity, while adding an unimplemented label would let users save a route that could not issue requests.

## Decision

`llm-pi-ai` exposes `minimax-h3` as a hand-declared chat protocol. It builds a provider with pi-ai's OpenAI Chat Completions stream implementation, so every request posts to `<baseURL>/chat/completions` with the configured Bearer API key. The `Config` schema remains the source for the Models settings protocol selector, so the new option reaches both creation and editing without a separately maintained UI list.

## Alternatives considered

**Use `openai-completions` only.** Rejected because it makes MiniMax H3 deployments indistinguishable from generic gateways in a saved profile and in the settings selector.

**Use MiniMax's Anthropic-compatible API.** Rejected because this protocol targets the OpenAI-compatible endpoint and its Bearer-authenticated request format. The existing `anthropic-messages` option remains available for deployments that use MiniMax's Anthropic-compatible endpoint.

## Consequences

Users can select `minimax-h3`, fetch the deployment's OpenAI-compatible `GET /models` directory, and send streaming chat and tool requests through its Chat Completions endpoint. The protocol does not invent a model identifier, endpoint, or reasoning format: each deployment supplies its exact model id and API prefix, and provider-specific fields beyond OpenAI Chat Completions remain unsupported until an observed H3 requirement needs them. Adapter coverage verifies the endpoint, model listing, response stream, and Bearer authentication; the UI schema test verifies the option is visible in settings.
