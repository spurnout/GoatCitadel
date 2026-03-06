# GoatCitadel Asset Licenses

This file tracks every external visual/audio asset used by GoatCitadel.

Last updated: 2026-03-06

Allowed shipped asset licenses: **CC0 / Public Domain** and **CC BY 4.0** only.

Disallowed by default:

- CC BY-SA
- CC BY-NC
- CC BY-ND
- editorial-only or marketplace-only licenses
- site-specific "free" licenses that do not clearly allow public redistribution
- any asset with unclear or unverifiable provenance

Note: Mission Control screenshots in `docs/screenshots/mission-control` are generated project artifacts, not third-party licensed assets.

## Tracking Table

| Asset ID | Type | Runtime Path | Source Asset Path | Source URL | Author | License | License URL | Attribution Required | Exact Attribution Text | Downloaded At (UTC) | Modified | Notes |
|---|---|---|---|---|---|---|---|---|---|---|---|---|
| central-operator | 3D model | apps/mission-control/public/assets/office/models/central-operator.glb | assets/source/office/central-operator/ | (pending) | (pending) | CC0 | https://creativecommons.org/publicdomain/zero/1.0/ | No | n/a | (pending) | No | Optional. Procedural fallback active by default until a vetted model is added. |
| goat-subagent | 3D model | apps/mission-control/public/assets/office/models/goat-subagent.glb | assets/source/office/goat-subagent/ | https://skfb.ly/osEZ8 | hendrikReyneke | CC BY 4.0 | http://creativecommons.org/licenses/by/4.0/ | Yes | "Goat" (https://skfb.ly/osEZ8) by hendrikReyneke is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/). | 2026-03-06 | Yes: renamed to `goat-subagent.glb`; runtime keeps the embedded-texture GLB only; loose extracted textures moved out of `public`. | Shipped Office goat model. GLB validates as glTF v2 with embedded textures and no animation track. |
| office-furniture-pack | 3D model | apps/mission-control/public/assets/office/models/office-furniture-pack.glb | assets/source/office/office-furniture-pack/ | (pending) | (pending) | CC0 | https://creativecommons.org/publicdomain/zero/1.0/ | No | n/a | (pending) | No | Optional. Procedural furniture fallback active by default. |
| office-floor | texture | apps/mission-control/public/assets/office/textures/office-floor.png | assets/source/office/office-floor/ | (pending) | (pending) | CC0 | https://creativecommons.org/publicdomain/zero/1.0/ | No | n/a | (pending) | No | Optional texture pack. |

## Office Asset Source Targets

Tier 1: preferred because the licensing is clearly compatible with repo redistribution.

1. Quaternius  
   Character and environment packs with CC0 licensing on the pack pages. Best current goatherder targets:
   - Universal Base Characters
   - Ultimate Modular Men Pack
2. Kenney  
   CC0 packs with broad prop and environment coverage.
3. Poly Haven  
   CC0 HDRIs, textures, and models.
4. ambientCG  
   CC0 textures, HDRIs, and models.

Tier 2: allowed only when the individual asset explicitly matches the repo policy and attribution burden is acceptable.

5. Sketchfab  
   Only use assets explicitly licensed under CC BY 4.0 or CC0, and record full attribution before shipping.
6. Poly Pizza  
   Mixed-license catalog. Use only after verifying that the exact asset is CC0 and not a different Creative Commons variant.

## Verification Rules

1. Do not ship an asset unless its license is explicitly CC0/Public Domain or CC BY 4.0.
2. Every CC BY asset must record creator, source URL, license URL, exact attribution text, modification notes, and download date before commit.
3. If any asset license, source, or provenance is unclear, do not ship it.
4. Procedural fallback meshes must remain available to avoid license lock-in.
5. Keep raw archives and extracted source files outside `public/`; only runtime-needed files belong in the shipped asset tree.

## Current Shipped Attribution-Required Assets

1. `goat-subagent`
   - Attribution: "Goat" (https://skfb.ly/osEZ8) by hendrikReyneke is licensed under Creative Commons Attribution (http://creativecommons.org/licenses/by/4.0/).
   - Source page: https://sketchfab.com/3d-models/goat-2624ac2ce2364930ba2d5f70eb7aa1ea#download
