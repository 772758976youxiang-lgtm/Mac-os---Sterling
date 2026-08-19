# Agent Note: Produced-files row as a full vertical list

Status: implemented

English | [中文](2026-08-19-produced-files-vertical-list.zh.md)

## Problem

The produced-files row a finished turn ends with rendered its paths as one measured horizontal lane: at most six chips, the rest folded behind an exact `+ N files` remainder, with a **Show in folder** action appearing when anything was hidden. A turn that produced many files showed only a prefix at a glance; the remainder was a count, not the paths. The measurement machinery that served the one-line lane — chip probes, a remainder probe, and a ResizeObserver over the row — existed only to keep that single line from wrapping.

## Decision

**The row is now a full vertical list: every produced path gets its own row, none folded.** The label stays on the left; the chips stack in a column under it, each still opening through the owner-supplied `openFile` with the full path as `title` and the localized open label. The folding was the whole point of the measurement, so the entire measured-lane machinery is deleted: `fitProducedFiles`, `SHOWN_LIMIT`, the probe elements, the `ResizeObserver`, and the `+ N files` remainder (its two localized keys go with it).

**The folder action and its capability surface are deleted with the overflow it served.** `Show in folder` existed only to reach files the lane had hidden; with nothing hidden there is no overflow scenario, so the button, the `isLoopback`/`hostDescription` inject face, and the plugin's `connection` service edge all leave together. The row now receives only owner props and the locale seat.

**The e2e and component coverage move from measurement to completeness.** The web e2e seeds ten writes and now asserts all ten chips render with no remainder text and that chips stack at distinct vertical positions; the component spec asserts every path renders as an openable chip and an empty row renders none.

## Alternatives considered

**Keep the measured lane and only raise the cap.** Rejected: any cap still folds; the requirement is that every produced file is visible.

**Group and collapse by directory.** Rejected: unnecessary complexity for the common case; the list is short and the paths are already deduplicated in first-seen order.

## Consequences

A turn that produced many files grows the row vertically instead of hiding most of them, at the cost of vertical space. The plugin is smaller: one less service edge, one less inject face, and no measurement code, and `Show in folder`/`+ N files` copy is gone from both dictionaries. The closing-prose file mentions (`chatFileMentions`) are unaffected.
