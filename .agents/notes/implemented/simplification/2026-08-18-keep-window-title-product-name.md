# Agent Note: Keep the OS window title on the product name

Status: implemented

English | [中文](2026-08-18-keep-window-title-product-name.zh.md)

## Problem

The shell projected the selected session's durable title into the browser title (`<session title> — Sterling Harness`). The native window shell already prefixes its own product name, so the OS window title read `Sterling Harness - <session title> — Sterling Harness` — the product name twice around a long transcript title.

## Decision

The projection is gone. `buildRenderApp` no longer arms a document-title effect; the OS window title stays the product name from the document head (`Sterling Harness`). `DocumentTitle` and its spec were deleted, and the app-shell spec now pins that a session selection never touches the window title. Session titles remain transcript and sidebar content — they are just no longer window chrome.

## Alternatives considered

**Format the projection as `<session title> — Sterling Harness` only (drop the shell prefix).** Rejected: the native shell's prefix is outside the web app's control, so the double-name composition cannot be fixed from here; the only robust outcome is no projection at all.

**Project the title only while the window is unfocused.** Rejected: the OS title is a window property, not an interaction cue; a focused/unfocused split adds behavior without fixing the redundancy.

## Consequences

The window title is always `Sterling Harness`, matching the sidebar wordmark, and the transcript title is no longer duplicated in the OS chrome. The deleted projection removed one document.title write and its cleanup effect.
