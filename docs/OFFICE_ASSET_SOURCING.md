# Office Asset Sourcing

Last updated: 2026-03-06

This doc defines the safe sourcing lane for Office scene assets.

## Allowed shipped licenses

1. CC0 / Public Domain
2. CC BY 4.0

Everything else is out of policy by default.

## Preferred source tiers

### Tier 1: preferred

These sources are the easiest to ship because their licensing is clear and compatible.

1. Quaternius
   - URL: https://quaternius.com/
   - Why: CC0 character, environment, and prop packs.
   - Best current goatherder targets:
     - Universal Base Characters
     - Ultimate Modular Men Pack
2. Kenney
   - URL: https://kenney.nl/assets
   - Why: CC0 props, stylized environment kits, and supporting scene assets.
3. Poly Haven
   - URL: https://polyhaven.com/license
   - Why: CC0 HDRIs, textures, and a smaller set of models.
4. ambientCG
   - URL: https://ambientcg.com/
   - Why: CC0 textures and HDRIs for environment polish.

### Tier 2: allowed for niche gaps

5. Sketchfab
   - URL: https://sketchfab.com/
   - Why: useful for niche animals or custom character fits.
   - Rule: only ship assets explicitly marked CC BY 4.0 or CC0.
6. Poly Pizza
   - URL: https://poly.pizza/
   - Why: useful low-poly model search surface.
   - Rule: mixed-license catalog; verify the exact asset is CC0 before shipping.

## Current asset strategy

### Goat

Use the current shipped goat unless visual testing rejects it:
- Source: https://skfb.ly/osEZ8
- Author: hendrikReyneke
- License: CC BY 4.0
- Runtime path: apps/mission-control/public/assets/office/models/goat-subagent.glb

### Goatherder

Search order:
1. Quaternius CC0 character packs first
2. Kenney CC0 packs for stylized fallback
3. Sketchfab only if the CC0 pass does not produce a believable operator fit

### Office props and supporting details

Search order:
1. Quaternius
2. Kenney
3. Poly Haven / ambientCG for textures or HDRIs
4. Poly Pizza only when the exact asset is verified CC0

## Search terms

- low poly goat
- stylized goat
- goatherd
- shepherd
- farmer
- low poly villager
- farm props
- barn props
- stylized office props
- cc0 glb

## Intake rules

1. Prefer `.glb` where possible.
2. Prefer embedded textures or a minimal texture set.
3. Record source URL, author, license URL, attribution text, and download date before commit.
4. Keep raw zips and extracted source files under `assets/source/`, not `public/`.
5. Do not ship anything with unclear or unverifiable provenance.
