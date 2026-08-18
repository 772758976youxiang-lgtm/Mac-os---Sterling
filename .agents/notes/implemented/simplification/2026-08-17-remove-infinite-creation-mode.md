# Agent Note: Remove the infinite creation mode

Status: implemented

English | [中文](2026-08-17-remove-infinite-creation-mode.zh.md)

## Problem

Sterling is a conversation and workspace application. The sidebar mode switch introduces a separate local canvas that changes the application frame without serving the primary conversation workflow.

## Decision

The Web App bundle does not load `@deepseek-ai/dsh-client-ui-infinite-canvas`. The package, its Canvas store, the mode menu, the full-frame overlay, locale strings, tests, and type-project references are absent from the repository. The browser therefore has no mode button, no infinite-creation canvas, and no locally persisted canvas document.

The remaining model, permission, and Agent-preset selections retain their independent responsibilities. They do not select an application frame and remain available in their existing locations.

## Alternatives considered

**Hide only the sidebar button.** The canvas code and its stored mode state would remain reachable through the mounted plugin, leaving an unsupported application frame in the product.

**Keep a dormant canvas package.** A package excluded only from the bundle remains stale source, type, dependency, and catalog surface with no product owner.

**Remove every control named mode.** Model, permission, and Agent-preset controls express separate choices required by normal conversation work; their shared label does not make them one feature.

## Testing

The cold blank-session Web scenario asserts that the shipped English UI contains neither the `Mode` button nor an infinite-canvas overlay.

## Consequences

The sidebar leads directly from Sterling branding to new-session and workspace work. The local node canvas and its per-workspace documents are unavailable. Reintroducing a separate application frame requires a new product decision and a dedicated plugin.
