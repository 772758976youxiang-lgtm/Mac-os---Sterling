# Agent Note: Localize permission mode labels

Status: implemented

English | [中文](2026-08-18-localize-permission-labels.zh.md)

## Problem

The permission mode selector — the composer Access chip and the `/permission` popup, plus the new-session default row in General Settings — rendered its three shipped modes with hardcoded English labels ("Read Only", "Workspace Write", "Full access") regardless of the active locale, while every surrounding control was already localized.

## Decision

The three shipped modes (`read-only`, `workspace-write`, `danger-full-access`) are now resolved through the locale dictionaries in both surfaces: `ui-conversation`'s `PermissionSelect` and `ui-permission-presets`' popup and settings row. A value-keyed lookup (`只读` / `工作区写入` / `完全访问` in zh; the previous labels in en) replaces the title-case machine-name transform for shipped modes only; unknown host-configured names keep the kebab-to-title transform, since they carry no translation. The `ui-permission-presets` settings store stays locale-agnostic (its labels are data); localization happens at render. The Full access risk-confirmation copy now uses the localized name too.

## Alternatives considered

**Translate by machine name only in the presentation helper.** Rejected for the settings row: its labels come from the host descriptor and pass through a locale-less store, so render-time value-keyed lookup was the only place both surfaces could agree.

**Leave the confirmation copy with the English product name.** Rejected: the confirm dialog names the mode it enables, so it must use the same localized label as the selector.

## Consequences

Chinese sessions now see `只读`、`工作区写入`、`完全访问` in the permission selector and confirmation dialogs, with English unchanged. The value-keyed lookup means a future shipped mode needs one locale key pair per dictionary instead of a transform special case.
