# Agent Note: Web composer IME composition ownership

Status: implemented

English | [中文](2026-08-16-web-composer-ime-composition.zh.md)

## Problem

The Web composer wrote every intermediate IME edit synchronously into the session input machine. That global controlled value was correct for ordinary typing, but an unrelated React refresh during native composition could write it back into the textarea and terminate the operating system's marked-text session. Subsequent Pinyin keystrokes then appeared as literal Latin letters. The existing composition guard prevented Enter from submitting while a candidate was selected, but did not protect the composition buffer itself.

## Decision

The composer owns one component-local draft while composition is active. Its textarea, visible decoration backdrop, and hidden sizing mirror all render that local value, while command and reference decorations pause because their offsets belong to the last committed machine draft. Ordinary session, projection, tool, and menu updates may still rerender the component but cannot replace the marked text.

On `compositionend`, the composer commits the final textarea value once to the session input machine and reruns trigger tracking at the final caret. The broader Enter guard remains set for Safari's delayed closing keydown. Starting another composition cancels the earlier clear timer so a rapid next phrase cannot inherit a false non-composing state.

## Alternatives considered

**Keep only the keydown composition guard.** This prevents accidental submission but does not stop controlled-value writes from terminating marked text, which is the failure that leaves literal Pinyin in the draft.

**Make the textarea fully uncontrolled.** This would isolate native composition but break session draft switching, machine-owned undo, chip transactions, decoration offsets, and deterministic send clearing.

**Debounce every draft update.** Ordinary typing, command detection, persistence, and send readiness would all lag even though only native composition needs isolation.

## Consequences

Pinyin and other IMEs survive unrelated composer rerenders without changing the textarea DOM or existing shortcut behavior. The visible backdrop continues to show the live marked text. An unfinished composition fragment remains browser-local until the operating system commits it, so it is not persisted or available to command detection during that short interval.
