# Agent Note: Rebuild the application icon and brand mark

Status: implemented

English | [中文](2026-08-20-brand-mark-rebuild.zh.md)

## Problem

The application's visual identity was a leftover of the DeepSeek era: `apps/web/public/sterling-icon.png` and the browser favicon used the whale/fish glyph, and the `FishLogo` React component rendered the fish in `currentColor`. The product moved on to the Sterling Harness identity, and a new icon was chosen: a white rounded-square tile with a black woman-profile silhouette (ponytail, wavy hair ends, dress closing at the hem). The PNG shipped at 1454px had to be regenerated from the new artwork, the favicon and the in-GUI brand mark had to follow, and the stale `FishLogo` component (exported but unused by any UI) had to stop presenting the old glyph.

## Decision

Rebuild every brand asset from the user's silhouette artwork (`ChatGPT Image 2026年8月20日 21_17_30.png` — a transparent-background PNG containing only the black silhouette, centered with a ~9% margin):

- **Vectorization.** The black silhouette is extracted from the artwork's alpha mask by marching squares (case table generated mechanically from corner values), the largest loop is simplified with Douglas–Peucker, and the resulting path is normalized into a `512×512` icon space with the silhouette occupying ~68% height, centered both axes (the artwork itself is symmetric top/bottom).
- **Icon design.** A white rounded-square tile (`rx` 115/512 ≈ 22.5%) filled `#FFFFFF` with the silhouette filled `#101010`; the tile keeps a 4px safe margin, and the rendered PNG is transparent outside the tile.
- **Static assets.** `apps/web/public/sterling-icon.png` is replaced with a 1454px render of the new icon (the PWA manifest keeps `1454x1454`). `apps/web/public/favicon.svg` and `website/public/favicon.svg` become the brand mark inlined as vector art (previously the web favicon was an `<image>` alias to the PNG).
- **Component.** `FishLogo.tsx` is renamed to `BrandMark.tsx` and now renders the brand mark as inline SVG (square 1:1, default 24px); `ui-primitives` re-exports it as `BrandMark`. The runtime brand mark in the GUI (`SterlingMark`, which renders `/sterling-icon.png`) picks up the new PNG automatically.
- **Tests.** The `FishLogo` unit test in `icons.client.spec.tsx` is replaced by a `BrandMark` test asserting the tile rect, the single silhouette path, the `512` viewBox, and the brand fills. `pwa-manifest.e2e.ts` now asserts the favicon is inline vector art (`viewBox`, `#FFFFFF`) and no longer aliases the PNG.

The DeepSeek wordmark on the documentation site (`website/public/wordmark.svg`) is intentionally left untouched: it belongs to the DeepSeek documentation brand, separate from the Sterling application identity.

## Alternatives considered

**Ship the PNG only, keep the favicon as an `<image>` alias.** Rejected: inlining the vector keeps the favicon sharp at every size and removes the runtime dependency of the favicon on the PNG file.

**Keep the component named `FishLogo` with the new artwork.** Rejected: the name describes the old glyph, and pre-release the repo prefers correct naming over compatibility shims; the component has no UI consumers, so renaming is cheap.

**Yellow tile, or bottom-touching composition.** Rejected: the user's chosen artwork is a white tile with a centered silhouette; the previous yellow variant (from an earlier design sheet) was superseded after review. Centering the silhouette (rather than copying any clipped-edge crop) keeps the icon safe under OS icon masks.

## Consequences

The favicon changes from a PNG alias to self-contained vector art, so a stale or missing `sterling-icon.png` no longer breaks the tab icon. The GUI brand mark (`SterlingMark` → `/sterling-icon.png`) displays the new icon everywhere it already appears (sidebar rail, empty-state hero) without component changes. The hero "swim" hover animation and the `fish`/`railFish` CSS class names are retained as-is: they are internal style names, and the subtle rotation reads fine on the square mark. The `website` favicon now shows the Sterling mark instead of the DeepSeek whale, while the site's nav wordmark keeps the DeepSeek identity.
