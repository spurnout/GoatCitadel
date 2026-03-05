# GoatCitadel Asset Licenses

This file tracks every external visual/audio asset used by GoatCitadel.

Last updated: 2026-03-05

License policy: **CC0 only**.

Note: Mission Control screenshots in `docs/screenshots/mission-control` are generated project artifacts, not third-party licensed assets.

## Tracking Table

| Asset ID | Type | Local Path | Source URL | Author | License | Downloaded At (UTC) | Notes |
|---|---|---|---|---|---|---|---|
| central-operator | 3D model | apps/mission-control/public/assets/office/models/central-operator.glb | (pending) | (pending) | CC0 | (pending) | Optional. Procedural fallback active by default. |
| goat-subagent | 3D model | apps/mission-control/public/assets/office/models/goat-subagent.glb | (pending) | (pending) | CC0 | (pending) | Optional. Procedural fallback active by default. |
| office-furniture-pack | 3D model | apps/mission-control/public/assets/office/models/office-furniture-pack.glb | (pending) | (pending) | CC0 | (pending) | Optional. Procedural furniture fallback active by default. |
| office-floor | texture | apps/mission-control/public/assets/office/textures/office-floor.png | (pending) | (pending) | CC0 | (pending) | Optional texture pack. |

## Office V5 Source Targets (CC0-first)

1. Quaternius: stylized low-poly character and environment packs.
2. Poly Pizza: targeted low-poly goat/human/furniture model searches.
3. Kenney: broad CC0 environment and prop coverage.

Backup targets (CC0-only per asset verification): Sketchfab, OpenGameArt.

## Verification Rules

1. Do not add assets unless license is explicitly CC0/public domain.
2. Keep source URL and author recorded before committing binaries.
3. If any asset license is unclear, do not ship it.
4. Procedural fallback meshes must remain available to avoid license block.
